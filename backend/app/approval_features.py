"""Features for approval model v2 (real decisions by product type), shared by training and the app.
All are unit-free, so they carry over from the source currency to rupees."""
import pandas as pd

PRODUCT_TYPES = ["cash", "consumer", "revolving"]
APPROVAL_FEATURES = ["loan_to_income", "payment_to_income", "tenure_months", "age", "years_in_job", "no_of_dependents",
                     "owns_home", "owns_vehicle", "is_cash", "is_revolving",
                     "emp_self_employed", "emp_government", "emp_pensioner", "emp_not_employed"]
APPROVAL_LABELS = {
    "loan_to_income": "Loan vs monthly income", "payment_to_income": "New EMI vs monthly income", "tenure_months": "Tenure",
    "age": "Age", "years_in_job": "Years in current job", "no_of_dependents": "Dependents", "owns_home": "Owns a home",
    "owns_vehicle": "Owns a vehicle", "is_cash": "Personal (cash) loan", "is_revolving": "Credit line (Flexi)",
    "emp_self_employed": "Self-employed", "emp_government": "Government job", "emp_pensioner": "Pensioner",
    "emp_not_employed": "Not employed",
}
# +1: approval can only rise with the feature; -1: only fall; 0: free
APPROVAL_MONOTONE = {f: 0 for f in APPROVAL_FEATURES} | {"payment_to_income": -1, "loan_to_income": -1, "years_in_job": 1}
# Patrata variant -> the product type it is judged against
VARIANT_TYPE = {"pl_salaried": "cash", "pl_self_employed": "cash", "pl_flexi_hybrid": "cash",
                "cd_standard": "consumer", "cd_no_cost": "consumer"}
# Home and vehicle loans are not mapped: the real-decision data has no home loans and very few vehicle loans,
# so judging them against phone and appliance loans would be unfair. They are decided by their own rules.


def approval_frame(df: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    for f in ["loan_to_income", "payment_to_income", "tenure_months", "age", "years_in_job", "no_of_dependents", "owns_home", "owns_vehicle"]:
        out[f] = df[f].astype(float)
    out["is_cash"] = (df["product_type"] == "cash").astype(float)
    out["is_revolving"] = (df["product_type"] == "revolving").astype(float)
    for t in ("self_employed", "government", "pensioner", "not_employed"):
        out[f"emp_{t}"] = (df["employment_type"] == t).astype(float)
    return out[APPROVAL_FEATURES]
