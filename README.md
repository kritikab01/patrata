# Patrata (पात्रता) — explainable loan pre-screening platform

![CI](../../actions/workflows/ci.yml/badge.svg)

A decision-support platform for loan officers and credit managers at small NBFCs. It screens a
retail loan application in under a second and returns **Approve**, **Refer to a credit officer**,
or **Decline**, with the policy checks, the factors that drove the model, the smallest change that
would get it approved, and a human review workflow on top.

> Built for the *AI for Managers* end-term project (FORE School of Management).
> Decision support only: a human credit officer owns every final decision.

## What's inside

| Area | Features |
|---|---|
| Two models | Approval model (4,269 Indian applications) plus repayment-risk model (307,499 real Home Credit loans) |
| Dashboard | KPIs, decisions per day, why cases need attention, approval by CIBIL band, recent cases |
| New application | Example applicants, 3-step form with Indian number formatting, live affordability preview (EMI, EMI-burden and CIBIL meters) |
| Result | Decision stamp, status tracker, policy checks, SHAP drivers, suggested change, what-if simulator, AI explanation in English/Hindi with read-aloud, guarded Q&A with voice input, printable decision note (PDF) |
| Review queue | Referred cases for a credit manager; final decision needs a written reason; overrides are labelled and audited |
| Review Agent | AI agent (LLM + tools + loop): re-scores options, looks up policy, computes loan cost and APR, drafts a memo; guarded, and a person decides |
| Batch screening | CSV template, upload or sample batch, score up to 500 rows, invalid rows reported, results download |
| Assistant | EMI, affordability and eligibility calculators (computed in code), 30 cited knowledge topics, labelled general guidance for other loan questions, Hindi, voice in and out, injection and off-topic guardrails |
| Model and governance | Accuracy vs baselines, feature importance, data audit, fairness check, thresholds, limitations, privacy |

## Architecture

```
frontend/  React + TypeScript + Tailwind + Recharts  ──build──▶  backend/static/
backend/   FastAPI  ──▶ /api/...   (scoring, simulate, batch, reviews, stats, explain, ask, assistant)
            ├─ rules.py      policy checks (age, CIBIL, FOIR) — deterministic
            ├─ model.py      XGBoost + TreeSHAP drivers + out-of-range guard
            ├─ policy.py     rules + probability → decision, counterfactual search
            ├─ explain.py    LLM explanations (Groq by default) with number verification + template fallback
            ├─ agent.py      Review Agent: LLM plans tool calls, guarded loop, scripted fallback
            ├─ assistant.py  BM25 retrieval over knowledge.md + cited LLM answers
            ├─ store.py      SQLite audit log, reviews, dashboard statistics
            └─ seed.py       sample applications for the demo (marked "Sample")
Dockerfile  one container serves the web app and the API on Hugging Face Spaces
```

## How a decision is made

```
Officer fills the form
 → Validation        reject impossible values, warn on implausible ones
 → Policy rules      age band, CIBIL floor, FOIR (EMI burden) cap   ← deterministic
 → ML models         XGBoost approval model + repayment-risk model (307k real loans)
 → Range guard       inputs outside the training data → human review
 → Decision policy   rules + probability → Approve / Refer / Decline
 → Counterfactual    smallest amount/term change that would clear all checks
 → LLM (Groq/Llama)  writes the plain-language explanation (EN/हिंदी) — never decides
 → Audit log         every decision stored with model version
```

**The one design rule:** the model decides, the rules act as a safety net, and the LLM only
explains. The LLM never sees names or IDs, never computes a number, and any number it writes
that isn't in the facts it was given causes its answer to be thrown away in favour of a
deterministic template.

## What we found in the data (be honest about this in the report)

| Finding | Number |
|---|---|
| Approval rate with CIBIL below 550 | 10.4% |
| Approval rate with CIBIL 550+ | 99.5% |
| Accuracy of the one-line rule "approve if CIBIL ≥ 550 or term ≤ 4 yrs" | 95.8% |
| Logistic regression baseline | 91.6% accuracy |
| XGBoost (this model) | 98.7% accuracy, ROC-AUC 0.9996 |
| Effect of education / self-employment on approval | none (62.5% vs 62.0%), so both were excluded |
| Rows with negative asset values | 28 (clipped to zero) |

The labels are close to a synthetic rule, so high accuracy says more about the dataset than
about real credit risk. That is why the app wraps the model in policy rules, a range guard and
a Refer band. See `backend/reports/figures/cibil_curve.png` for the cliff at CIBIL 550.

## Run it on a Mac

```bash
brew install uv libomp
cd ~/patrata/backend
uv venv --python 3.12
source .venv/bin/activate
uv pip install -r requirements-dev.txt
cp .env.example .env                  # paste your Groq key into .env

pytest -q                             # 61 tests, each mapped to an evaluation question
uvicorn app.main:app --reload         # app at http://127.0.0.1:8000, API docs at /docs
```

The built web app is already in `backend/static`. To change the UI, install Node and run the
frontend in development mode next to the backend:

```bash
brew install node
cd ~/patrata/frontend && npm install
npm run dev            # http://localhost:5173, talks to the backend on port 8000
npm run build          # writes the production build into backend/static
```

The trained model is already in `artifacts/`. To retrain, download `loan_approval_dataset.csv` from
[Kaggle](https://www.kaggle.com/datasets/architsharma01/loan-approval-prediction-dataset) into
`backend/data/` and run `python train/train.py`. `python scripts/evaluate_scenarios.py` regenerates
the personas and stability report in `reports/scenario_results.md`.

Get a free Groq API key (no credit card) at [console.groq.com/keys](https://console.groq.com/keys) and set `GROQ_API_KEY`.
Gemini, OpenAI, OpenRouter or a local Ollama model also work: see `backend/.env.example`.
Without a key the app still works and uses template explanations.

## API (all under `/api`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Status, model version, whether the LLM is configured |
| GET | `/api/llm-check` | Makes one tiny AI call to confirm the key works |
| GET | `/api/model-card` | Metrics, data audit, fairness check, limitations, policy thresholds |
| POST | `/api/score` | Score an application (idempotent on `request_id`) |
| GET | `/api/applications` | Decisions, filterable by decision and status |
| GET | `/api/applications/{id}` | Reload a decision after a refresh |
| POST | `/api/applications/{id}/explain?lang=en\|hi` | Plain-language explanation |
| POST | `/api/applications/{id}/ask` | Questions about this decision only |
| POST | `/api/applications/{id}/review` | Credit manager's final decision with a written reason |
| GET | `/api/reviews/queue` | Referred cases waiting for review |
| POST | `/api/simulate` | What-if scoring; nothing is saved |
| POST | `/api/batch` | Score up to 500 applications |
| GET | `/api/stats` | Dashboard figures |
| POST | `/api/assistant` | Policy assistant with cited sources |

## Deploy (automatic, free)

The live app runs on **Render** (free web service, Docker). Every push to `main` runs the tests on GitHub
(`.github/workflows/ci.yml`) and Render redeploys automatically.

Render settings: runtime **Docker**, instance **Free**, health check `/api/health`, environment variables
`GROQ_API_KEY` (free at console.groq.com) and `PORT=7860`.

The free instance sleeps after 15 minutes without visitors, and the first visit then takes about a minute.
Its disk is temporary, so history resets on restart and the sample data is regenerated in the background.

## Install it on a phone

Patrata is a Progressive Web App: open the link, then
- **Android (Chrome):** menu → **Install app** (or **Add to Home screen**)
- **iPhone (Safari):** Share → **Add to Home Screen**

It opens full-screen with its own icon, like any installed app.

## Documentation

- [`docs/DATA_AND_MODEL.md`](docs/DATA_AND_MODEL.md): dataset, features, training pipeline, retraining, swapping data
- [`docs/DESIGN.md`](docs/DESIGN.md): design system (Vault structure, UPI Blue accent, Receipt slip)

## Evaluation map

| Question | Where it's answered |
|---|---|
| B-Q3, F-Q3 out-of-scope and injection | `explain.ask` guard; `test_injection_is_refused`, `test_off_topic_is_refused` |
| B-Q4 privacy | `explain.build_facts` sends derived facts only; `test_no_pii_sent_to_llm` |
| B-Q5 API down / garbage | timeout + template fallback; `test_llm_garbage_falls_back` |
| C-Q1 confidently wrong | very high earner gets 6.9% from the model (extrapolation); range guard refers it |
| C-Q4 model limitation | LLM hallucinated numbers blocked; `test_llm_hallucinated_number_is_blocked` |
| E-Q2 input validation | `schemas.py`; `test_validation_*` |
| E-Q3 rule vs model disagreement | `model_policy_conflict` flag; `test_model_policy_conflict_is_surfaced` |
| E-Q5 refresh / double submit | SQLite store + `request_id`; `test_double_submit_is_idempotent` |
| E-Q6 100 users a day | batch screening, explanation cache, template fallback under free-tier AI rate limits |
| B-Q6 RAG | assistant retrieves from `knowledge.md`; 12-question retrieval test in `test_assistant_retrieval_eval_passes` |
| C-Q2, C-Q3 human oversight | review queue, mandatory written reason, audited overrides; `test_review_workflow_and_status` |
| E-Q7 similar inputs, different outputs | `reports/scenario_results.md` CIBIL sweep and ±1% perturbation |

## Credits

Patterns adapted (not copied) from these open-source projects:
[credit-risk-underwriting-platform](https://github.com/RiteshShingre2004/credit-risk-underwriting-platform)
(LLM never decides; verify LLM numbers),
[LoanLens](https://github.com/SahanaRSetty/LoanLens) (same dataset, SHAP + FastAPI),
[CreditSentinel](https://github.com/faiber1986/CreditSentinel) (reason codes grounded in SHAP),
[loan-eligibility-system](https://github.com/Tejeshyewale/loan-eligibility-system) (Hindi/English reasons).
Dataset: [Loan Approval Prediction Dataset](https://www.kaggle.com/datasets/architsharma01/loan-approval-prediction-dataset) by Archit Sharma.
