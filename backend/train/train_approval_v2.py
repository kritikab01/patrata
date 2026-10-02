"""Approval model v2: learns from 1.3 million REAL approve/refuse decisions, by product type.

Data: Home Credit Default Risk (Kaggle): previous_application.csv (the lender's past decisions) joined with
application_train.csv (who the applicant is). Run from backend/:  python train/train_approval_v2.py

Why it replaces v1: v1 learned from 4,269 synthetic rows whose labels follow a near-fixed CIBIL rule.
These are real decisions, for three product types that map to Patrata's products:
  Cash loans -> personal loans, Consumer loans -> consumer durable and vehicle loans, Revolving -> Flexi Hybrid.
Leakage checks: rows where the proposed EMI or tenure is blank are dropped (blanks occur only for refusals);
down payment is not used (also blank far more often for refusals); nothing decided after approval is used.
No CIBIL score exists in this data, so CIBIL stays a per-variant policy rule in Patrata.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.approval_features import (APPROVAL_FEATURES, APPROVAL_LABELS, APPROVAL_MONOTONE,  # noqa: E402
                                   PRODUCT_TYPES, approval_frame)
from app.risk_features import EMPLOYMENT_FROM_SOURCE  # noqa: E402

DATA, ART = ROOT / "data", ROOT / "artifacts"
SEED = 42
TYPE_MAP = {"Cash loans": "cash", "Consumer loans": "consumer", "Revolving loans": "revolving"}


def load() -> pd.DataFrame:
    prev = pd.read_csv(DATA / "home_credit_previous_application.csv",
                       usecols=["SK_ID_CURR", "NAME_CONTRACT_TYPE", "NAME_CONTRACT_STATUS", "AMT_APPLICATION",
                                "AMT_ANNUITY", "CNT_PAYMENT", "DAYS_DECISION"])
    prev = prev[prev.NAME_CONTRACT_STATUS.isin(["Approved", "Refused"]) & prev.NAME_CONTRACT_TYPE.isin(TYPE_MAP)]
    n_decided = len(prev)
    prev = prev.dropna(subset=["AMT_ANNUITY", "CNT_PAYMENT"])           # leakage guard
    prev = prev[(prev.AMT_APPLICATION > 0) & (prev.AMT_ANNUITY > 0)]
    app = pd.read_csv(DATA / "home_credit_application_train.csv",
                      usecols=["SK_ID_CURR", "AMT_INCOME_TOTAL", "DAYS_BIRTH", "DAYS_EMPLOYED", "NAME_INCOME_TYPE",
                               "CNT_CHILDREN", "FLAG_OWN_REALTY", "FLAG_OWN_CAR", "CODE_GENDER"])
    df = prev.merge(app, on="SK_ID_CURR", how="inner")
    yrs_before = -df.DAYS_DECISION / 365.25                              # profile is from a later date: step it back
    out = pd.DataFrame({
        "product_type": df.NAME_CONTRACT_TYPE.map(TYPE_MAP),
        "loan_to_income": (df.AMT_APPLICATION / df.AMT_INCOME_TOTAL).clip(upper=60),
        "payment_to_income": (df.AMT_ANNUITY / df.AMT_INCOME_TOTAL).clip(upper=3),
        "tenure_months": df.CNT_PAYMENT.clip(upper=84),
        "age": -df.DAYS_BIRTH / 365.25 - yrs_before,
        "years_in_job": ((-df.DAYS_EMPLOYED.where(df.DAYS_EMPLOYED != 365243, 0)) / 365.25 - yrs_before).clip(lower=0),
        "employment_type": df.NAME_INCOME_TYPE.map(EMPLOYMENT_FROM_SOURCE).fillna("not_employed"),
        "no_of_dependents": df.CNT_CHILDREN.clip(upper=10),
        "owns_home": (df.FLAG_OWN_REALTY == "Y").astype(int),
        "owns_vehicle": (df.FLAG_OWN_CAR == "Y").astype(int),
    })
    out["y"] = (df.NAME_CONTRACT_STATUS == "Approved").astype(int).values
    out["gender"] = df.CODE_GENDER.values
    out = out[out.age.between(18, 75)]
    return out, n_decided


def main():
    df, n_decided = load()
    X, y = approval_frame(df), df["y"].values
    X_tr, X_te, y_tr, y_te, i_tr, i_te = train_test_split(X, y, df.index, test_size=0.2, stratify=y, random_state=SEED)
    ytr = pd.Series(y_tr, index=X_tr.index)
    samp = X_tr.sample(min(200_000, len(X_tr)), random_state=SEED)
    lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000)).fit(samp, ytr.loc[samp.index])
    lr_auc = roc_auc_score(y_te, lr.predict_proba(X_te)[:, 1])
    clf = xgb.XGBClassifier(n_estimators=400, max_depth=6, learning_rate=0.08, subsample=0.8, colsample_bytree=0.9,
                            min_child_weight=50, reg_lambda=2.0, eval_metric="logloss", random_state=SEED, n_jobs=4,
                            monotone_constraints="(" + ",".join(str(APPROVAL_MONOTONE[f]) for f in APPROVAL_FEATURES) + ")")
    clf.fit(X_tr, y_tr)
    p = clf.predict_proba(X_te)[:, 1]
    te = df.loc[i_te].copy(); te["p"] = p
    per_product = {}
    for t in PRODUCT_TYPES:
        m = te.product_type == t
        per_product[t] = {"test_rows": int(m.sum()), "approval_rate": round(float(te[m].y.mean()), 3),
                          "roc_auc": round(float(roc_auc_score(te[m].y, te[m].p)), 4),
                          "accuracy": round(float(accuracy_score(te[m].y, te[m].p >= 0.5)), 4),
                          "majority_baseline": round(float(max(te[m].y.mean(), 1 - te[m].y.mean())), 4)}
        # Policy cut: the bottom 10% of predicted approval for this product goes to a human
        low = float(np.quantile(te[m].p, 0.10)); high = float(np.quantile(te[m].p, 0.90))
        bottom = te[m].p < low
        per_product[t].update({"review_below": round(low, 4), "strong_above": round(high, 4),
                               "refused_rate_bottom10": round(float(1 - te[m][bottom].y.mean()), 3),
                               "refused_rate_rest": round(float(1 - te[m][~bottom].y.mean()), 3)})
    booster = clf.get_booster()
    contrib = booster.predict(xgb.DMatrix(X_te.iloc[:20000]), pred_contribs=True)[:, :-1]
    imp = dict(sorted(((f, float(np.abs(contrib[:, i]).mean())) for i, f in enumerate(APPROVAL_FEATURES)), key=lambda kv: -kv[1]))
    booster.save_model(str(ART / "approval_v2_model.json"))
    meta = {
        "model_version": datetime.now(timezone.utc).strftime("%Y%m%d-%H%M"),
        "data_source": "Kaggle: Home Credit Default Risk, previous_application.csv joined with application_train.csv",
        "rows_in_source": 1670214, "decided_rows": int(n_decided), "training_rows": int(len(df)),
        "features": APPROVAL_FEATURES, "labels": APPROVAL_LABELS, "monotone_constraints": APPROVAL_MONOTONE,
        "training_ranges": {f: [float(X[f].quantile(0.005)), float(X[f].quantile(0.995))] for f in APPROVAL_FEATURES},
        "metrics": {"roc_auc": round(float(roc_auc_score(y_te, p)), 4), "logistic_regression_roc_auc": round(float(lr_auc), 4),
                    "accuracy": round(float(accuracy_score(y_te, p >= 0.5)), 4), "test_rows": int(len(y_te)),
                    "approval_rate": round(float(y.mean()), 3), "per_product": per_product},
        "fairness_mean_predicted_approval": {g: round(float(v), 4) for g, v in te.groupby("gender").p.mean().items() if (te.gender == g).sum() > 100},
        "global_importance": {k: round(v, 4) for k, v in imp.items()},
        "leakage_checks": ["Dropped rows with a blank proposed EMI or tenure (blank only for refusals)",
                           "Down payment not used (blank far more often for refusals)",
                           "Nothing decided after approval is used", "Applicant profile stepped back to the decision date"],
        "not_covered": ["Home loans (no public data with real home-loan decisions)", "CIBIL score (not in this data)"],
    }
    (ART / "approval_v2_metadata.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps({k: meta[k] for k in ("decided_rows", "training_rows", "metrics", "fairness_mean_predicted_approval", "global_importance")}, indent=1))


if __name__ == "__main__":
    main()
