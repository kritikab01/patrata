# Data and model

## The dataset

**Loan Approval Prediction Dataset** by Archit Sharma, Kaggle:
https://www.kaggle.com/datasets/architsharma01/loan-approval-prediction-dataset

- 4,269 past loan applications, 13 columns, no missing values
- Indian context: amounts in rupees, CIBIL score
- Target: `loan_status` (Approved / Rejected), 62% approved

| Column | Meaning | Used by the model? |
|---|---|---|
| `loan_id` | Row id | No |
| `no_of_dependents` | People relying on the applicant's income | Yes |
| `education` | Graduate / Not Graduate | **No** (no signal, fairness risk) |
| `self_employed` | Yes / No | **No** (no signal, fairness risk) |
| `income_annum` | Annual income, ₹ | Yes |
| `loan_amount` | Amount requested, ₹ | Yes |
| `loan_term` | Years (2 to 20) | Yes |
| `cibil_score` | 300 to 900 | Yes |
| `residential_assets_value` | ₹ (28 rows negative, set to 0) | Via total assets |
| `commercial_assets_value` | ₹ | Via total assets |
| `luxury_assets_value` | ₹ | Via total assets |
| `bank_asset_value` | ₹ | Via total assets |
| `loan_status` | Approved / Rejected | Target |

The CSV is **not committed** to GitHub (it's someone else's dataset). The trained model is committed,
so the app runs without it. You only need the CSV to retrain.

## Engineered features (`backend/app/features.py`)

The same code runs at training time and in the live app, so the model always sees identical inputs.

- `loan_to_income` = loan amount ÷ annual income
- `total_assets` = sum of the four asset columns (negatives clipped to 0)
- `asset_coverage` = total assets ÷ loan amount

## What `train/train.py` does, step by step

1. **Load and clean**: strip spaces from column names and values, convert the target to 1/0.
2. **Data audit**: approval rate by CIBIL band and by term, education and self-employment gaps,
   negative asset rows, loan-to-income range, accuracy of the one-line rule. Saved into the metadata.
3. **Split**: 80% training, 20% test (854 applications), stratified, fixed seed 42 so results repeat.
4. **Baseline**: scaled logistic regression.
5. **Main model**: XGBoost (300 trees, depth 4) with **monotone constraints**: CIBIL can only raise
   approval, loan-to-income can only lower it, asset cover can only raise it.
6. **Validation**: 5-fold cross-validated ROC-AUC on the training set, then accuracy, precision,
   recall, F1, Brier score and a confusion matrix on the untouched test set.
7. **Fairness check**: approval rates by education and self-employment on the test set.
8. **Explainability**: mean |SHAP| per feature (XGBoost's built-in TreeSHAP).
9. **Save**: `artifacts/model.json` (the model), `artifacts/metadata.json` (metrics, audit, training
   ranges for the out-of-range guard, version stamp) and four charts in `reports/figures/`.

Current results: XGBoost **98.7%** accuracy, ROC-AUC **0.9996**; logistic regression 91.6%;
one-line rule 95.8%. Be open that the high accuracy comes from a near-rule-based dataset.

## Retrain on your Mac

```bash
cd ~/patrata/backend && source .venv/bin/activate
mv ~/Downloads/loan_approval_dataset.csv data/
python train/train.py                   # about 10 seconds; prints all metrics
python scripts/evaluate_scenarios.py    # personas + stability → reports/scenario_results.md
pytest -q                               # everything must still pass
```

Restart the server afterwards. Every decision records the model version it was made with.

## Switching to a different dataset

The rest of the app (rules, guard, explanations, UI) doesn't care where the model came from, as long
as the model receives the 8 features above. To swap data:

1. Put the new CSV in `backend/data/`.
2. In `train/train.py`, change `DATA` and `load()` so the new columns are renamed to this project's
   names (`income_annum`, `loan_amount`, `loan_term`, `cibil_score`, the asset columns,
   `no_of_dependents`) and the target becomes `y` (1 = approved or repaid, 0 = rejected or defaulted).
3. If the new data lacks a column (for example assets), set it to 0 in `load()` and say so in the report.
4. Run the retrain commands above.
5. Update the numbers quoted in `backend/app/knowledge.md` (the assistant's knowledge) so it
   doesn't cite old accuracy figures, and check `reports/scenario_results.md` still makes sense.

Good candidates if you ever need more realistic data: Kaggle's *Credit Risk Dataset* (32,581 loans with
a default outcome) or *Home Credit Default Risk* (real lender data, much larger). Both predict
**default**, which is closer to real credit risk than past approvals.

## What is not learned from data

These are business policy, set in `backend/app/config.py`, not trained:
age 21 to 60, CIBIL floor 600 and review band 600 to 699, EMI burden review above 50% and decline above 65%,
approve only at 75%+ model likelihood. Changing them changes decisions immediately, with no retraining.
