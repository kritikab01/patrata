"""Train the Patrata approval model and write everything the app and report need.

Run from backend/:  python train/train.py
Outputs: artifacts/model.json, artifacts/metadata.json, reports/figures/*.png
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
from sklearn.metrics import (accuracy_score, brier_score_loss, confusion_matrix,
                             f1_score, precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.features import FEATURES, LABELS, MONOTONE, build_features  # noqa: E402

DATA = ROOT / "data" / "loan_approval_dataset.csv"
ART = ROOT / "artifacts"
FIG = ROOT / "reports" / "figures"
SEED = 42

INK, GREEN, RED, SLATE = "#1E2A5A", "#17663A", "#B42318", "#5B6475"


def load() -> pd.DataFrame:
    df = pd.read_csv(DATA)
    df.columns = [c.strip() for c in df.columns]
    for c in ["education", "self_employed", "loan_status"]:
        df[c] = df[c].astype(str).str.strip()
    df["y"] = (df["loan_status"] == "Approved").astype(int)
    return df


def data_audit(df: pd.DataFrame) -> dict:
    """Findings worth stating honestly in the report (Sections A-Q3, C-Q1)."""
    lo, hi = df[df.cibil_score < 550], df[df.cibil_score >= 550]
    one_line_rule = ((df.cibil_score >= 550) | (df.loan_term <= 4)).astype(int)
    return {
        "rows": int(len(df)),
        "approved_share": round(float(df.y.mean()), 3),
        "approval_rate_cibil_below_550": round(float(lo.y.mean()), 3),
        "approval_rate_cibil_550_plus": round(float(hi.y.mean()), 3),
        "approval_rate_below_550_by_term": {
            int(k): round(float(v), 3) for k, v in lo.groupby("loan_term").y.mean().items()
        },
        "approval_rate_by_education": {
            k: round(float(v), 3) for k, v in df.groupby("education").y.mean().items()
        },
        "approval_rate_by_self_employed": {
            k: round(float(v), 3) for k, v in df.groupby("self_employed").y.mean().items()
        },
        "negative_asset_rows": int((df.residential_assets_value < 0).sum()),
        "loan_to_income_range": [
            round(float((df.loan_amount / df.income_annum).min()), 2),
            round(float((df.loan_amount / df.income_annum).max()), 2),
        ],
        "one_line_rule_accuracy": round(float(accuracy_score(df.y, one_line_rule)), 4),
        "one_line_rule": "approve if CIBIL >= 550 or loan term <= 4 years",
    }


def metrics(y, p, thr=0.5) -> dict:
    pred = (p >= thr).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred).ravel()
    return {
        "accuracy": round(float(accuracy_score(y, pred)), 4),
        "roc_auc": round(float(roc_auc_score(y, p)), 4),
        "precision_approve": round(float(precision_score(y, pred)), 4),
        "recall_approve": round(float(recall_score(y, pred)), 4),
        "recall_reject": round(float(tn / (tn + fp)), 4),
        "f1": round(float(f1_score(y, pred)), 4),
        "brier": round(float(brier_score_loss(y, p)), 4),
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


def main():
    ART.mkdir(exist_ok=True)
    FIG.mkdir(parents=True, exist_ok=True)
    df = load()
    audit = data_audit(df)
    X, y = build_features(df), df["y"].values
    X_tr, X_te, y_tr, y_te, idx_tr, idx_te = train_test_split(
        X, y, df.index, test_size=0.2, stratify=y, random_state=SEED)

    # Baseline: scaled logistic regression
    lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000))
    lr.fit(X_tr, y_tr)
    lr_m = metrics(y_te, lr.predict_proba(X_te)[:, 1])

    # Main model: XGBoost with monotone constraints
    params = dict(
        n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.9,
        colsample_bytree=0.9, min_child_weight=3, reg_lambda=1.0,
        monotone_constraints="(" + ",".join(str(MONOTONE[f]) for f in FEATURES) + ")",
        eval_metric="logloss", random_state=SEED,
    )
    clf = xgb.XGBClassifier(**params)
    cv = cross_val_score(clf, X_tr, y_tr, cv=StratifiedKFold(5, shuffle=True, random_state=SEED),
                         scoring="roc_auc")
    clf.fit(X_tr, y_tr)
    p_te = clf.predict_proba(X_te)[:, 1]
    xgb_m = metrics(y_te, p_te)
    xgb_m["cv_roc_auc_mean"] = round(float(cv.mean()), 4)
    xgb_m["cv_roc_auc_std"] = round(float(cv.std()), 4)

    # Fairness check on excluded attributes (outcome parity on the test set)
    te = df.loc[idx_te].copy()
    te["pred"] = (p_te >= 0.5).astype(int)
    fairness = {
        g: {k: round(float(v), 3) for k, v in te.groupby(g).pred.mean().items()}
        for g in ["education", "self_employed"]
    }

    # Global importance = mean |SHAP| (XGBoost's built-in TreeSHAP)
    booster = clf.get_booster()
    contrib = booster.predict(xgb.DMatrix(X_te), pred_contribs=True)[:, :-1]
    imp = dict(sorted(((f, float(np.abs(contrib[:, i]).mean())) for i, f in enumerate(FEATURES)),
                      key=lambda kv: -kv[1]))

    # ---- Figures for the report ----
    cm = confusion_matrix(y_te, (p_te >= 0.5).astype(int))
    fig, ax = plt.subplots(figsize=(4.2, 3.6))
    ax.imshow(cm, cmap="Blues")
    for (i, j), v in np.ndenumerate(cm):
        ax.text(j, i, str(v), ha="center", va="center", fontsize=14,
                color="white" if v > cm.max() / 2 else INK)
    ax.set_xticks([0, 1], ["Rejected", "Approved"]); ax.set_yticks([0, 1], ["Rejected", "Approved"])
    ax.set_xlabel("Predicted"); ax.set_ylabel("Actual"); ax.set_title("Confusion matrix (test set)")
    fig.tight_layout(); fig.savefig(FIG / "confusion_matrix.png", dpi=160); plt.close(fig)

    fig, ax = plt.subplots(figsize=(6, 3.6))
    names = [LABELS[k] for k in imp][::-1]
    ax.barh(names, list(imp.values())[::-1], color=INK)
    ax.set_xlabel("Mean |SHAP| (log-odds)"); ax.set_title("What drives the model")
    fig.tight_layout(); fig.savefig(FIG / "feature_importance.png", dpi=160); plt.close(fig)

    grid = pd.DataFrame([X_te.median()] * 61).reset_index(drop=True)
    grid["cibil_score"] = np.linspace(300, 900, 61)
    fig, ax = plt.subplots(figsize=(6, 3.6))
    for term, col in [(4, GREEN), (10, INK), (20, RED)]:
        g = grid.copy(); g["loan_term"] = term
        ax.plot(g.cibil_score, clf.predict_proba(g[FEATURES])[:, 1], color=col, label=f"{term}-year term")
    ax.axvline(550, color=SLATE, ls="--", lw=1)
    ax.set_xlabel("CIBIL score"); ax.set_ylabel("P(approve)"); ax.legend(frameon=False)
    ax.set_title("Model approval probability vs CIBIL")
    fig.tight_layout(); fig.savefig(FIG / "cibil_curve.png", dpi=160); plt.close(fig)

    frac, mean_pred = calibration_curve(y_te, p_te, n_bins=8, strategy="quantile")
    fig, ax = plt.subplots(figsize=(4.2, 3.6))
    ax.plot([0, 1], [0, 1], color=SLATE, ls="--", lw=1)
    ax.plot(mean_pred, frac, marker="o", color=INK)
    ax.set_xlabel("Predicted probability"); ax.set_ylabel("Observed approval rate")
    ax.set_title("Calibration"); fig.tight_layout()
    fig.savefig(FIG / "calibration.png", dpi=160); plt.close(fig)

    # ---- Save model + metadata ----
    booster.save_model(str(ART / "model.json"))
    ranges = {f: [float(X[f].min()), float(X[f].max())] for f in FEATURES}
    version = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    meta = {
        "model_version": version,
        "features": FEATURES,
        "labels": LABELS,
        "monotone_constraints": MONOTONE,
        "training_ranges": ranges,
        "params": {k: v for k, v in params.items() if k != "monotone_constraints"},
        "data_source": "Kaggle: architsharma01/loan-approval-prediction-dataset",
        "data_audit": audit,
        "metrics": {"xgboost": xgb_m, "logistic_regression": lr_m},
        "fairness_outcome_parity": fairness,
        "global_importance": {k: round(v, 4) for k, v in imp.items()},
        "limitations": [
            "Labels follow a near-deterministic rule (CIBIL >= 550, or a short term), so high accuracy reflects a synthetic dataset, not real-world credit risk.",
            "The data has no age, existing EMIs or repayment history; these are handled by policy rules, not the model.",
            "Loan-to-income in training only spans 1.5x to 4.0x; applications outside the training range are referred to a human.",
            "The target is past approval decisions, not actual default, so the model imitates past lenders rather than predicting repayment.",
        ],
    }
    (ART / "metadata.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps({"audit": audit, "xgboost": xgb_m, "logreg": lr_m,
                      "fairness": fairness, "importance": meta["global_importance"]}, indent=2))


if __name__ == "__main__":
    main()
