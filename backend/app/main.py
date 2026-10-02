"""Patrata API + web app. Run locally:  uvicorn app.main:app --reload
Website at /, API under /api, interactive API docs at /docs."""
import mimetypes
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from . import agent as AG
from . import assistant as A
from . import config as C
from . import explain as X
from . import approval_v2, model, policy, risk, seed, store
from .rules import input_warnings
from .schemas import (ApplicationIn, AskIn, AskOut, AssistantIn, BatchIn, DecisionOut, Explanation,
                      ReviewIn, SimulateIn)


@asynccontextmanager
async def lifespan(_app):
    store.init()
    model.load()
    risk.load()
    # Sample data is generated in the background so the server answers immediately,
    # which matters on small free hosting where startup time is limited.
    import threading
    threading.Thread(target=seed.seed, daemon=True).start()
    yield


app = FastAPI(title="Patrata — loan pre-screening", version="2.0.0", lifespan=lifespan,
              description="Decision support only. Final credit decisions stay with a human officer.")
app.add_middleware(CORSMiddleware, allow_origins=C.ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"])
api = APIRouter(prefix="/api")
mimetypes.add_type("application/manifest+json", ".webmanifest")

MONEY = {"income_annum", "loan_amount", "residential_assets_value", "commercial_assets_value",
         "luxury_assets_value", "bank_asset_value", "existing_emi_monthly"}


def _bounds(field: str):
    f = ApplicationIn.model_fields.get(field)
    lo = hi = None
    for m in (f.metadata if f else []):
        lo = getattr(m, "ge", getattr(m, "gt", lo))
        hi = getattr(m, "le", hi)
    return lo, hi


def _friendly(field: str, e: dict) -> str:
    """Plain-English error per field instead of Pydantic's wording (E-Q2)."""
    t = e["type"]
    if t == "missing":
        return "Required"
    if t.endswith("_parsing") or t == "int_from_float":
        return "Enter a whole number" if "int" in t else "Enter a number"
    if field in MONEY:
        if t in ("less_than_equal", "less_than"):
            return "That amount looks too large. Check the number of digits."
        return "Enter an amount above zero" if t == "greater_than" else "Can't be negative"
    lo, hi = _bounds(field)
    if lo is not None and hi is not None and t in ("less_than_equal", "greater_than_equal",
                                                   "less_than", "greater_than"):
        return f"Enter a value from {lo:g} to {hi:g}"
    return e["msg"].replace("Value error, ", "")


def _errors(errs) -> list[dict]:
    out = []
    for e in errs:
        field = ".".join(str(p) for p in e["loc"] if p != "body") or "application"
        out.append({"field": field, "message": _friendly(field, e)})
    return out


@app.exception_handler(RequestValidationError)
async def validation_error(_, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"errors": _errors(exc.errors())})


def _record(body: ApplicationIn, meta: dict) -> dict:
    result = policy.assess(body)
    return DecisionOut(id=uuid.uuid4().hex[:12], **result, warnings=input_warnings(body),
                       application=body.model_dump(exclude={"request_id"}),
                       model_version=meta["model_version"],
                       created_at=datetime.now(timezone.utc).isoformat()).model_dump()


def _get_or_404(app_id: str) -> dict:
    r = store.get(app_id)
    if not r:
        raise HTTPException(404, "No application with that id.")
    return r


# ---------------- health and transparency ----------------
@api.get("/health")
def health():
    _, meta = model.load()
    return {"status": "ok", "model_version": meta["model_version"], "llm_configured": bool(C.LLM_API_KEY),
            "llm_provider": C.LLM_LABEL, "llm_model": X._MODEL or (C.LLM_MODELS[0] if C.LLM_MODELS else "auto")}


@api.get("/llm-check")
def llm_check():
    """Open once after deploying to confirm the AI key works."""
    return X.llm_check()


@api.get("/model-card")
def model_card():
    _, meta = model.load()
    return {
        **{k: meta[k] for k in ("model_version", "data_source", "data_audit", "metrics",
                                "fairness_outcome_parity", "global_importance", "limitations",
                                "monotone_constraints", "training_ranges", "labels")},
        "policy": {"age": [C.AGE_MIN, C.AGE_MAX], "cibil_hard_floor": C.CIBIL_HARD_FLOOR,
                   "cibil_soft_floor": C.CIBIL_SOFT_FLOOR, "foir_soft_cap": C.FOIR_SOFT_CAP,
                   "foir_hard_cap": C.FOIR_HARD_CAP, "approve_at": C.APPROVE_AT,
                   "decline_below": C.DECLINE_BELOW},
        "llm": {"provider": C.LLM_LABEL, "model": X._MODEL or (C.LLM_MODELS[0] if C.LLM_MODELS else "auto"),
                "role": "explanations and assistant answers only",
                "data_sent": "derived figures and rule results; no names, IDs or contact details"},
        "assistant_retrieval_eval": A.retrieval_eval(),
        "approval_v2": {k: approval_v2.load()[1][k] for k in ("model_version", "data_source", "rows_in_source", "decided_rows",
                                                                 "training_rows", "metrics", "fairness_mean_predicted_approval",
                                                                 "global_importance", "labels", "leakage_checks", "not_covered")},
        "risk_model": {k: risk.load()[1][k] for k in ("model_version", "data_source", "rows", "base_default_rate",
                                                      "bands", "metrics", "fairness_mean_predicted_risk",
                                                      "global_importance", "labels", "excluded_on_purpose",
                                                      "previous_version", "no_history_default_rate", "with_history_default_rate")},
    }


@api.get("/products")
def product_book():
    """The product book: every product, variant, its criteria, and where each number comes from."""
    from . import products
    return products.book()


@api.get("/stats")
def stats(days: int = Query(14, ge=7, le=60)):
    return store.stats(days)


# ---------------- scoring ----------------
@api.post("/score", response_model=DecisionOut)
def score(body: ApplicationIn):
    existing = store.by_request(body.request_id)
    if existing:                      # double-submit or retry: same answer, no new record
        return existing
    _, meta = model.load()
    out = _record(body, meta)
    store.save(out["id"], body.request_id, body.model_dump(), out, meta["model_version"], out["created_at"])
    return store.get(out["id"])


@api.post("/simulate")
def simulate(body: SimulateIn):
    """What-if simulator: same pipeline, nothing saved."""
    r = policy.assess(body, with_counterfactual=False)
    return {k: r[k] for k in ("decision", "approval_probability", "foir", "emi_estimate", "flags",
                              "rule_checks", "drivers", "reasons")}


@api.post("/batch")
def batch(body: BatchIn):
    """Score up to 500 applications in one call (E-Q6). Invalid rows are reported, not dropped silently."""
    rows, counts = [], {"APPROVE": 0, "REFER": 0, "DECLINE": 0, "INVALID": 0}
    for i, raw in enumerate(body.rows):
        try:
            app_in = SimulateIn(**{k: v for k, v in raw.items() if k != "request_id"})
        except ValidationError as e:
            counts["INVALID"] += 1
            rows.append({"row": i + 1, "ref": raw.get("ref", ""), "valid": False,
                         "errors": _errors(e.errors())})
            continue
        r = policy.assess(app_in)
        counts[r["decision"]] += 1
        rows.append({"row": i + 1, "ref": raw.get("ref", ""), "valid": True, "decision": r["decision"],
                     "approval_probability": r["approval_probability"], "foir": r["foir"],
                     "emi_estimate": r["emi_estimate"], "reason": r["reasons"][0] if r["reasons"] else "",
                     "suggested_change": r["counterfactual"].summary, "flags": r["flags"]})
    return {"summary": counts, "rows": rows}


# ---------------- applications and reviews ----------------
@api.get("/applications", response_model=list[DecisionOut])
def history(limit: int = Query(50, ge=1, le=500), decision: str | None = None, status: str | None = None):
    return store.recent(limit, decision, status)


@api.get("/applications/{app_id}", response_model=DecisionOut)
def get_application(app_id: str):
    return _get_or_404(app_id)


@api.post("/applications/{app_id}/review", response_model=DecisionOut)
def review(app_id: str, body: ReviewIn):
    _get_or_404(app_id)
    store.save_review(app_id, body.final_decision, body.note.strip(), body.reviewer.strip())
    return store.get(app_id)


@api.get("/applications/{app_id}/kfs")
def kfs(app_id: str):
    """Key Fact Statement figures for the requested loan: EMI, total interest, processing fee and APR."""
    return AG.tool_loan_cost(_get_or_404(app_id), {})


@api.post("/applications/{app_id}/review-agent")
def review_agent(app_id: str):
    """AI agent that tests options with tools and drafts a memo. It advises; a person decides."""
    return AG.review(_get_or_404(app_id))


@api.get("/reviews/queue", response_model=list[DecisionOut])
def review_queue():
    return store.review_queue()


# ---------------- AI: explanation, per-case questions, assistant ----------------
@api.post("/applications/{app_id}/explain", response_model=Explanation)
def explain(app_id: str, lang: str = Query("en", pattern="^(en|hi)$")):
    r = _get_or_404(app_id)
    cached = store.cached_explanation(app_id, lang)
    if cached:
        return cached
    out = X.explain(r, lang)
    if out["source"] == "llm":
        store.cache_explanation(app_id, lang, out)
    return out


@api.post("/applications/{app_id}/ask", response_model=AskOut)
def ask(app_id: str, body: AskIn):
    return X.ask(_get_or_404(app_id), body.question, body.language)


@api.post("/assistant")
def assistant(body: AssistantIn):
    return A.answer(body.question, [t.model_dump() for t in body.history], body.language)


app.include_router(api)


# ---------------- web app (single-page app built from /frontend) ----------------
if (C.STATIC_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=C.STATIC_DIR / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    if path.startswith("api/"):
        raise HTTPException(404, "Not found")
    f = C.STATIC_DIR / path
    if path and f.is_file() and C.STATIC_DIR in f.resolve().parents:
        return FileResponse(f)
    return FileResponse(C.STATIC_DIR / "index.html")
