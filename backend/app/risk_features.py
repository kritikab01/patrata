"""Features for the repayment-risk model, shared by training and the live app."""
import pandas as pd

EMPLOYMENT_TYPES = ["salaried", "self_employed", "government", "pensioner", "not_employed"]
EMPLOYMENT_LABELS = {
    "salaried": "Salaried (private job)", "self_employed": "Self-employed or business",
    "government": "Government employee", "pensioner": "Pensioner", "not_employed": "Not currently employed",
}
# Home Credit's NAME_INCOME_TYPE mapped to Patrata's employment types
EMPLOYMENT_FROM_SOURCE = {
    "Working": "salaried", "Commercial associate": "self_employed", "Businessman": "self_employed",
    "State servant": "government", "Pensioner": "pensioner",
    "Unemployed": "not_employed", "Student": "not_employed", "Maternity leave": "not_employed",
}

RISK_FEATURES = ["payment_to_income", "age", "years_in_job", "no_of_dependents", "owns_home", "owns_vehicle",
                 "emp_self_employed", "emp_government", "emp_pensioner", "emp_not_employed"]
RISK_LABELS = {
    "payment_to_income": "New EMI as share of income", "age": "Age", "years_in_job": "Years in current job",
    "no_of_dependents": "Dependents", "owns_home": "Owns a home", "owns_vehicle": "Owns a vehicle",
    "emp_self_employed": "Self-employed", "emp_government": "Government job", "emp_pensioner": "Pensioner",
    "emp_not_employed": "Not employed",
}
# +1: risk can only rise with the feature; -1: only fall; 0: free
RISK_MONOTONE = {"payment_to_income": 1, "age": -1, "years_in_job": -1, "no_of_dependents": 0,
                 "owns_home": 0, "owns_vehicle": 0, "emp_self_employed": 0, "emp_government": 0,
                 "emp_pensioner": 0, "emp_not_employed": 0}


def risk_frame(df: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    out["payment_to_income"] = df["payment_to_income"].astype(float)
    out["age"] = df["age"].astype(float)
    out["years_in_job"] = df["years_in_job"].astype(float)
    out["no_of_dependents"] = df["no_of_dependents"].astype(float)
    out["owns_home"] = df["owns_home"].astype(float)
    out["owns_vehicle"] = df["owns_vehicle"].astype(float)
    for t in ("self_employed", "government", "pensioner", "not_employed"):
        out[f"emp_{t}"] = (df["employment_type"] == t).astype(float)
    return out[RISK_FEATURES]
