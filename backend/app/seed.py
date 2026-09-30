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


def _applicant(rng: random.Random) -> dict:
    income = round(rng.lognormvariate(14.2, 0.55), -4)             # median ~₹14.7 lakh
    income = min(max(income, 300_000), 9_500_000)
    term = rng.choice([5, 8, 10, 12, 15, 15, 20, 20])
    age = rng.randint(23, min(58, 75 - term))
    cibil = int(min(900, max(320, rng.gauss(728, 72))))
    emi_share = rng.choice([0, 0, 0, 0, 0.05, 0.1, 0.18, 0.25])
    loan = round(income * rng.uniform(1.5, 3.0), -4)
    return {
        "age": age, "no_of_dependents": rng.randint(0, 4), "income_annum": income,
        "loan_amount": loan, "loan_term": term, "cibil_score": cibil,
        "residential_assets_value": round(income * rng.uniform(0, 3.5), -4),
        "commercial_assets_value": round(income * rng.choice([0, 0, 0.5, 1.2]), -4),
        "luxury_assets_value": round(income * rng.uniform(0.3, 2.5), -4),
        "bank_asset_value": round(income * rng.uniform(0.2, 1.2), -4),
        "existing_emi_monthly": round(income / 12 * emi_share, -2), "annual_rate": rng.choice([10.5, 11.5, 12, 13]),
    }


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
