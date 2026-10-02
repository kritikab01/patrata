"""Product book engine.

Before: every application was judged by one set of rules (same age, CIBIL and EMI limits for a
phone loan and a home loan). Now each loan variant carries its own rules, compiled from lenders'
published criteria (products.json). This module turns those rules into checks for one applicant.
"""
import json
from functools import lru_cache
from pathlib import Path

from .rules import emi, inr
from .schemas import RuleCheck

PATH = Path(__file__).with_name("products.json")
EMPLOYMENT = {"salaried": "salaried", "self_employed": "self-employed", "government": "government employees",
              "pensioner": "pensioners", "not_employed": "applicants without regular employment"}


@lru_cache(maxsize=1)
def book() -> dict:
    return json.loads(PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def index() -> dict:
    return {v["id"]: (p, v) for p in book()["products"] for v in p["variants"]}


def get(variant_id: str | None):
    return index().get(variant_id or "")


def rbi_home_ltv_cap(loan: float) -> float:
    """RBI loan-to-value caps for home loans."""
    return 0.90 if loan <= 3_000_000 else 0.80 if loan <= 7_500_000 else 0.75


def emi_detail(app, v: dict, amount: float | None = None, term_years: float | None = None) -> dict:
    """EMI as the variant actually charges it. Flexi Hybrid: interest-only first, then a full EMI
    over the remaining months; no-cost EMI: 0% interest."""
    p = amount if amount is not None else app.loan_amount
    years = term_years if term_years is not None else app.loan_term
    n = max(1, round(years * 12))
    sp = v.get("special") or {}
    rate = 0.0 if sp.get("type") == "zero_interest" else app.annual_rate
    if sp.get("type") == "interest_only":
        io = min(sp["interest_only_months"], max(0, n - 12))
        start = p * rate / 1200
        full = emi(p, rate, (n - io) / 12)
        return {"emi": full, "starting_emi": start, "interest_only_months": io, "rate": rate}
    return {"emi": emi(p, rate, n / 12), "rate": rate}


def _age_cap(c: dict, employment: str):
    cap = c["age_max_at_maturity"]
    return cap.get(employment, max(cap.values())) if isinstance(cap, dict) else cap


def evaluate(app, v: dict, amount: float | None = None, term_years: float | None = None,
             risk_p: float | None = None) -> list[RuleCheck]:
    c = v["criteria"]
    amt = amount if amount is not None else app.loan_amount
    years = term_years if term_years is not None else app.loan_term
    months = round(years * 12)
    out: list[RuleCheck] = []

    def add(id_, label, status, value, threshold, detail):
        out.append(RuleCheck(id=id_, label=label, status=status, value=value, threshold=threshold, detail=detail))

    # 1. Who the variant is for
    ok = app.employment_type in c["employment"]
    add("employment", "Employment type", "pass" if ok else "fail", EMPLOYMENT[app.employment_type].capitalize(),
        "for " + ", ".join(EMPLOYMENT[e] for e in c["employment"]),
        "Matches this variant." if ok else f"{v['name']} is not offered to {EMPLOYMENT[app.employment_type]}.")

    # 2. Age at entry and 3. age when the loan ends
    ok = app.age >= c["age_min"]
    add("age", "Age today", "pass" if ok else "fail", f"{app.age} years", f"at least {c['age_min']}",
        "Old enough for this variant." if ok else f"Below the minimum age of {c['age_min']}.")
    cap = _age_cap(c, app.employment_type)
    end_age = app.age + years
    ok = end_age <= cap
    add("age_maturity", "Age when the loan ends", "pass" if ok else "fail", f"{end_age:g} years", f"{cap} or younger",
        "Loan ends within the age limit." if ok else f"The loan would run past age {cap}. A shorter tenure can fix this.")

    # 4. Minimum income
    if "min_monthly_income" in c:
        inc, need = app.income_annum / 12, c["min_monthly_income"]
        add("income", "Monthly income", "pass" if inc >= need else "fail", inr(inc), f"at least {inr(need)} a month",
            "Meets the minimum income." if inc >= need else "Below this variant's minimum income.")
    else:
        need = c["min_annual_income"]
        ok = app.income_annum >= need
        add("income", "Annual income", "pass" if ok else "fail", inr(app.income_annum), f"at least {inr(need)} a year",
            "Meets the minimum income." if ok else "Below this variant's minimum income.")

    # 5. Job or business stability
    need = c["min_years_in_job"]
    ok = app.years_in_job >= need
    word = "Business vintage" if app.employment_type == "self_employed" else "Years in current job"
    add("job_years", word, "pass" if ok else "refer", f"{app.years_in_job:g} years", f"at least {need:g}",
        "Stable enough." if ok else "Below the usual minimum. A credit officer can check total experience or business history.")

    # 6. Credit score (first-time borrowers are never declined only for having no history)
    s = app.cibil_score
    if s is None:
        add("cibil", "CIBIL score", "refer", "No history", "first-time borrower: assess income instead",
            "No credit history yet. Under RBI's January 2025 direction, first-time borrowers shouldn't be rejected only for this.")
    elif s < c["cibil_min"]:
        add("cibil", "CIBIL score", "fail", str(s), f"{c['cibil_clear']}+ clear, {c['cibil_min']} minimum",
            f"Below this variant's minimum of {c['cibil_min']}.")
    elif s < c["cibil_clear"]:
        add("cibil", "CIBIL score", "refer", str(s), f"{c['cibil_clear']}+ clear, {c['cibil_min']} minimum",
            "Acceptable, but a credit officer should review.")
    else:
        add("cibil", "CIBIL score", "pass", str(s), f"{c['cibil_clear']}+ clear, {c['cibil_min']} minimum", "Clear.")

    # 7. EMI burden on the EMI this variant really charges
    e = emi_detail(app, v, amt, years)
    foir = (app.existing_emi_monthly + e["emi"]) / (app.income_annum / 12)
    pct = round(foir * 100, 1)
    st = "fail" if foir > c["foir_max"] else "refer" if foir > c["foir_clear"] else "pass"
    extra = (f" Tested on the full EMI of {inr(e['emi'])} that starts after {e['interest_only_months']} interest-only months "
             f"(starting EMI {inr(e['starting_emi'])})." if "starting_emi" in e else f" New EMI {inr(e['emi'])} a month.")
    add("foir", "EMI burden (FOIR)", st, f"{pct}%", f"up to {c['foir_clear'] * 100:g}% clear, {c['foir_max'] * 100:g}% maximum",
        {"pass": "Affordable.", "refer": "Above the comfort level.", "fail": "Above the maximum."}[st] + extra)

    # 8. Amount and 9. tenure limits
    ok = c["amount_min"] <= amt <= c["amount_max"]
    add("amount", "Loan amount", "pass" if ok else "fail", inr(amt), f"{inr(c['amount_min'])} to {inr(c['amount_max'])}",
        "Within this variant's limits." if ok else "Outside this variant's loan amount limits.")
    ok = c["tenure_months_min"] <= months <= c["tenure_months_max"]
    add("tenure", "Tenure", "pass" if ok else "fail", f"{months} months", f"{c['tenure_months_min']} to {c['tenure_months_max']} months",
        "Within this variant's limits." if ok else "Outside this variant's tenure limits.")

    # 10. Loan-to-value: home (RBI caps) or asset price (vehicle, consumer durable)
    if c.get("ltv") == "rbi_home":
        pv = getattr(app, "property_value", None) or 0
        capv = rbi_home_ltv_cap(amt)
        ltv = amt / pv if pv else 9.99
        add("ltv", "Loan-to-value", "pass" if ltv <= capv else "fail", f"{ltv * 100:.1f}%", f"up to {capv * 100:g}% (RBI)",
            f"Loan is {ltv * 100:.1f}% of the property value." if ltv <= capv else
            f"RBI allows at most {capv * 100:g}% of the property value for a loan of this size; the rest must be the down payment.")
    elif c.get("ltv") == "asset":
        price = getattr(app, "asset_price", None) or 0
        ltv = amt / price if price else 9.99
        cap_ = c["max_ltv"]
        add("ltv", "Loan vs price", "pass" if ltv <= cap_ else "fail", f"{ltv * 100:.1f}%", f"up to {cap_ * 100:g}% of the price",
            f"Down payment {inr(max(0, price - amt))}." if ltv <= cap_ else
            f"This variant funds at most {cap_ * 100:g}% of the price; a bigger down payment is needed.")

    # 10b. Credit-report behaviour: an overdue payment now, and many new loans in a short time
    from . import config as C
    if app.overdue_now:
        add("overdue", "Payment overdue now", "fail", "Yes", "no overdue payments",
            "A loan or card payment is overdue. It must be cleared before a new loan.")
    if app.new_loans_12m >= C.CREDIT_HUNGER_REVIEW_AT:
        add("credit_hunger", "New loans in the last year", "refer", str(app.new_loans_12m), f"fewer than {C.CREDIT_HUNGER_REVIEW_AT}",
            "Several new loans in a short time can signal financial stress (Patrata policy assumption).")

    # 11. Repayment risk from the model trained on 307,511 real loans
    from . import risk
    p = risk_p if risk_p is not None else float(risk.probability(app, [{"loan_amount": amt, "loan_term": years}])[0])
    b = risk.band(p)
    _, meta = risk.load()
    add("repayment", "Repayment risk", "refer" if b == "high" else "pass", f"{p * 100:.1f}%",
        f"below {meta['bands']['high_from'] * 100:.1f}% (1.5x the average)",
        f"Borrowers like this had payment difficulties {p / meta['base_default_rate']:.1f} times as often as average "
        f"in 307,511 real loans." if b == "high" else "In line with or below the average in 307,511 real loans.")
    return out


def tenure_grid(v: dict) -> list[int]:
    c = v["criteria"]
    lo, hi = c["tenure_months_min"], c["tenure_months_max"]
    base = [3, 6, 9, 12, 15, 18, 24] if hi <= 24 else [12, 18, 24, 36, 48, 60, 72, 84] if hi <= 96 else list(range(60, 361, 60))
    return [m for m in base if lo <= m <= hi]


def matching_variants(app, exclude: str | None = None) -> list[dict]:
    """Other variants this applicant fits as asked (no hard failures). Useful when the chosen one doesn't."""
    out = []
    for vid, (p, v) in index().items():
        if vid == exclude:
            continue
        c = v["criteria"]
        if (c.get("ltv") == "rbi_home" and not getattr(app, "property_value", None)) or \
           (c.get("ltv") == "asset" and not getattr(app, "asset_price", None)):
            continue
        checks = evaluate(app, v, risk_p=0.0)
        if not any(ch.status == "fail" for ch in checks):
            out.append({"variant": vid, "name": v["name"], "product": p["name"],
                        "needs_review": [ch.label for ch in checks if ch.status == "refer"]})
    return out


def knowledge_chunks() -> list[dict]:
    """Plain-language text for each variant, so the assistant can answer product questions with a source."""
    chunks = []
    for p in book()["products"]:
        for v in p["variants"]:
            c = v["criteria"]
            age_cap = c["age_max_at_maturity"]
            age_txt = (", ".join(f"{k.replace('_', ' ')} {val}" for k, val in age_cap.items()) if isinstance(age_cap, dict) else str(age_cap))
            inc = (f"at least {inr(c['min_monthly_income'])} a month" if "min_monthly_income" in c
                   else f"at least {inr(c['min_annual_income'])} a year")
            ltv = (" Loan-to-value follows RBI caps: 90% up to Rs 30 lakh, 80% for Rs 30 to 75 lakh, 75% above." if c.get("ltv") == "rbi_home"
                   else f" It funds up to {c['max_ltv'] * 100:g}% of the price." if c.get("ltv") == "asset" else "")
            sp = f" {v['special']['rule']}" if v.get("special") else ""
            text = (f"{v['name']} ({p['name'].lower()}): {v['for']} Features: {'; '.join(v['features'])}. "
                    f"Eligibility: {', '.join(EMPLOYMENT[e] for e in c['employment'])}; age {c['age_min']} or older and at most "
                    f"{age_txt} when the loan ends; income {inc}; at least {c['min_years_in_job']:g} years in the job or business; "
                    f"CIBIL {c['cibil_clear']}+ is clear and {c['cibil_min']} is the minimum. EMIs may use up to {c['foir_clear'] * 100:g}% "
                    f"of income comfortably and {c['foir_max'] * 100:g}% at most. Amount {inr(c['amount_min'])} to {inr(c['amount_max'])}, "
                    f"tenure {c['tenure_months_min']} to {c['tenure_months_max']} months.{ltv}{sp} "
                    f"Documents: {', '.join(v['documents'])}.")
            keys = f"{p['name']} {v['name']} {p['id']} eligibility criteria who can apply minimum documents tenure amount"
            chunks.append({"title": f"{p['name']}: {v['name']}", "text": text, "keys": keys})
    return chunks
