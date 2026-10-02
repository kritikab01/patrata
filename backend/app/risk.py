"""Repayment-risk model (trained on 307,511 real Home Credit loans). It estimates the chance that
the borrower will have payment difficulties. It adds a second, real-data opinion to the approval
model; it never declines anyone on its own."""
import json
from functools import lru_cache

import numpy as np
import pandas as pd
import xgboost as xgb

from . import config as C
from .risk_features import EMPLOYMENT_LABELS, RISK_FEATURES, RISK_LABELS, risk_frame
from .rules import emi

MODEL_PATH = C.ARTIFACT_DIR / "risk_model.json"
META_PATH = C.ARTIFACT_DIR / "risk_metadata.json"


@lru_cache(maxsize=1)
def load():
    b = xgb.Booster()
    b.load_model(str(MODEL_PATH))
    return b, json.loads(META_PATH.read_text())


def _rows(app, overrides: list[dict] | None = None) -> pd.DataFrame:
    base = app.model_dump()
    rows = []
    for o in (overrides or [{}]):
        a = {**base, **o}
        pay = emi(a["loan_amount"], a["annual_rate"], a["loan_term"]) * 12 / a["income_annum"]
        ntc = bool(a.get("no_credit_history"))
        hist = 0.0 if ntc else (a.get("credit_history_years") if a.get("credit_history_years") is not None else C.DEFAULT_HISTORY_YEARS)
        rows.append({"payment_to_income": min(pay, 1.5), "age": a["age"], "years_in_job": a["years_in_job"],
                     "employment_type": a["employment_type"], "no_of_dependents": a["no_of_dependents"],
                     "owns_home": int(a["residential_assets_value"] > 0), "owns_vehicle": int(a["luxury_assets_value"] > 0),
                     "active_loans": min(a.get("existing_loans_count", 0), 20),
                     "debt_to_income": min(a.get("outstanding_debt", 0) / (a["income_annum"] / 12), 60),
                     "overdue_now": float(bool(a.get("overdue_now"))), "credit_history_years": min(hist, 40),
                     "new_loans_12m": min(a.get("new_loans_12m", 0), 10), "no_credit_history": float(ntc)})
    return risk_frame(pd.DataFrame(rows))


def probability(app, overrides: list[dict] | None = None) -> np.ndarray:
    b, _ = load()
    return b.predict(xgb.DMatrix(_rows(app, overrides), feature_names=RISK_FEATURES))


def band(p: float) -> str:
    _, meta = load()
    return "high" if p >= meta["bands"]["high_from"] else "low" if p < meta["bands"]["low_below"] else "medium"


def assess(app) -> dict:
    b, meta = load()
    X = _rows(app)
    p = float(b.predict(xgb.DMatrix(X, feature_names=RISK_FEATURES))[0])
    contrib = b.predict(xgb.DMatrix(X, feature_names=RISK_FEATURES), pred_contribs=True)[0][:-1]
    row = X.iloc[0]
    fmt = {"debt_to_income": lambda v: f"{v:.1f}x", "credit_history_years": lambda v: f"{v:g} years", "active_loans": lambda v: f"{v:.0f}",
           "new_loans_12m": lambda v: f"{v:.0f}", "overdue_now": lambda v: "Yes" if v else "No", "no_credit_history": lambda v: "Yes" if v else "No",
           "payment_to_income": lambda v: f"{v * 100:.0f}%", "age": lambda v: f"{v:.0f} years",
           "years_in_job": lambda v: f"{v:g} years", "no_of_dependents": lambda v: f"{v:.0f}",
           "owns_home": lambda v: "Yes" if v else "No", "owns_vehicle": lambda v: "Yes" if v else "No"}
    drivers = []
    for i in np.argsort(-np.abs(contrib)):
        f = RISK_FEATURES[i]
        if abs(contrib[i]) < 0.01 or ((f.startswith("emp_") or f in ("overdue_now", "no_credit_history")) and not row[f]):
            continue
        drivers.append({"feature": f, "label": RISK_LABELS[f],
                        "value": fmt[f](row[f]) if f in fmt else "Yes",
                        "impact": round(float(contrib[i]), 3),
                        "direction": "raises_risk" if contrib[i] > 0 else "lowers_risk"})
    return {"probability": round(p, 4), "band": band(p), "base_rate": meta["base_default_rate"],
            "relative": round(p / meta["base_default_rate"], 2), "drivers": drivers[:5],
            "employment": EMPLOYMENT_LABELS[app.employment_type], "model_version": meta["model_version"]}
