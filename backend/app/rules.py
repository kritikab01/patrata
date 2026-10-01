"""Deterministic policy rules. These encode what a credit officer would check by
hand and act as a safety net around the ML model (E-Q3). All maths happens here,
in code, never in the LLM (C-Q4)."""
from . import config as C
from .schemas import ApplicationIn, RuleCheck


def inr(x: float) -> str:
    """Format rupees the Indian way: 1250000 -> ₹12,50,000."""
    neg, x = x < 0, abs(round(x))
    s = str(int(x))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts + [tail])
    return ("-₹" if neg else "₹") + s


def emi(principal: float, annual_rate_pct: float, years: int) -> float:
    r = annual_rate_pct / 12 / 100
    n = years * 12
    if r == 0:
        return principal / n
    return principal * r * (1 + r) ** n / ((1 + r) ** n - 1)


def foir(app: ApplicationIn, amount: float | None = None, term: int | None = None) -> tuple[float, float]:
    """Fixed Obligation to Income Ratio = all monthly EMIs / monthly income."""
    new_emi = emi(amount if amount is not None else app.loan_amount, app.annual_rate,
                  term if term is not None else app.loan_term)
    monthly_income = app.income_annum / 12
    return new_emi, (app.existing_emi_monthly + new_emi) / monthly_income


def run_rules(app: ApplicationIn, amount: float | None = None, term: int | None = None,
              risk_p: float | None = None) -> list[RuleCheck]:
    checks: list[RuleCheck] = []

    ok_age = C.AGE_MIN <= app.age <= C.AGE_MAX
    checks.append(RuleCheck(
        id="age", label="Age", status="pass" if ok_age else "fail",
        value=f"{app.age} years", threshold=f"{C.AGE_MIN} to {C.AGE_MAX} years",
        detail="Within the eligible age band." if ok_age else "Outside the eligible age band.",
    ))

    s = app.cibil_score
    if s < C.CIBIL_HARD_FLOOR:
        st, d = "fail", f"Below the policy floor of {C.CIBIL_HARD_FLOOR}."
    elif s < C.CIBIL_SOFT_FLOOR:
        st, d = "refer", f"Between {C.CIBIL_HARD_FLOOR} and {C.CIBIL_SOFT_FLOOR - 1}, so a credit officer should review."
    else:
        st, d = "pass", f"At or above {C.CIBIL_SOFT_FLOOR}."
    checks.append(RuleCheck(id="cibil", label="CIBIL score", status=st, value=str(s),
                            threshold=f"{C.CIBIL_SOFT_FLOOR}+ clear, {C.CIBIL_HARD_FLOOR} minimum", detail=d))

    new_emi, ratio = foir(app, amount, term)
    pct = round(ratio * 100, 1)
    if ratio > C.FOIR_HARD_CAP:
        st, d = "fail", f"EMIs would take {pct}% of monthly income, above the {int(C.FOIR_HARD_CAP*100)}% cap."
    elif ratio > C.FOIR_SOFT_CAP:
        st, d = "refer", f"EMIs would take {pct}% of monthly income, above the {int(C.FOIR_SOFT_CAP*100)}% comfort level."
    else:
        st, d = "pass", f"EMIs would take {pct}% of monthly income."
    checks.append(RuleCheck(id="foir", label="EMI burden (FOIR)", status=st, value=f"{pct}%",
                            threshold=f"up to {int(C.FOIR_SOFT_CAP*100)}% clear, {int(C.FOIR_HARD_CAP*100)}% maximum",
                            detail=d + f" New EMI estimated at {inr(new_emi)} per month at {app.annual_rate}% p.a."))

    if app.employment_type == "not_employed":
        checks.append(RuleCheck(id="employment", label="Source of income", status="refer", value="Not employed",
                                threshold="regular salary, business or pension income",
                                detail="No regular employment, so income must be verified by a credit officer."))

    from . import risk   # local import: risk uses rules.emi
    p = risk_p if risk_p is not None else float(
        risk.probability(app, [{"loan_amount": amount or app.loan_amount, "loan_term": term or app.loan_term}])[0])
    b = risk.band(p)
    _, meta = risk.load()
    rel = p / meta["base_default_rate"]
    checks.append(RuleCheck(
        id="repayment", label="Repayment risk", status="refer" if b == "high" else "pass",
        value=f"{p * 100:.1f}%", threshold=f"below {meta['bands']['high_from'] * 100:.1f}% (1.5x the average)",
        detail=(f"Borrowers like this had payment difficulties {rel:.1f} times as often as average "
                f"in 307,511 real loans." if b == "high" else
                f"In line with or below the average default rate of {meta['base_default_rate'] * 100:.1f}% in 307,511 real loans.")))
    return checks


def input_warnings(app: ApplicationIn) -> list[str]:
    """Plausibility checks that don't block scoring but should be eyeballed (E-Q2)."""
    w = []
    if app.income_annum < 100_000:
        w.append("Annual income is under ₹1,00,000. Check it isn't a monthly figure.")
    if app.loan_amount > 20 * app.income_annum:
        w.append("The loan is more than 20 times annual income. Check the units.")
    total_assets = (app.residential_assets_value + app.commercial_assets_value
                    + app.luxury_assets_value + app.bank_asset_value)
    if total_assets == 0:
        w.append("No assets entered. If the applicant has assets, adding them may change the result.")
    return w
