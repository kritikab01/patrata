"""Combines policy rules and the model into one decision. The LLM is never called
here: the decision is fully deterministic and reproducible."""
from . import config as C
from . import model, products, risk
from .rules import foir, inr, run_rules
from .schemas import ApplicationIn, Counterfactual, RuleCheck


def pct(p: float | None) -> str:
    """Never display 100% or 0%: a model is never certain."""
    if p is None:
        return "not scored (no credit history)"
    if p >= 0.9995:
        return ">99.9%"
    if p <= 0.0005:
        return "<0.1%"
    return f"{p * 100:.1f}%"


def decide(p: float | None, checks: list[RuleCheck], ood: list[str]) -> tuple[str, list[str], list[str]]:
    hard = [c for c in checks if c.status == "fail"]
    if p is None:   # first-time borrower: no CIBIL, so the approval model isn't used; a human assesses income
        if hard:
            return "DECLINE", [f"{c.label}: {c.detail}" for c in hard], ["new_to_credit"]
        return "REFER", [f"{c.label}: {c.detail}" for c in checks if c.status != "pass"], ["new_to_credit"]
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
    if app.no_credit_history:
        return Counterfactual(possible=False, summary=(
            "Verify income with recent bank statements and salary slips. A smaller first loan, or a co-applicant "
            "with a credit history, makes approval easier and starts building the applicant's record."))
    if any(c.id == "employment" for c in checks):
        return Counterfactual(possible=False, summary=(
            "Income has to be verified by a credit officer first; changing the amount or term won't settle that."))
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
    risks = risk.probability(app, cands)       # one batch for every variation, not one call each
    for cand, p, rp in zip(cands, probs, risks):   # largest amount first, then term closest to the request
        if p < C.APPROVE_AT:
            continue
        checks_c = run_rules(app, cand["loan_amount"], cand["loan_term"], risk_p=float(rp))
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


def decide_product(p: float | None, checks: list[RuleCheck]) -> tuple[str, list[str], list[str]]:
    """Variant rules are the main gate. The approval model votes only when it was used (p is not None)."""
    hard = [c for c in checks if c.status == "fail"]
    soft = [c for c in checks if c.status == "refer"]
    flags = []
    if hard:
        reasons = [f"{c.label}: {c.detail}" for c in hard]
        if p is not None and p >= C.APPROVE_AT:
            flags.append("model_policy_conflict")
            reasons.append(f"The approval model alone would approve ({pct(p)}), but this variant's rules take priority.")
        return "DECLINE", reasons, flags
    if p is None:
        if soft:
            return "REFER", [f"{c.label}: {c.detail}" for c in soft], flags
        return "APPROVE", ["Every check for this variant passes."], flags
    if p >= C.APPROVE_AT and not soft:
        return "APPROVE", [f"Every check for this variant passes and the approval model gives {pct(p)}."], flags
    if p < C.DECLINE_BELOW and soft:
        return "DECLINE", [f"{c.label}: {c.detail}" for c in soft] + [f"The approval model's likelihood is low ({pct(p)})."], flags
    reasons = [f"{c.label}: {c.detail}" for c in soft]
    if p >= C.APPROVE_AT and soft:
        flags.append("model_policy_conflict")
        reasons.append(f"The model would approve ({pct(p)}), but a check for this variant needs a human look.")
    elif p < C.DECLINE_BELOW and not soft:
        flags.append("model_policy_conflict")
        reasons.append(f"Every check for this variant passes, but the approval model's likelihood is low ({pct(p)}).")
    elif not reasons:
        reasons.append(f"The approval model is unsure ({pct(p)}), so a credit officer should look.")
    return "REFER", reasons, flags


def counterfactual_product(app: ApplicationIn, v: dict, decision: str, checks: list[RuleCheck], model_used: bool) -> Counterfactual:
    if decision == "APPROVE":
        return Counterfactual(possible=True, loan_amount=app.loan_amount, loan_term=app.loan_term, summary="No change needed.")
    fixed = {"employment": "this variant isn't offered for this employment type", "age": "the applicant is below the minimum age",
             "income": "income is below this variant's minimum", "cibil": "the credit score needs a decision first",
             "job_years": "job or business history needs checking first"}
    for c in checks:
        if c.id in fixed and c.status != "pass" and not (c.id == "cibil" and c.status == "refer" and app.cibil_score is None and False):
            return Counterfactual(possible=False, summary=f"Changing the amount or tenure won't help: {fixed[c.id]}.")
    crit = v["criteria"]
    months = sorted(products.tenure_grid(v), key=lambda m: (abs(m - app.loan_term * 12), m))
    cands = []
    for f in [1.0 - 0.05 * k for k in range(15)]:
        amt = round(app.loan_amount * f, -3)
        if amt < crit["amount_min"]:
            break
        cands += [{"loan_amount": min(amt, crit["amount_max"]), "loan_term": m / 12} for m in months]
    if not cands:
        return Counterfactual(possible=False, summary="No smaller amount fits this variant's limits. A credit officer should review.")
    probs = model.predict(app, cands) if model_used else [None] * len(cands)
    risks = risk.probability(app, cands)
    for cand, p, rp in zip(cands, probs, risks):
        if model_used and p < C.APPROVE_AT:
            continue
        ch = products.evaluate(app, v, cand["loan_amount"], cand["loan_term"], risk_p=float(rp))
        if all(c.status == "pass" for c in ch):
            m = round(cand["loan_term"] * 12)
            when = f"{m} months" if m < 36 else f"{cand['loan_term']:g} years"
            same = cand["loan_amount"] == round(app.loan_amount, -3)
            s = (f"Changing the tenure to {when} would clear every check." if same else
                 f"Reducing the amount to {inr(cand['loan_amount'])} over {when} would clear every check.")
            return Counterfactual(possible=True, loan_amount=cand["loan_amount"], loan_term=cand["loan_term"], summary=s)
    return Counterfactual(possible=False, summary="No smaller amount or different tenure within this variant's limits clears every check. A credit officer should review.")


def assess(app: ApplicationIn, with_counterfactual: bool = True) -> dict:
    if app.variant:
        return assess_product(app, with_counterfactual)
    return assess_generic(app, with_counterfactual)


def assess_product(app: ApplicationIn, with_counterfactual: bool = True) -> dict:
    prod, v = products.get(app.variant)
    ood = [] if app.no_credit_history else model.out_of_range(app)
    model_used = not app.no_credit_history and not ood
    p = float(model.predict(app)[0]) if model_used else None
    note = None if model_used else ("Not used: no CIBIL score." if app.no_credit_history else
                                    "Not used: this loan is outside the data the approval model learned from (" + ", ".join(ood) + ").")
    checks = products.evaluate(app, v)
    decision, reasons, flags = decide_product(p, checks)
    if app.no_credit_history:
        flags.append("new_to_credit")
    if not model_used:
        flags.append("approval_model_not_used")
    e = products.emi_detail(app, v)
    f = next(c for c in checks if c.id == "foir")
    return {
        "decision": decision, "approval_probability": None if p is None else round(p, 4), "reasons": reasons,
        "rule_checks": checks, "drivers": model.drivers(app) if model_used else [],
        "counterfactual": (counterfactual_product(app, v, decision, checks, model_used) if with_counterfactual
                           else Counterfactual(possible=False, summary="")),
        "flags": flags, "emi_estimate": round(e["emi"], 2),
        "repayment_risk": risk.assess(app),
        "foir": round(float(f.value.rstrip("%")) / 100, 4),
        "product_name": prod["name"], "variant_name": v["name"], "approval_model_note": note,
        "other_variants": products.matching_variants(app, exclude=v["id"]) if with_counterfactual and decision != "APPROVE" else [],
        "emi_detail": {k: round(val, 2) if isinstance(val, float) else val for k, val in e.items()},
    }


def assess_generic(app: ApplicationIn, with_counterfactual: bool = True) -> dict:
    ntc = app.no_credit_history
    p = None if ntc else float(model.predict(app)[0])
    checks = run_rules(app)
    ood = [] if ntc else model.out_of_range(app)
    decision, reasons, flags = decide(p, checks, ood)
    new_emi, ratio = foir(app)
    return {
        "decision": decision,
        "approval_probability": None if p is None else round(p, 4),
        "reasons": reasons,
        "rule_checks": checks,
        "drivers": [] if ntc else model.drivers(app),
        "counterfactual": (counterfactual(app, decision, checks) if with_counterfactual
                           else Counterfactual(possible=False, summary="")),
        "flags": flags,
        "emi_estimate": round(new_emi, 2),
        "repayment_risk": risk.assess(app),
        "foir": round(ratio, 4),
    }
