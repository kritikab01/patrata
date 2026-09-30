## What Patrata does
Patrata is a pre-screening tool for loan officers at small NBFCs and banks. An officer enters an applicant's age, dependents, annual income, existing EMIs, loan amount, term, interest rate, CIBIL score and asset values. Within a second Patrata returns Approve, Refer to a credit officer, or Decline, with the policy checks, the factors that drove the model, and the smallest change to the loan that would clear all checks. It is decision support only: a credit officer makes the final decision.

## What Approve, Refer and Decline mean
Approve means all policy checks pass and the model's approval likelihood is at least 75%. The file can move to document collection and sign-off. Refer means a human must look: a policy check is in the review band, the model and the policy disagree, the model is unsure (between 30% and 75%), or the applicant is outside the data the model was trained on. Decline means a hard policy rule failed (age, CIBIL below 600, or EMI burden above 65%), or the model's likelihood is below 30% while a review flag is also present.
Keywords: meaning of refer referred decline declined approve approved outcome result

## CIBIL score bands
A CIBIL score runs from 300 to 900. Patrata's policy treats 700 and above as clear, 600 to 699 as needing a credit officer's review, and below 600 as a decline. In the training data, approvals jump from about 10% below a score of 550 to over 99% at 550 and above, which is why the policy bands matter: they stop a one-point change in score from swinging a decision from decline straight to approve.
Keywords: minimum CIBIL credit score needed required threshold

## FOIR and EMI burden
FOIR stands for Fixed Obligation to Income Ratio. It is all monthly EMIs, existing plus the new loan's EMI, divided by monthly income. Patrata treats up to 50% as clear, 50% to 65% as needing review, and above 65% as a decline. Lower the FOIR by reducing the loan amount, extending the term, or closing an existing loan.
Keywords: reduce EMI burden lower FOIR affordability obligations

## How the EMI is calculated
The EMI is estimated with the standard reducing-balance formula: EMI = P × r × (1 + r)^n / ((1 + r)^n − 1), where P is the loan amount, r is the monthly interest rate (annual rate ÷ 12 ÷ 100) and n is the number of monthly instalments. The interest rate entered on the form is used only for this estimate; it does not change the model's score.

## Age rule
Applicants must be between 21 and 60 years old. The form also blocks any application where age plus loan term goes past 75, because the loan would run past a typical working life.

## How the machine-learning model works
The model is XGBoost, a gradient-boosted decision tree model, trained on 4,269 past loan applications from the Kaggle Loan Approval Prediction Dataset. It uses CIBIL score, loan term, annual income, loan amount, loan-to-income ratio, total assets, asset cover on the loan, and number of dependents. Monotone constraints guarantee that a higher CIBIL score or more asset cover can never lower the approval chance, and a higher loan-to-income ratio can never raise it. On 854 held-out applications it scored 98.7% accuracy, against 91.6% for logistic regression and 95.8% for a one-line rule.

## Why the model's accuracy is so high
The dataset's labels follow an almost fixed rule: approve if CIBIL is 550 or more, or if the term is 4 years or less. A one-line rule already reaches 95.8% accuracy. High accuracy therefore reflects a simple, synthetic dataset rather than real-world credit risk. Real bureau and repayment data would be needed before live use.
Keywords: accuracy 98 98.7 percent too high suspicious synthetic overfitting good performance

## What moved the model
For every application Patrata shows which factors pushed the decision towards approval or against it, using SHAP values computed by XGBoost. The bar length shows how strongly each factor pushed this one application. CIBIL score usually dominates, followed by loan term and loan amount.

## Out-of-range guard
If an applicant is unlike anyone in the training data, for example income above about ₹1 crore a year, a loan below ₹3 lakh, no declared assets, more than five dependents, or a term above 20 years, Patrata refers the case to a human instead of trusting the score. In testing, an applicant earning ₹3 crore a year got only a 6.9% approval chance from the model, a confident but wrong answer caused by extrapolation, which is why this guard exists.

## Fairness
Education and self-employment were removed from the model. In the data they made no difference to approval rates (62.5% versus 62.0%), so excluding them removes a fairness risk at no cost to accuracy. Gender, religion, caste and location are never collected.

## Privacy and data sent to the AI
Patrata never asks for name, PAN, Aadhaar, phone number or address. Only derived figures, such as the decision, rule results and formatted amounts, are sent to the AI model's API (Llama 3.3 on Groq by default, or Google Gemini) to write explanations. Free AI tiers may keep or use submitted content under the provider's terms, which is another reason no personal identifiers are sent.
Keywords: personal data PAN Aadhaar privacy send sent share third party API Groq Gemini LLM

## Role of the AI model
The large language model (Llama 3.3 70B on Groq by default; Google Gemini, OpenAI, OpenRouter or a local Ollama model can be switched in with one setting) writes the plain-language explanation in English or Hindi and answers questions in this assistant. It never makes or changes a decision. Every number in its explanation is checked against the calculation; if it states a number that isn't in the facts, or if the AI service is down or slow, a fixed template explanation is shown instead.
Keywords: AI approve decide artificial intelligence LLM generative Groq Llama Gemini can the AI change decision explanation writer
## Human review and accountability
Referred cases go to the Review queue, where a credit manager records a final decision and a written reason. Any decision can be overridden with a reason, and every review is stored with the reviewer and time. Accountability stays with the lender: RBI's Digital Lending Directions, 2025 require the regulated lender to assess creditworthiness, so Patrata supports that judgement rather than replacing it.
Keywords: accountable accountability responsible responsibility liable liability blame wrong decision mistake who decides final say override human in the loop credit manager

## RBI digital lending rules
The Reserve Bank of India issued the Digital Lending Directions on 8 May 2025, replacing the 2022 guidelines. They apply to banks and NBFCs and cover creditworthiness assessment, disclosures such as the Key Fact Statement, grievance redressal, and limits on collecting, sharing and storing borrower data.

## India's data protection law
The Digital Personal Data Protection Act, 2023 and its Rules, notified in November 2025, are being phased in, with full obligations from May 2027. They require clear consent, purpose limitation and data minimisation, which Patrata follows by collecting no personal identifiers.

## Batch screening
The Batch screening page lets an officer upload a CSV of many applications, score them all at once, and download the results. It is how Patrata would handle a busy branch or a DSA partner sending a list of leads.

## What-if simulator
On each result, the what-if simulator lets the officer move the loan amount, term and CIBIL score and see the decision, approval likelihood and EMI burden update live. It is useful for advising an applicant on what would make the loan work.

## Hindi support
Explanations and assistant answers are available in English and Hindi. Use the language switch on the result or in the assistant.
