# What changed: products and variants (Steps 1 and 2)

## The feedback

A credit professional reviewing Patrata asked: *"Is CIBIL the only parameter? Rather than that, choose the product
first (personal, home, consumer), then its variants, and give each variant predefined criteria, as banks and NBFCs
publish them. CIBIL, age, income and current obligations differ by product."*

He was right. Patrata used **one set of rules for every loan**, so a ₹40,000 phone loan and a ₹45 lakh home loan
were judged by the same age, CIBIL and EMI limits. No real lender works that way.

## Before and after

| | Before | After |
|---|---|---|
| First question | Applicant's age | **Which product, which variant?** |
| Products | One generic loan | **4 products, 9 variants**: personal (salaried, self-employed, Flexi Hybrid), home (salaried, self-employed), consumer durable (standard, no-cost EMI), vehicle (new car, two-wheeler) |
| Rules | Same for everyone | **Each variant has its own**: who can apply, age today and at the end of the loan, minimum income, job or business years, CIBIL, EMI burden, amount, tenure, loan-to-value |
| Where the numbers come from | Patrata's own choice | **Lenders' published criteria** (HDFC, ICICI, IndusInd, Bajaj Finance, Kotak, SBI, Poonawalla, Tata Capital, TVS Credit, Bandhan) and **RBI rules**. Our own choices are marked ‡ |
| Special products | None | **Flexi Hybrid**: interest-only EMIs for 24 months, affordability tested on the full EMI after that. **No-cost EMI**: 0% interest. **Home loans**: RBI loan-to-value caps |
| When the applicant doesn't fit | Declined | Declined, **plus** "Variants this applicant fits" and the smallest change that would work |
| Where you see it | Only in results | **Product catalogue page** with every rule and its source; this document; the assistant answers product questions |

## Why vehicle loans, and not business loans

Your reviewer named personal, home and consumer loans. Vehicle loans (car and two-wheeler) were added because they
are one of the largest retail lending categories in India and a core business for NBFCs. Business (MSME) loans
were left out on purpose: they are judged on business financials (GST returns, balance sheets, bank cash flows)
that a pre-screening form can't assess fairly.

## The checks every variant runs

1. Is this variant offered to this kind of employment?
2. Is the applicant old enough?
3. Will the loan end before the age limit? (A shorter tenure can fix this.)
4. Is income above the minimum?
5. Enough years in the job or business? (If not, a credit officer checks.)
6. CIBIL: clear, needs review, or below the minimum. **No credit history is never an automatic decline** (RBI, January 2025).
7. EMI burden on the EMI this variant really charges (current obligations plus the new EMI).
8. Is the amount within the variant's limits?
9. Is the tenure within the variant's limits?
10. Loan-to-value: home loans use RBI caps (90% up to ₹30 lakh, 80% for ₹30 to 75 lakh, 75% above); vehicles and
    consumer goods use a share of the price.
11. Repayment risk from the model trained on 307,511 real loans.

Any **fail** means decline, any **review** means a credit officer looks, and all **pass** means approve.

## What happens to the machine-learning models

- The **approval model** (4,269 applications) is used only when the loan looks like the data it learned from. For
  small, short loans (phones, bikes) it is outside that data, so Patrata says **"Approval model: not used"** and
  decides on the variant's rules and the repayment-risk model instead. That is the honest choice: the model is
  not trusted where it has never seen similar loans.
- The **repayment-risk model** (307,511 real loans) runs for every variant.
- **Step 3 (next)** replaces the synthetic approval data with real approve/refuse decisions by product type, and
  adds credit-bureau behaviour (active loans, overdue history) to the risk model.

## How this answers the evaluation questions (Section E)

| Question | Answer now |
|---|---|
| E-Q1 Input to output | Product → variant → applicant → loan → credit. The variant decides which rules run; AI adds the approval score (when it applies), repayment risk, the explanation, the assistant and the Review Agent |
| E-Q2 Input checks | Each variant asks only for what it needs (property value for home loans, price for vehicles and consumer goods) and rejects impossible combinations, such as a variant from another product |
| E-Q3 AI vs rule of thumb | The variant's rules are lenders' own rules of thumb. When the approval model disagrees, the case is flagged "model and policy disagree" and goes to a human |
| E-Q4 Explanation | Every check shows the applicant's value, the variant's threshold and the source in the catalogue |
| E-Q5 State | The chosen product and variant are saved with the draft and the result |
| E-Q6 100 users a day | The product book is one data file: credit teams change rules without changing code, and batch screening accepts a variant column |
| E-Q7 Similar inputs, different outputs | A ₹30 lakh home loan may borrow 90% of the property value; ₹30,00,001 drops to 80% (RBI slab). That jump is a regulation, not model instability, and Patrata shows it as a rule |

## Tests

14 new automated tests cover the product engine (76 in total): RBI loan-to-value caps, age at the end of the
loan, Flexi Hybrid's full-EMI test, no-cost EMI at 0%, first-time borrowers, minimum income and tenure limits,
wrong-variant suggestions, validation, batch rows and the assistant's product answers.

---

# What changed: real data for both models (Step 3)

## In simple words

**Before:** the approval model learned from 4,269 made-up applications that follow an almost fixed CIBIL rule, and
the risk model knew nothing about the applicant's other loans.

**Now:**

| | What it learns from | What it adds |
|---|---|---|
| Approval model v2 | **1,046,997 real approve/refuse decisions**, by product type | A lender's real judgement on loan size, EMI, tenure, age and job stability, separately for personal and consumer loans |
| Risk model v2 | 307,499 real loans **plus 1,716,428 credit-bureau records** | Current obligations the way a credit report shows them |

**New questions on the form** (the credit-report facts): active loans and cards, total outstanding on them, any
payment overdue now, years of credit history, new loans in the last 12 months. First-time borrowers skip them.

**Two new rules for every variant:** a payment overdue right now declines the application until it is cleared, and
three or more new loans in a year sends it to a credit officer.

## Why the numbers look lower, and why that is better

The old model claimed 98.7% because its data was simple. Real lending is harder: the new approval model scores
ROC-AUC 0.756 and the risk model 0.661. These are honest numbers, and they come with evidence: applicants the approval
model puts in a personal loan's bottom 10% were really refused 66% of the time, against 27% for everyone else.

## The careful parts (good material for Section C)

- **Leakage:** refused applications often had a blank EMI or down payment. A model would learn "blank means refused",
  which is cheating. Those rows and that field were dropped.
- **Fair comparison:** vehicle loans were first judged against phone loans and were wrongly sent to review. The data
  has very few vehicle loans, so vehicle and home loans now say "Approval model: not used" and rely on their rules.
- **Second opinion, not a judge:** the approval model can send a case to a human, never decline it.
- **Fairness:** gender is never an input. Average predicted approval: women 80.7%, men 81.2%. Average predicted risk:
  women 8.0%, men 8.2%.
- **First-time borrowers:** in real data they defaulted 10.1% of the time against 7.7%. Riskier, but not enough to
  decline them, which supports the RBI-aligned "refer, don't decline" rule.

## A worked example for E-Q7 (similar inputs, different outputs)

The same Flexi Hybrid applicant, ₹8 lakh, only the tenure changes:

| Tenure | Decision | Why |
|---|---|---|
| 3 or 4 years | Approved | Every rule passes and the approval model agrees |
| 5 years | Referred | Real lending data refused long cash loans more often; this lands in the bottom 10% |
| 6 or 7 years | Referred | Longer than any real decision the model saw, so a human confirms |

All referred cases get the same advice: "Changing the tenure to 4 years would clear every check." The jump between 4 and
5 years is justified by real data, not instability. An earlier version approved 6 years because the model simply
didn't vote outside its data; testing this found the gap, and now unusual loans go to a person instead.

## Tests

83 automated tests (7 new for Step 3): the bottom-10% review rule, overdue and new-loan checks, first-time borrower
validation, credit-report facts moving repayment risk, loans outside the model's data going to a human, and both
real-data models in the governance report.
