"""Sample data for the demo (Sir: "use any sample data"). On first start, if the database is
empty, ~90 realistic applicants are generated and scored by the real pipeline, spread over the
last 3 weeks, and some referred cases get a credit manager's review. Every seeded record is
marked sample=True so it is never confused with a real check."""
import os
import random
import uuid
from datetime import datetime, timedelta, timezone

from . import model, policy, store
from .rules import input_warnings
from .schemas import ApplicationIn, DecisionOut

REVIEW_NOTES = {
    "APPROVE": ["Salary slips and bank statements verified. EMI burden acceptable with stable income.",
                "Spoke to employer HR; income confirmed. Approved at requested amount.",
                "Co-applicant income added on file, bringing EMI burden under 50%."],
    "DECLINE": ["Existing loans show two recent late payments in bank statement.",
                "Income could not be verified from documents provided.",
                "Applicant declined the reduced amount; requested amount unaffordable."],
}


VARIANT_MIX = [("hl_salaried", 18), ("hl_self_employed", 7), ("pl_salaried", 20), ("pl_self_employed", 8),
               ("pl_flexi_hybrid", 7), ("cd_standard", 12), ("cd_no_cost", 8), ("vl_new_car", 12), ("vl_two_wheeler", 8)]


def _applicant(rng: random.Random) -> dict:
    """A realistic applicant for a randomly chosen product variant."""
    variant = rng.choices([v for v, _ in VARIANT_MIX], [w for _, w in VARIANT_MIX])[0]
    se = variant.endswith("self_employed") or (variant.startswith("vl_") and rng.random() < 0.3)
    emp = "self_employed" if se else rng.choices(["salaried", "government"], [80, 20])[0]
    if variant.startswith("cd_") and rng.random() < 0.1:
        emp = "pensioner"
    income = round(min(max(rng.lognormvariate(13.9, 0.55), 180_000), 9_500_000), -4)
    age = rng.randint(23, 55)
    cibil = int(min(900, max(320, rng.gauss(730, 70))))
    d = {"age": age, "no_of_dependents": rng.randint(0, 4), "income_annum": income, "cibil_score": cibil,
         "employment_type": emp, "years_in_job": round(min(age - 20, rng.choice([0.5, 1, 2, 3, 5, 8, 12])), 1),
         "existing_emi_monthly": round(income / 12 * rng.choice([0, 0, 0, 0.05, 0.1, 0.18, 0.25]), -2),
         "residential_assets_value": round(income * rng.uniform(0, 3), -4), "commercial_assets_value": 0,
         "luxury_assets_value": round(income * rng.uniform(0.2, 1.5), -4), "bank_asset_value": round(income * rng.uniform(0.1, 1), -4),
         "no_credit_history": rng.random() < 0.05, "variant": variant}
    if variant.startswith("hl_"):
        prop = round(income * rng.uniform(2.5, 6), -5)
        d.update(property_value=prop, loan_amount=round(prop * rng.uniform(0.6, 0.88), -4), loan_term=rng.choice([15, 20, 20, 25]), annual_rate=rng.choice([8.5, 9, 9.5]))
        d["loan_term"] = min(d["loan_term"], (70 if se else 60) - age) if (70 if se else 60) - age >= 5 else 5
    elif variant.startswith("pl_"):
        d.update(loan_amount=round(income * rng.uniform(0.3, 1.2), -4), loan_term=rng.choice([3, 4, 5]) if variant != "pl_flexi_hybrid" else rng.choice([4, 5, 6]),
                 annual_rate=rng.choice([11.5, 13, 14.5, 16]))
    elif variant.startswith("cd_"):
        price = round(rng.uniform(15_000, 140_000), -3)
        d.update(asset_price=price, loan_amount=round(price * rng.uniform(0.8, 1.0), -3),
                 loan_term=rng.choice([0.5, 0.75, 1]) if variant == "cd_no_cost" else rng.choice([0.5, 1, 1.5, 2]), annual_rate=rng.choice([16, 18, 20]))
    else:
        price = round(rng.uniform(600_000, 2_000_000), -4) if variant == "vl_new_car" else round(rng.uniform(70_000, 250_000), -3)
        d.update(asset_price=price, loan_amount=round(price * rng.uniform(0.7, 0.92), -3),
                 loan_term=rng.choice([3, 4, 5, 7]) if variant == "vl_new_car" else rng.choice([1, 2, 3]), annual_rate=rng.choice([9, 10, 12]))
    return d


def seed(n: int = 90, force: bool = False) -> int:
    if os.getenv("SEED_DEMO", "1") == "0" and not force:
        return 0
    if store.count() and not force:
        return 0
    rng = random.Random(2026)
    _, meta = model.load()
    now = datetime.now(timezone.utc)
    made = 0
    for i in range(n):
        try:
            app = ApplicationIn(request_id=f"sample-{i:04d}-{uuid.uuid4().hex[:6]}", **_applicant(rng))
        except ValueError:
            continue
        created = now - timedelta(days=rng.uniform(0, 20), hours=rng.uniform(0, 9))
        result = policy.assess(app)
        out = DecisionOut(id=uuid.uuid4().hex[:12], **result, warnings=input_warnings(app),
                          application=app.model_dump(exclude={"request_id"}), sample=True,
                          model_version=meta["model_version"], created_at=created.isoformat()).model_dump()
        store.save(out["id"], app.request_id, app.model_dump(), out, meta["model_version"], out["created_at"])
        made += 1
        age_days = (now - created).days
        if out["decision"] == "REFER" and age_days >= 2 and rng.random() < 0.7:
            final = "APPROVE" if rng.random() < 0.6 else "DECLINE"
            store.save_review(out["id"], final, rng.choice(REVIEW_NOTES[final]), "R. Mehta, Credit manager",
                              (created + timedelta(hours=rng.uniform(3, 30))).isoformat())
    return made
