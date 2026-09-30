"""Feature engineering shared by training and serving, so the model sees
exactly the same transformations in both places (no train/serve skew)."""
import numpy as np
import pandas as pd

# Education and self-employment are deliberately EXCLUDED: the data audit showed
# they carry no signal (approval rate 62.5% vs 62.0%), and excluding them removes
# a fairness risk at zero cost to accuracy.
FEATURES = [
    "cibil_score",
    "loan_term",
    "income_annum",
    "loan_amount",
    "loan_to_income",
    "total_assets",
    "asset_coverage",
    "no_of_dependents",
]

# +1 = approval can only go up as feature rises, -1 = only down, 0 = free.
# Constraints keep the model consistent with lending common sense and stop
# tiny input changes from producing erratic swings.
MONOTONE = {
    "cibil_score": 1,
    "loan_term": 0,
    "income_annum": 0,
    "loan_amount": 0,
    "loan_to_income": -1,
    "total_assets": 0,
    "asset_coverage": 1,
    "no_of_dependents": 0,
}

ASSET_COLS = [
    "residential_assets_value",
    "commercial_assets_value",
    "luxury_assets_value",
    "bank_asset_value",
]

LABELS = {
    "cibil_score": "CIBIL score",
    "loan_term": "Loan term",
    "income_annum": "Annual income",
    "loan_amount": "Loan amount",
    "loan_to_income": "Loan-to-income ratio",
    "total_assets": "Total assets",
    "asset_coverage": "Asset cover on the loan",
    "no_of_dependents": "Dependents",
}


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    assets = df[ASSET_COLS].clip(lower=0)  # 28 rows in the raw data have negative assets
    out["cibil_score"] = df["cibil_score"].astype(float)
    out["loan_term"] = df["loan_term"].astype(float)
    out["income_annum"] = df["income_annum"].astype(float)
    out["loan_amount"] = df["loan_amount"].astype(float)
    out["loan_to_income"] = df["loan_amount"] / df["income_annum"].replace(0, np.nan)
    out["total_assets"] = assets.sum(axis=1).astype(float)
    out["asset_coverage"] = out["total_assets"] / df["loan_amount"].replace(0, np.nan)
    out["no_of_dependents"] = df["no_of_dependents"].astype(float)
    return out[FEATURES]
