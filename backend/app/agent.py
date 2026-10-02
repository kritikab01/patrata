"""Review Agent: helps a credit manager with a referred or flagged case.

How it works (an agent = LLM + tools + loop):
  1. The LLM sees the case and a list of tools, and replies with JSON: either a tool to call next,
     or its final memo.
  2. Our code runs the tool (re-score with changes, look up policy, work out loan cost) and feeds
     the result back. Up to 4 tool calls.
  3. The memo is checked: every number must come from the case or a tool result, and it can't
     recommend a plain approval when a hard policy rule failed.
The agent only advises. The credit manager still records the decision. Without an AI key, or if
the AI misbehaves, a scripted plan runs the same tools so the manager always gets a memo.
"""
import json

from . import assistant as A
from . import explain as X
from . import policy, risk
from .rules import emi, inr
from .schemas import ApplicationIn

MAX_STEPS = 4
TOOLS = {
    "simulate": "Re-score this application with changes. args: loan_amount (rupees), loan_term (years), "
                "existing_emi_monthly (rupees). Leave out any arg to keep its current value.",
    "lookup_policy": "Search Patrata's policy notes. args: topic (a few words).",
    "loan_cost": "Full cost of a loan option. args: loan_amount (rupees), loan_term (years). "
                 "Uses the application's interest rate and a 1% processing fee.",
}
RECS = ("APPROVE", "APPROVE_WITH_CONDITIONS", "DECLINE", "NEEDS_MORE_INFO")

SYSTEM = """You are Patrata's credit review agent. A credit manager wants a short review memo for one loan application.
Work step by step with the tools listed in the input. Reply with JSON only, in one of two shapes:
{"thought": "why this step", "action": "simulate | lookup_policy | loan_cost", "args": {...}}
{"thought": "why you are done", "final": {"recommendation": "APPROVE | APPROVE_WITH_CONDITIONS | DECLINE | NEEDS_MORE_INFO",
  "summary": "one or two sentences", "conditions": ["..."], "reasons": ["..."], "risks": ["..."]}}
Rules:
- Use at most 4 tool calls, and run "simulate" at least once before your final answer.
- Use only numbers that appear in the case or in tool observations. Copy them exactly.
- Never recommend APPROVE when a policy check has the result "fail"; use conditions or DECLINE instead.
- You advise; the credit manager decides. Plain, professional English."""


def _app(r: dict) -> ApplicationIn:
    return ApplicationIn(request_id="agent-review", **r["application"])


def tool_simulate(r: dict, args: dict) -> dict:
    a = r["application"]
    ch = {}
    if "loan_amount" in args:
        ch["loan_amount"] = round(min(max(float(args["loan_amount"]), a["loan_amount"] * 0.3), a["loan_amount"] * 1.5), -3)
    if "loan_term" in args:
        ch["loan_term"] = int(min(max(float(args["loan_term"]), 1), 30))
    if "existing_emi_monthly" in args:
        ch["existing_emi_monthly"] = max(0.0, min(float(args["existing_emi_monthly"]), a["income_annum"] / 12 * 0.9))
    try:
        app = ApplicationIn(request_id="agent-sim", **{**a, **ch})
    except ValueError as e:
        return {"error": str(e).split("\n")[-1][:160]}
    s = policy.assess(app, with_counterfactual=False)
    return {
        "changes": {k: inr(v) if k != "loan_term" else f"{v} years" for k, v in ch.items()} or "none",
        "decision": s["decision"],
        "approval_likelihood": policy.pct(s["approval_probability"]),
        "new_emi": inr(s["emi_estimate"]),
        "emi_burden": f"{s['foir'] * 100:.1f}%",
        "repayment_risk": f"{s['repayment_risk']['probability'] * 100:.1f}% ({s['repayment_risk']['band']})",
        "checks_needing_attention": [f"{c.label}: {c.value}" for c in s["rule_checks"] if c.status != "pass"],
    }


def tool_lookup_policy(_r: dict, args: dict) -> dict:
    hits = A.retrieve(str(args.get("topic", ""))[:120], k=1)
    return {"title": hits[0]["title"], "text": hits[0]["text"][:600]} if hits else {"result": "nothing found"}


def tool_loan_cost(r: dict, args: dict) -> dict:
    a = r["application"]
    p = float(args.get("loan_amount", a["loan_amount"]))
    years = int(min(max(float(args.get("loan_term", a["loan_term"])), 1), 30))
    rate, n = a["annual_rate"], years * 12
    e = emi(p, rate, years)
    fee = round(p * 0.01)
    lo, hi = 0.0, 1.0                     # APR: monthly IRR on (amount - fee) vs the EMI stream, by bisection
    for _ in range(60):
        mid = (lo + hi) / 2
        pv = e * (1 - (1 + mid) ** -n) / mid if mid else e * n
        lo, hi = (mid, hi) if pv > p - fee else (lo, mid)
    return {"loan_amount": inr(p), "tenure": f"{years} years", "interest_rate": f"{rate:g}%", "monthly_emi": inr(e),
            "total_interest": inr(e * n - p), "processing_fee": inr(fee), "apr_including_fee": f"{lo * 1200:.2f}%"}


RUN = {"simulate": tool_simulate, "lookup_policy": tool_lookup_policy, "loan_cost": tool_loan_cost}


def _guard(memo: dict, r: dict, note: list) -> dict:
    rec = str(memo.get("recommendation", "")).upper().replace(" ", "_")
    memo["recommendation"] = rec if rec in RECS else "NEEDS_MORE_INFO"
    if memo["recommendation"] == "APPROVE" and any(c["status"] == "fail" for c in r["rule_checks"]):
        memo["recommendation"] = "APPROVE_WITH_CONDITIONS" if r["counterfactual"].get("possible") else "DECLINE"
        note.append("Policy guard changed a plain approval, because a hard policy check failed.")
    for k in ("conditions", "reasons", "risks"):
        memo[k] = [str(x) for x in memo.get(k, [])][:5] if isinstance(memo.get(k), list) else []
    memo["summary"] = str(memo.get("summary", ""))[:400]
    return memo


def scripted(r: dict) -> dict:
    """The same tools, run by a fixed plan. Used without an AI key or when the AI fails."""
    a, cf, steps = r["application"], r["counterfactual"], []
    def do(tool, args, thought):
        steps.append({"thought": thought, "action": tool, "args": args, "observation": RUN[tool](r, args)})
        return steps[-1]["observation"]
    if cf.get("possible") and cf.get("loan_amount") and r["decision"] != "APPROVE":
        best = do("simulate", {"loan_amount": cf["loan_amount"], "loan_term": cf["loan_term"]}, "Test the suggested change.")
        option = {"loan_amount": cf["loan_amount"], "loan_term": cf["loan_term"]}
    else:
        best = do("simulate", {"loan_amount": round(a["loan_amount"] * 0.8, -3)}, "See whether a 20% smaller loan helps.")
        option = {"loan_amount": round(a["loan_amount"] * 0.8, -3), "loan_term": a["loan_term"]}
    flagged = [c for c in r["rule_checks"] if c["status"] != "pass"]
    if flagged:
        do("lookup_policy", {"topic": flagged[0]["label"]}, f"Check policy on {flagged[0]['label']}.")
    cost = do("loan_cost", option, "Work out the full cost of the best option.")
    ids = {c["id"]: c for c in flagged}
    hard = [c for c in r["rule_checks"] if c["status"] == "fail" and c["id"] in ("age", "cibil")]
    if hard:
        memo = {"recommendation": "DECLINE", "summary": f"{hard[0]['label']} ({hard[0]['value']}) is outside policy.",
                "conditions": [], "reasons": [hard[0]["detail"]], "risks": []}
    elif "employment" in ids:
        memo = {"recommendation": "NEEDS_MORE_INFO", "summary": "Income must be verified before any decision.",
                "conditions": ["Collect 6 months of bank statements and proof of income"], "reasons": [ids["employment"]["detail"]], "risks": []}
    elif best.get("decision") == "APPROVE" and r["decision"] != "APPROVE":
        memo = {"recommendation": "APPROVE_WITH_CONDITIONS",
                "summary": f"Approvable at {best['changes'].get('loan_amount', inr(a['loan_amount']))} with EMI {best['new_emi']}.",
                "conditions": [f"Revise the loan to {cost['loan_amount']} over {cost['tenure']}"],
                "reasons": [f"EMI burden falls to {best['emi_burden']}", f"Repayment risk {best['repayment_risk']}"], "risks": []}
    elif "cibil" in ids or "repayment" in ids:
        c = ids.get("cibil") or ids.get("repayment")
        memo = {"recommendation": "NEEDS_MORE_INFO", "summary": f"{c['label']} ({c['value']}) needs a closer look.",
                "conditions": ["Review the full bureau report and recent repayment behaviour",
                               "Consider a co-applicant with stable income"], "reasons": [c["detail"]], "risks": []}
    else:
        memo = {"recommendation": "APPROVE", "summary": "All checks pass on review.", "conditions": [], "reasons": [], "risks": []}
    memo["risks"] = [f"As originally requested, repayment risk was {r['repayment_risk']['probability'] * 100:.1f}% ({r['repayment_risk']['band']})"] if r.get("repayment_risk") else []
    return {"steps": steps, "memo": _guard(memo, r, []), "source": "scripted", "notes": []}


def review(r: dict, llm=X.call_llm) -> dict:
    from . import config as C
    if not C.LLM_API_KEY and llm is X.call_llm:
        return scripted(r)
    money = ("income_annum", "loan_amount", "existing_emi_monthly", "property_value", "asset_price")
    case = {**X.build_facts(r), "application": {k: (inr(v) if "value" in k or k in money else v)
                                                for k, v in r["application"].items() if v is not None}}
    steps, notes = [], []
    for _ in range(MAX_STEPS + 1):
        payload = {"tools": TOOLS, "case": case,
                   "steps_so_far": [{"action": s["action"], "args": s["args"], "observation": s["observation"]} for s in steps]}
        try:
            raw = llm(SYSTEM + "\nReturn JSON only.", json.dumps(payload, ensure_ascii=False))
            out = json.loads(raw.strip().removeprefix("```json").removesuffix("```").strip())
        except Exception:  # noqa: BLE001
            notes.append("The AI step failed, so the scripted review ran instead.")
            break
        if "final" in out:
            if not any(s["action"] == "simulate" for s in steps):
                notes.append("The AI tried to finish without testing any change, so the scripted review ran instead.")
                break
            memo = out["final"] if isinstance(out["final"], dict) else {}
            facts = {"case": case, "obs": [s["observation"] for s in steps]}
            if not X.numbers_ok(json.dumps(memo, ensure_ascii=False), facts):
                notes.append("The AI's memo used a number no tool produced, so the scripted memo is shown.")
                break
            return {"steps": steps, "memo": _guard(memo, r, notes), "source": "llm", "notes": notes}
        action, args = out.get("action"), out.get("args") if isinstance(out.get("args"), dict) else {}
        if action not in RUN or len(steps) >= MAX_STEPS:
            notes.append(f"The AI asked for an unavailable step ({action}), so the scripted review ran instead.")
            break
        steps.append({"thought": str(out.get("thought", ""))[:200], "action": action, "args": args,
                      "observation": RUN[action](r, args)})
    fb = scripted(r)
    fb["notes"] = notes
    fb["ai_steps"] = steps
    return fb
