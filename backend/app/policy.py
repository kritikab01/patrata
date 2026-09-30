"""Combines policy rules and the model into one decision. The LLM is never called
here: the decision is fully deterministic and reproducible."""
from . import config as C
from . import model
from .rules import foir, inr, run_rules
from .schemas import ApplicationIn, Counterfactual, RuleCheck


def pct(p: float) -> str:
    """Never display 100% or 0%: a model is never certain."""
    if p >= 0.9995:
        return ">99.9%"
    if p <= 0.0005:
        return "<0.1%"
    return f"{p * 100:.1f}%"


def decide(p: float, checks: list[RuleCheck], ood: list[str]) -> tuple[str, list[str], list[str]]:
    hard = [c for c in checks if c.status == "fail"]
    soft = [c for c in checks if c.status == "refer"]
    reasons, flags = [], []

    if hard:
        reasons = [f"{c.label}: {c.detail}" for c in hard]
        if p >= C.APPROVE_AT:
            flags.append("model_policy_conflict")
            reasons.append(f"The model alone would approve ({pct(p)}), but policy rules take priority.")
        return "DECLINE", reasons, flags

    if ood:
        flags.append("outside_training_range")
        reasons = [f"{c.label}: {c.detail}" for c in soft]
        reasons.append("These inputs are outside what the model was trained on: "
                       + ", ".join(ood) + ". A credit officer should review.")
        return "REFER", reasons, flags

    if p >= C.APPROVE_AT and not soft:
        return "APPROVE", [f"All policy checks pass and the model's approval likelihood is {pct(p)}."], flags

    if p < C.DECLINE_BELOW and soft:
        reasons = [f"{c.label}: {c.detail}" for c in soft]
        reasons.append(f"The model's approval likelihood is low ({pct(p)}).")
        return "DECLINE", reasons, flags

    reasons = [f"{c.label}: {c.detail}" for c in soft]
    if p >= C.APPROVE_AT and soft:
        flags.append("model_policy_conflict")
        reasons.append(f"The model would approve ({pct(p)}), but a policy check needs a human look.")
    elif p < C.DECLINE_BELOW and not soft:
        flags.append("model_policy_conflict")
        reasons.append(f"All policy checks pass, but the model's approval likelihood is low ({pct(p)}).")
    elif not reasons:
        reasons.append(f"The model's approval likelihood ({pct(p)}) is in the uncertain middle band.")
    return "REFER", reasons, flags


def counterfactual(app: ApplicationIn, decision: str, checks: list[RuleCheck]) -> Counterfactual:
    if decision == "APPROVE":
        return Counterfactual(possible=True, loan_amount=app.loan_amount, loan_term=app.loan_term,
                              summary="No change needed.")
    blocking = [c for c in checks if c.id in ("age", "cibil") and c.status != "pass"]
    if blocking:
        b = blocking[0]
        what = {"age": "applicant's age", "cibil": "CIBIL score"}[b.id]
        why = "is outside policy" if b.status == "fail" else "needs a credit officer's review"
        return Counterfactual(possible=False, summary=(
            f"Changing the loan amount or term won't help here: the {what} ({b.value}) {why}."))

    fractions = [1.0 - 0.05 * k for k in range(0, 15)]   # 100% down to 30%
    terms = sorted({app.loan_term, *range(2, 21, 2)}, key=lambda t: (abs(t - app.loan_term), t))
    cands = [{"loan_amount": round(app.loan_amount * f, -3), "loan_term": t}
             for f in fractions for t in terms]
    probs = model.predict(app, cands)
    for cand, p in zip(cands, probs):          # largest amount first, then term closest to the request
        if p < C.APPROVE_AT:
            continue
        checks_c = run_rules(app, cand["loan_amount"], cand["loan_term"])
        if any(c.status != "pass" for c in checks_c):
            continue
        d, _, _ = decide(float(p), checks_c, model.out_of_range(app.model_copy(update=cand)))
        if d == "APPROVE":
            same_amount = cand["loan_amount"] == round(app.loan_amount, -3)
            if same_amount:
                s = f"Changing the term to {cand['loan_term']} years would clear all checks."
            elif cand["loan_term"] == app.loan_term:
                s = f"Reducing the amount to {inr(cand['loan_amount'])} would clear all checks."
            else:
                s = (f"Reducing the amount to {inr(cand['loan_amount'])} over "
                     f"{cand['loan_term']} years would clear all checks.")
            return Counterfactual(possible=True, loan_amount=cand["loan_amount"],
                                  loan_term=cand["loan_term"], summary=s)
    ood = model.out_of_range(app)
    if ood:
        return Counterfactual(possible=False, summary=(
            "Some inputs are outside what the model was trained on (" + ", ".join(ood)
            + "), so it can't suggest a reliable change. A credit officer should review."))
    return Counterfactual(possible=False, summary=(
        "No combination of a smaller amount (down to 30%) or a different term reaches approval. "
        "A credit officer should review."))


def assess(app: ApplicationIn, with_counterfactual: bool = True) -> dict:
    p = float(model.predict(app)[0])
    checks = run_rules(app)
    ood = model.out_of_range(app)
    decision, reasons, flags = decide(p, checks, ood)
    new_emi, ratio = foir(app)
    return {
        "decision": decision,
        "approval_probability": round(p, 4),
        "reasons": reasons,
        "rule_checks": checks,
        "drivers": model.drivers(app),
        "counterfactual": (counterfactual(app, decision, checks) if with_counterfactual
                           else Counterfactual(possible=False, summary="")),
        "flags": flags,
        "emi_estimate": round(new_emi, 2),
        "foir": round(ratio, 4),
    }
