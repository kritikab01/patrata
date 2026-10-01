"""Train Patrata's second model: repayment (default) risk, learned from 307,511 real loans.

Data: Home Credit Default Risk (Kaggle competition, application_train.csv). TARGET = 1 when the
client had payment difficulties (late on at least one of the first instalments).
Run from backend/:  python train/train_risk.py
Outputs: artifacts/risk_model.json, artifacts/risk_metadata.json, reports/figures/risk_*.png

Design choices (say these in the report):
- Only unit-free features, because the source currency differs from India's: payment as a share of
  income, age, years in the job, employment type, dependents, home and vehicle ownership.
- Gender, education and marital status are excluded on purpose (fairness), even though the data has them.
- Monotone constraints: a heavier payment burden can only raise risk; longer employment and higher
  age can only lower it.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.calibration import calibration_curve
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.risk_features import (EMPLOYMENT_FROM_SOURCE, RISK_FEATURES, RISK_LABELS,  # noqa: E402
                               RISK_MONOTONE, risk_frame)

DATA = ROOT / "data" / "home_credit_application_train.csv"
ART, FIG = ROOT / "artifacts", ROOT / "reports" / "figures"
SEED = 42
INK, RED, SLATE = "#1E2A5A", "#B42318", "#5B6475"


def load() -> pd.DataFrame:
    cols = ["TARGET", "CNT_CHILDREN", "AMT_INCOME_TOTAL", "AMT_ANNUITY", "DAYS_BIRTH", "DAYS_EMPLOYED",
            "NAME_INCOME_TYPE", "FLAG_OWN_REALTY", "FLAG_OWN_CAR", "CODE_GENDER", "NAME_EDUCATION_TYPE"]
    df = pd.read_csv(DATA, usecols=cols).dropna(subset=["AMT_ANNUITY"])
    out = pd.DataFrame({
        "age": -df.DAYS_BIRTH / 365.25,
        "years_in_job": (-df.DAYS_EMPLOYED.where(df.DAYS_EMPLOYED != 365243, 0)).clip(lower=0) / 365.25,
        "employment_type": df.NAME_INCOME_TYPE.map(EMPLOYMENT_FROM_SOURCE).fillna("not_employed"),
        "payment_to_income": (df.AMT_ANNUITY / df.AMT_INCOME_TOTAL).clip(upper=1.5),
        "no_of_dependents": df.CNT_CHILDREN.clip(upper=10),
        "owns_home": (df.FLAG_OWN_REALTY == "Y").astype(int),
        "owns_vehicle": (df.FLAG_OWN_CAR == "Y").astype(int),
    })
    out["y"] = df.TARGET.values
    out["gender"] = df.CODE_GENDER.values          # kept only for the fairness check, never a feature
    out["education"] = df.NAME_EDUCATION_TYPE.values
    return out


def main():
    ART.mkdir(exist_ok=True); FIG.mkdir(parents=True, exist_ok=True)
    df = load()
    X, y = risk_frame(df), df["y"].values
    X_tr, X_te, y_tr, y_te, i_tr, i_te = train_test_split(X, y, df.index, test_size=0.2, stratify=y, random_state=SEED)

    lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(X_tr, y_tr)
    lr_auc = roc_auc_score(y_te, lr.predict_proba(X_te)[:, 1])

    params = dict(n_estimators=400, max_depth=4, learning_rate=0.05, subsample=0.8, colsample_bytree=0.9,
                  min_child_weight=50, reg_lambda=2.0, eval_metric="logloss", random_state=SEED,
                  monotone_constraints="(" + ",".join(str(RISK_MONOTONE[f]) for f in RISK_FEATURES) + ")")
    clf = xgb.XGBClassifier(**params).fit(X_tr, y_tr)
    p = clf.predict_proba(X_te)[:, 1]
    auc = roc_auc_score(y_te, p)
    base = float(y.mean())

    # Risk bands relative to the average borrower
    low_cut, high_cut = round(base * 0.75, 4), round(base * 1.5, 4)
    te = df.loc[i_te].copy(); te["p"] = p
    te["band"] = np.where(p >= high_cut, "high", np.where(p < low_cut, "low", "medium"))
    bands = {b: {"share": round(float((te.band == b).mean()), 3), "actual_default_rate": round(float(te[te.band == b].y.mean()), 4)}
             for b in ("low", "medium", "high")}
    deciles = pd.qcut(p, 10, labels=False, duplicates="drop")
    lift = (pd.Series(y_te).groupby(deciles).mean() / base).round(2).tolist()
    fairness = {g: {k: round(float(v), 4) for k, v in te.groupby(g).p.mean().items() if te.groupby(g).size()[k] > 100}
                for g in ("gender", "education")}

    booster = clf.get_booster()
    contrib = booster.predict(xgb.DMatrix(X_te.iloc[:20000]), pred_contribs=True)[:, :-1]
    imp = dict(sorted(((f, float(np.abs(contrib[:, i]).mean())) for i, f in enumerate(RISK_FEATURES)), key=lambda kv: -kv[1]))

    # Figures
    fig, ax = plt.subplots(figsize=(6, 3.6))
    ax.bar(range(1, len(lift) + 1), lift, color=[INK if v < 1 else RED for v in lift])
    ax.axhline(1, color=SLATE, ls="--", lw=1)
    ax.set_xlabel("Risk decile (1 = safest 10% of borrowers)"); ax.set_ylabel("Default rate vs average")
    ax.set_title("Repayment-risk model: default rate by decile"); fig.tight_layout()
    fig.savefig(FIG / "risk_lift.png", dpi=160); plt.close(fig)
    frac, mean_pred = calibration_curve(y_te, p, n_bins=10, strategy="quantile")
    fig, ax = plt.subplots(figsize=(4.2, 3.6))
    ax.plot([0, max(mean_pred)], [0, max(mean_pred)], color=SLATE, ls="--", lw=1)
    ax.plot(mean_pred, frac, marker="o", color=INK); ax.set_xlabel("Predicted default probability")
    ax.set_ylabel("Observed default rate"); ax.set_title("Calibration (risk model)"); fig.tight_layout()
    fig.savefig(FIG / "risk_calibration.png", dpi=160); plt.close(fig)

    booster.save_model(str(ART / "risk_model.json"))
    meta = {
        "model_version": datetime.now(timezone.utc).strftime("%Y%m%d-%H%M"),
        "data_source": "Kaggle: Home Credit Default Risk (application_train.csv), 307,511 real loans",
        "rows": int(len(df)), "base_default_rate": round(base, 4),
        "features": RISK_FEATURES, "labels": RISK_LABELS, "monotone_constraints": RISK_MONOTONE,
        "bands": {"low_below": low_cut, "high_from": high_cut},
        "training_ranges": {f: [float(X[f].quantile(0.005)), float(X[f].quantile(0.995))] for f in RISK_FEATURES},
        "metrics": {"roc_auc": round(float(auc), 4), "logistic_regression_roc_auc": round(float(lr_auc), 4),
                    "brier": round(float(brier_score_loss(y_te, p)), 4), "test_rows": int(len(y_te)),
                    "band_outcomes": bands, "decile_lift": lift,
                    "top_vs_bottom_decile": round(lift[-1] / max(lift[0], 1e-6), 1)},
        "fairness_mean_predicted_risk": fairness,
        "global_importance": {k: round(v, 4) for k, v in imp.items()},
        "excluded_on_purpose": ["gender", "education", "marital status", "absolute income amounts (currency differs)"],
    }
    (ART / "risk_metadata.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps({k: meta[k] for k in ("rows", "base_default_rate", "bands", "metrics", "fairness_mean_predicted_risk", "global_importance")}, indent=1))


if __name__ == "__main__":
    main()
