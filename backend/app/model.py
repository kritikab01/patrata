"""Loads the trained booster and exposes prediction, per-applicant drivers and an
out-of-distribution check. SHAP values come from XGBoost's built-in TreeSHAP
(pred_contribs), so the shap package isn't needed in production."""
import json
from functools import lru_cache

import numpy as np
import pandas as pd
import xgboost as xgb

from . import config as C
from .features import FEATURES, LABELS, MONOTONE, build_features
from .rules import inr
from .schemas import ApplicationIn, Driver


@lru_cache(maxsize=1)
def load():
    booster = xgb.Booster()
    booster.load_model(str(C.MODEL_PATH))
    meta = json.loads(C.META_PATH.read_text())
    return booster, meta


def _frame(app: ApplicationIn, overrides: list[dict] | None = None) -> pd.DataFrame:
    base = app.model_dump()
    rows = [base] if not overrides else [{**base, **o} for o in overrides]
    return build_features(pd.DataFrame(rows))


def predict(app: ApplicationIn, overrides: list[dict] | None = None) -> np.ndarray:
    booster, _ = load()
    X = _frame(app, overrides)
    return booster.predict(xgb.DMatrix(X, feature_names=FEATURES))


def drivers(app: ApplicationIn, top: int = 5) -> list[Driver]:
    booster, _ = load()
    X = _frame(app)
    contrib = booster.predict(xgb.DMatrix(X, feature_names=FEATURES), pred_contribs=True)[0][:-1]
    row = X.iloc[0]
    fmt = {
        "cibil_score": lambda v: str(int(v)),
        "loan_term": lambda v: f"{int(v)} years",
        "income_annum": inr,
        "loan_amount": inr,
        "loan_to_income": lambda v: f"{v:.2f}x",
        "total_assets": inr,
        "asset_coverage": lambda v: f"{v:.2f}x",
        "no_of_dependents": lambda v: str(int(v)),
    }
    order = np.argsort(-np.abs(contrib))[:top]
    return [
        Driver(feature=FEATURES[i], label=LABELS[FEATURES[i]], value=fmt[FEATURES[i]](row[FEATURES[i]]),
               impact=round(float(contrib[i]), 3),
               direction="towards_approval" if contrib[i] >= 0 else "towards_decline")
        for i in order if abs(contrib[i]) > 1e-3
    ]


def out_of_range(app: ApplicationIn, tolerance: float = 0.05) -> list[str]:
    """Features outside what the model saw in training. For monotone features we only
    flag the risky direction, because the constraint makes the safe direction reliable."""
    _, meta = load()
    row = _frame(app).iloc[0]
    flagged = []
    for f in FEATURES:
        lo, hi = meta["training_ranges"][f]
        low_edge = lo * (1 - tolerance) if lo > 0 else lo - tolerance * (hi - lo)
        high_edge = hi * (1 + tolerance)
        v, mono = row[f], MONOTONE[f]
        below, above = v < low_edge, v > high_edge
        if (mono == 1 and below) or (mono == -1 and above) or (mono == 0 and (below or above)):
            flagged.append(LABELS[f])
    return flagged
