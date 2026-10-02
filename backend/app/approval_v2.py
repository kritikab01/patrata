"""Approval model v2: trained on 1,046,997 real approve/refuse decisions (Home Credit), by product type.
It is a second opinion: an application in its product's bottom 10% goes to a human. It never declines alone."""
import json
from functools import lru_cache

import numpy as np
import pandas as pd
import xgboost as xgb

from . import config as C
from .approval_features import APPROVAL_FEATURES, APPROVAL_LABELS, VARIANT_TYPE, approval_frame
from .rules import emi

MODEL = C.ARTIFACT_DIR / "approval_v2_model.json"
META = C.ARTIFACT_DIR / "approval_v2_metadata.json"
TYPE_NAME = {"cash": "personal and Flexi term loans", "consumer": "consumer durable loans", "revolving": "credit lines"}


@lru_cache(maxsize=1)
def load():
    b = xgb.Booster()
    b.load_model(str(MODEL))
    return b, json.loads(META.read_text())


def product_type(variant: str | None) -> str | None:
    return VARIANT_TYPE.get(variant or "")


def _rows(app, overrides: list[dict] | None = None) -> pd.DataFrame:
    base = app.model_dump()
    t = product_type(app.variant)
    rows = []
    for o in (overrides or [{}]):
        a = {**base, **o}
        monthly = a["income_annum"] / 12
        rate = 0.0 if a["variant"] == "cd_no_cost" else a["annual_rate"]
        rows.append({"product_type": t, "loan_to_income": a["loan_amount"] / monthly,
                     "payment_to_income": emi(a["loan_amount"], rate, a["loan_term"]) / monthly,
                     "tenure_months": a["loan_term"] * 12, "age": a["age"], "years_in_job": a["years_in_job"],
                     "employment_type": a["employment_type"], "no_of_dependents": a["no_of_dependents"],
                     "owns_home": int(a["residential_assets_value"] > 0), "owns_vehicle": int(a["luxury_assets_value"] > 0)})
    return approval_frame(pd.DataFrame(rows))


def out_of_range(app) -> list[str]:
    _, meta = load()
    row = _rows(app).iloc[0]
    return [APPROVAL_LABELS[f] for f in ("loan_to_income", "payment_to_income", "tenure_months", "age")
            if not (meta["training_ranges"][f][0] <= row[f] <= meta["training_ranges"][f][1])]


def predict(app, overrides: list[dict] | None = None) -> np.ndarray:
    b, _ = load()
    return b.predict(xgb.DMatrix(_rows(app, overrides), feature_names=APPROVAL_FEATURES))


def cutoffs(app) -> dict:
    _, meta = load()
    return meta["metrics"]["per_product"][product_type(app.variant)]


def drivers(app, top: int = 5) -> list[dict]:
    b, _ = load()
    X = _rows(app)
    contrib = b.predict(xgb.DMatrix(X, feature_names=APPROVAL_FEATURES), pred_contribs=True)[0][:-1]
    row = X.iloc[0]
    fmt = {"loan_to_income": lambda v: f"{v:.1f}x", "payment_to_income": lambda v: f"{v * 100:.0f}%",
           "tenure_months": lambda v: f"{v:.0f} months", "age": lambda v: f"{v:.0f} years", "years_in_job": lambda v: f"{v:g} years",
           "no_of_dependents": lambda v: f"{v:.0f}"}
    out = []
    for i in np.argsort(-np.abs(contrib)):
        f = APPROVAL_FEATURES[i]
        if abs(contrib[i]) < 0.01 or (f not in fmt and not row[f]):
            continue
        out.append({"feature": f, "label": APPROVAL_LABELS[f], "value": fmt[f](row[f]) if f in fmt else "Yes",
                    "impact": round(float(contrib[i]), 3), "direction": "towards_approval" if contrib[i] >= 0 else "towards_decline"})
        if len(out) == top:
            break
    return out
