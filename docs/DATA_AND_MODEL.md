# Data and models

## In one minute

| | Approval model v2 | Repayment-risk model v2 | Approval model v1 (legacy) |
|---|---|---|---|
| Question it answers | Would a lender approve this? | Will the borrower struggle to repay? | Would a lender approve this? |
| Data | **1,046,997 real decisions** (Home Credit) | **307,499 real loans + 1,716,428 credit-bureau records** (Home Credit) | 4,269 synthetic Indian applications (Kaggle) |
| Used for | Personal, Flexi and consumer durable loans | Every application | Only when no product is chosen |
| Result | ROC-AUC 0.756 (personal 0.70, consumer 0.62) | ROC-AUC 0.661 (was 0.621 without bureau facts) | 98.7% accuracy on near-rule-based data |
| Role | Second opinion: bottom 10% for the product goes to a human | Above 1.5x average risk goes to a human | Kept for comparison |

Neither model ever declines anyone on its own. Declines come only from a variant's published rules (see `PRODUCT_BOOK.md`).

## The data, and why it was changed

**Before:** the approval model learned from 4,269 synthetic rows whose labels follow a near-fixed rule (approve if CIBIL
is 550 or more, or the term is 4 years or less). It scored 98.7%, but only because the data was simple, and it had no
product type, no age, no existing loans and no repayment outcome.

**Now:** both main models learn from the **Home Credit Default Risk** competition data (Kaggle), real anonymised data
from a lender serving people with little or no credit history:

| Table | Rows | What it gives Patrata |
|---|---|---|
| `application_train.csv` | 307,511 | Who the applicant is, and whether they later had payment difficulties (8.1% did) |
| `previous_application.csv` | 1,670,214 | The lender's past **approve/refuse decisions**, by product type |
| `bureau.csv` | 1,716,428 | Each applicant's loans at other lenders: **active loans, debt, overdue days, history** |

The CSVs (about 750 MB) are **not committed**. The trained models in `backend/artifacts/` are.

## Approval model v2 (`train/train_approval_v2.py`)

**Target:** Approved = 1, Refused = 0. Cancelled and unused offers are dropped. 1,327,428 decided applications of
three types; 1,046,997 remain after the checks below.

| Home Credit product type | Approval rate | Patrata variants judged against it |
|---|---|---|
| Cash loans | 69% | Salaried, self-employed and Flexi Hybrid personal loans (Flexi Hybrid is a term loan) |
| Consumer loans (phones, electronics, computers, furniture) | 91% | Easy EMI and no-cost EMI |
| Revolving (credit lines) | 60% | None (kept in training) |

**Not covered, on purpose:** home loans (the data has none) and vehicle loans (very few). Judging a car loan against
phone loans would be unfair, so these are decided by their own rules plus the risk model, and the result says
"Approval model: not used" with the reason.

**Features (all unit-free, so they carry over to rupees):** loan versus monthly income, new EMI versus monthly income,
tenure, age, years in the job, employment type, dependents, home and vehicle ownership, product type.
Monotone constraints: a bigger EMI or loan relative to income can only lower approval; more years in the job can only raise it.

**Leakage checks (the model must not cheat):**
1. The proposed EMI and tenure are blank for 14% of refusals but never for approvals, so those rows are dropped.
2. Down payment is not used: it is blank for 70% of refusals but 36% of approvals.
3. Nothing decided after approval (final amount, insurance) is used.
4. The applicant's profile comes from a later date, so age and job years are stepped back to the decision date.

**Results on 209,400 held-out decisions:** ROC-AUC 0.756 (logistic regression 0.748); personal 0.697, consumer 0.619.

**How it is used:** each product's bottom 10% of predicted approval goes to a credit officer. Evidence:

| Product | Refused in the bottom 10% | Refused among everyone else |
|---|---|---|
| Personal (cash) | 66% | 27% |
| Consumer | 19% | 8% |

Fairness: average predicted approval is 80.7% for women and 81.2% for men. Gender is never an input.

## Repayment-risk model v2 (`train/train_risk.py`)

**Target:** payment difficulties (Home Credit `TARGET`), 8.07% on average.

**Features:** new EMI versus income, age, years in the job, employment type, dependents, home and vehicle ownership,
plus **credit-report facts** built from `bureau.csv`: active loans and cards, outstanding debt versus monthly income,
any payment overdue now, years of credit history, new loans in the last 12 months, and no credit history at all.
Gender, education and marital status are excluded on purpose.

**Results on 61,500 held-out loans:** ROC-AUC 0.661 (0.621 before bureau facts). The riskiest 10% default 6.0x as
often as the safest 10%.

| Band | Share of borrowers | Actually defaulted |
|---|---|---|
| Low (below 6.05%) | 40% | 4.2% |
| Medium | 43% | 8.8% |
| High (12.1% and above) | 17% | 15.5% |

First-time borrowers (no bureau record) defaulted 10.1% of the time against 7.7%: riskier, but not enough to decline
them, which supports Patrata's "refer, don't decline" rule (RBI, January 2025). Average predicted risk: women 8.0%,
men 8.2%.

## CIBIL

None of the real datasets contains CIBIL scores, so CIBIL is used the way lenders publish it: as a **per-variant
cut-off** (clear, review, minimum). The behaviour behind a CIBIL score (overdue payments, debt, history length,
recent borrowing) is what the risk model now learns from real bureau records.

## Retrain on your Mac

```bash
cd ~/patrata/backend && source .venv/bin/activate
python3 - << 'PY'
import shutil
from huggingface_hub import hf_hub_download
for f in ["application_train.csv", "previous_application.csv", "bureau.csv"]:
    shutil.copy(hf_hub_download("minhSpaceX/home_credit", f, repo_type="dataset"), f"data/home_credit_{f}")
PY
python train/train_approval_v2.py   # about 4 minutes
python train/train_risk.py          # about 2 minutes
pytest -q
```

The original Kaggle data is at https://www.kaggle.com/c/home-credit-default-risk/data (needs a Kaggle login). The
legacy v1 model still retrains with `python train/train.py` and the dataset at
https://www.kaggle.com/datasets/architsharma01/loan-approval-prediction-dataset.

## What is not learned from data

The product book (`backend/app/products.json`) sets each variant's rules: age, income, CIBIL, EMI burden, amount,
tenure, loan-to-value. Two further rules apply to every variant: a payment overdue now declines, and three or more
new loans in a year needs a review (Patrata assumption). Changing these needs no retraining.
