"""Calculators the assistant can use. All arithmetic happens here, in code; the LLM only phrases
the result (the same rule as the rest of Patrata). The parser understands Indian amounts:
'10 lakh', '₹1.2 crore', '50k', '6 LPA', '10,00,000'."""
import re

from . import config as C
from .rules import emi, inr

UNITS = {"crore": 1e7, "crores": 1e7, "cr": 1e7, "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "lacs": 1e5,
         "l": 1e5, "k": 1e3, "thousand": 1e3, "करोड़": 1e7, "लाख": 1e5, "हज़ार": 1e3, "हजार": 1e3}
NUM = r"(\d+(?:,\d+)*(?:\.\d+)?)"
RATE = re.compile(NUM + r"\s*%")
YEARS = re.compile(NUM + r"\s*(?:years?|yrs?|saal|वर्ष|साल)\b", re.I)
MONTHS = re.compile(NUM + r"\s*(?:months?|mahine|महीने)\b", re.I)
MONEY = re.compile(r"(?:₹|rs\.?|inr)?\s*" + NUM + r"\s*(crores?|cr|lakhs?|lacs?|l|k|thousand|lpa|करोड़|लाख|हज़ार|हजार)?(?![a-z0-9%])", re.I)
CIBIL = re.compile(r"(?:cibil|credit score|score|सिबिल)\D{0,12}(\d{3})|(\d{3})\s*(?:cibil|credit score|score)", re.I)
INCOME_BEFORE = re.compile(r"salary|income|earn|ctc|take.?home|make|कमाई|आय|तनख्वाह", re.I)
INCOME_AFTER = re.compile(r"\s*(?:/-)?\s*(?:per month|a month|monthly|pm\b|/month|per annum|a year|p\.?a\.?|lpa|salary|income|ki salary|कमाता|कमाती)", re.I)


def _val(n: str) -> float:
    return float(n.replace(",", ""))


def parse(text: str) -> dict:
    """Pull out amounts, rate, tenure, income and CIBIL score from free text."""
    t = text.lower()
    out: dict = {}
    m = RATE.search(t)
    if m:
        out["annual_rate"] = _val(m.group(1))
    m = YEARS.search(t)
    if m:
        out["years"] = _val(m.group(1))
    elif (m := MONTHS.search(t)):
        out["years"] = _val(m.group(1)) / 12
    m = CIBIL.search(t)
    if m:
        out["cibil"] = int(m.group(1) or m.group(2))
    spans = [x.span() for x in (RATE.search(t), YEARS.search(t), MONTHS.search(t), CIBIL.search(t)) if x]
    monies = []
    for m in MONEY.finditer(t):
        if any(a <= m.start() < b for a, b in spans):
            continue
        unit = (m.group(2) or "").lower()
        v = _val(m.group(1)) * (1e5 if unit == "lpa" else UNITS.get(unit, 1))
        if v < 1000:
            continue
        before, after = t[max(0, m.start() - 14): m.start()], t[m.end(): m.end() + 18]
        is_income = unit == "lpa" or bool(INCOME_BEFORE.search(before)) or bool(INCOME_AFTER.match(after))
        annual = unit == "lpa" or bool(re.search(r"per (annum|year)|annual|yearly|ctc|a year", before + " " + after))
        monies.append({"value": v, "income": is_income, "annual": annual,
                       "emi": bool(re.search(r"existing|current|already|running|chal rahi", before + " " + after))})
    for x in monies:
        if x["income"] and "monthly_income" not in out:
            out["monthly_income"] = x["value"] / 12 if x["annual"] else x["value"]
        elif x["emi"] and "existing_emi" not in out:
            out["existing_emi"] = x["value"]
        elif "loan_amount" not in out:
            out["loan_amount"] = x["value"]
    return out


def intent(text: str) -> str | None:
    t = text.lower()
    if re.search(r"how much (loan|can i (get|borrow|take|afford))|max(imum)? (loan|amount)|afford|कितना लोन", t):
        return "affordability"
    if re.search(r"am i eligible|will i get|can i get|would i get|do i qualify|my chances|eligib|मिलेगा|मिल सकता", t):
        return "eligibility"
    if re.search(r"\bemi\b|instal|monthly payment|किस्त", t):
        return "emi"
    return None


def emi_calc(loan: float, rate: float, years: float) -> dict:
    e = emi(loan, rate, max(1, round(years * 12)) / 12)
    n = max(1, round(years * 12))
    total = e * n
    return {"tool": "EMI calculator", "loan_amount": inr(loan), "annual_rate": f"{rate:g}%", "tenure": f"{years:g} years ({n} EMIs)",
            "monthly_emi": inr(e), "total_interest": inr(total - loan), "total_paid": inr(total)}


def max_loan(monthly_income: float, rate: float, years: float, existing_emi: float = 0) -> dict:
    n = max(1, round(years * 12)); r = rate / 1200
    factor = ((1 + r) ** n - 1) / (r * (1 + r) ** n) if r else n
    out = {"tool": "Affordability calculator", "monthly_income": inr(monthly_income), "existing_emis": inr(existing_emi),
           "annual_rate": f"{rate:g}%", "tenure": f"{years:g} years"}
    for label, cap in (("comfortable", C.FOIR_SOFT_CAP), ("maximum", C.FOIR_HARD_CAP)):
        room = max(0.0, monthly_income * cap - existing_emi)
        out[f"{label}_emi"] = inr(room)
        out[f"{label}_loan"] = inr(round(room * factor, -4))
    out["rule_used"] = f"all EMIs within {int(C.FOIR_SOFT_CAP * 100)}% of income is comfortable; {int(C.FOIR_HARD_CAP * 100)}% is the most Patrata allows"
    return out


def quick_check(monthly_income: float, loan: float, cibil: int | None, rate: float, years: float, existing_emi: float = 0) -> dict:
    """A borrower-side pre-check from CIBIL and EMI burden only. Not a full assessment."""
    e = emi(loan, rate, max(1, round(years * 12)) / 12)
    foir = (e + existing_emi) / monthly_income
    if cibil is None:
        cib = "not given"
    elif cibil < C.CIBIL_HARD_FLOOR:
        cib = f"{cibil} is below the {C.CIBIL_HARD_FLOOR} floor"
    elif cibil < C.CIBIL_SOFT_FLOOR:
        cib = f"{cibil} needs a credit officer's review"
    else:
        cib = f"{cibil} is clear"
    if (cibil is not None and cibil < C.CIBIL_HARD_FLOOR) or foir > C.FOIR_HARD_CAP:
        verdict = "unlikely as asked"
    elif (cibil is not None and cibil < C.CIBIL_SOFT_FLOOR) or foir > C.FOIR_SOFT_CAP or cibil is None:
        verdict = "possible, but needs a review"
    else:
        verdict = "likely, subject to documents and a full check"
    out = {"tool": "Quick eligibility pre-check", "verdict": verdict, "loan_amount": inr(loan), "tenure": f"{years:g} years",
           "annual_rate_assumed": f"{rate:g}%", "monthly_emi": inr(e), "emi_burden": f"{foir * 100:.1f}%",
           "cibil": cib, "note": "Pre-check from CIBIL and EMI burden only. Use New application for the full assessment."}
    if foir > C.FOIR_SOFT_CAP:
        out["suggestion"] = max_loan(monthly_income, rate, years, existing_emi)["comfortable_loan"] + " would keep EMIs comfortable"
    return out


def run(text: str, extracted: dict | None = None) -> dict | None:
    """Decide whether a calculator applies and run it. `extracted` can come from the LLM; it is
    range-checked here so a bad extraction can't produce nonsense numbers."""
    kind = (extracted or {}).get("intent") or intent(text)
    if kind not in ("emi", "affordability", "eligibility"):
        return None
    p = parse(text)
    for k, v in (extracted or {}).items():
        if k != "intent" and isinstance(v, (int, float)) and v > 0 and k not in p:
            p[k] = float(v)
    loan, inc, cibil = p.get("loan_amount"), p.get("monthly_income"), p.get("cibil")
    rate = p.get("annual_rate") or C.DEFAULT_ANNUAL_RATE
    years = p.get("years") or (5 if kind != "affordability" or not loan else 5)
    if not (1 <= rate <= 40) or not (0.25 <= years <= 30):
        return None
    if cibil is not None and not 300 <= cibil <= 900:
        cibil = None
    existing = p.get("existing_emi", 0)
    defaults = [] if p.get("annual_rate") else [f"interest rate {rate:g}%"]
    if not p.get("years"):
        defaults.append(f"tenure {years:g} years")
    if kind == "emi" and loan:
        res = emi_calc(loan, rate, years)
    elif kind == "affordability" and inc:
        res = max_loan(inc, rate, years, existing)
    elif kind == "eligibility" and inc and loan:
        res = quick_check(inc, loan, int(cibil) if cibil else None, rate, years, existing)
    else:
        need = {"emi": "the loan amount", "affordability": "your monthly income",
                "eligibility": "your monthly income and the loan amount"}[kind]
        return {"tool": "missing", "intent": kind, "needs": need}
    if defaults:
        res["assumed"] = ", ".join(defaults)
    return res
