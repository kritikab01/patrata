## What Patrata does
Patrata is a pre-screening tool for loan officers at small NBFCs and banks. An officer enters an applicant's age, dependents, annual income, existing EMIs, loan amount, term, interest rate, CIBIL score and asset values. Within a second Patrata returns Approve, Refer to a credit officer, or Decline, with the policy checks, the factors that drove the model, and the smallest change to the loan that would clear all checks. It is decision support only: a credit officer makes the final decision.

## What Approve, Refer and Decline mean
Approve means all policy checks pass and the model's approval likelihood is at least 75%. The file can move to document collection and sign-off. Refer means a human must look: a policy check is in the review band, the model and the policy disagree, the model is unsure (between 30% and 75%), or the applicant is outside the data the model was trained on. Decline means a hard policy rule failed (age, CIBIL below 600, or EMI burden above 65%), or the model's likelihood is below 30% while a review flag is also present.
Keywords: meaning of refer referred decline declined approve approved outcome result

## CIBIL score bands
A CIBIL score runs from 300 to 900. Patrata's policy treats 700 and above as clear, 600 to 699 as needing a credit officer's review, and below 600 as a decline. In the training data, approvals jump from about 10% below a score of 550 to over 99% at 550 and above, which is why the policy bands matter: they stop a one-point change in score from swinging a decision from decline straight to approve.
Keywords: minimum CIBIL credit score need needed required threshold good score what score

## FOIR and EMI burden
FOIR stands for Fixed Obligation to Income Ratio. It is all monthly EMIs, existing plus the new loan's EMI, divided by monthly income. Patrata treats up to 50% as clear, 50% to 65% as needing review, and above 65% as a decline. Lower the FOIR by reducing the loan amount, extending the term, or closing an existing loan.
Keywords: reduce EMI burden lower FOIR affordability obligations

## How the EMI is calculated
The EMI is estimated with the standard reducing-balance formula: EMI = P × r × (1 + r)^n / ((1 + r)^n − 1), where P is the loan amount, r is the monthly interest rate (annual rate ÷ 12 ÷ 100) and n is the number of monthly instalments. The interest rate entered on the form is used only for this estimate; it does not change the model's score.

## Age rule
Applicants must be between 21 and 60 years old. The form also blocks any application where age plus loan term goes past 75, because the loan would run past a typical working life.

## How the machine-learning model works
Patrata uses two machine-learning models, both XGBoost with SHAP explanations and trained on real lending data from Home Credit (Kaggle). The approval model learned from 1,046,997 real approve-or-refuse decisions on personal (cash) loans, consumer loans and credit lines, using unit-free facts: loan size and EMI versus monthly income, tenure, age, years in the job, employment type, dependents, and home or vehicle ownership. It is a second opinion: when every rule passes but an application falls in the bottom 10% for its product, a credit officer looks. It is not used for home and vehicle loans, because the data has no home loans and very few vehicle loans. The repayment-risk model learned from 307,511 real loans and 1.7 million credit-bureau records. The original approval model, trained on 4,269 synthetic Indian applications, is kept only for applications with no product chosen.
Keywords: machine learning model XGBoost how does it work trained features approval model second opinion

## Why the model's accuracy is so high
The original approval model scored 98.7% accuracy because its 4,269 synthetic rows follow a near-fixed rule (approve if CIBIL is 550 or more, or the term is 4 years or less). That is why Patrata replaced it with a model trained on 1,046,997 real decisions. On real data the scores are lower but honest: ROC-AUC 0.756 overall for approvals (0.70 for personal loans, 0.62 for consumer loans) and 0.661 for repayment risk. In the approval model's bottom 10% for personal loans, 66% of applicants were really refused, against 27% for everyone else.
Keywords: accuracy 98 98.7 percent too high suspicious synthetic overfitting good performance ROC AUC how accurate real data

## What moved the model
For every application Patrata shows which factors pushed the decision towards approval or against it, using SHAP values computed by XGBoost. For the approval model, tenure, the type of loan, age, loan size versus income and years in the job matter most. For repayment risk, years of credit history, age, years in the job and outstanding debt versus income matter most. The bar length shows how strongly each factor pushed this one application.

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

## Repayment risk model
The repayment-risk model estimates the chance a borrower has payment difficulties. It was trained on 307,511 real Home Credit loans plus 1.7 million credit-bureau records, so it sees current obligations the way a credit report shows them: active loans and cards, outstanding debt versus income, any payment overdue now, years of credit history, and new loans in the last 12 months. It also uses the new EMI's share of income, age, years in the job, employment type, dependents, and home or vehicle ownership. Gender, education and marital status are left out on purpose. Its ROC-AUC is 0.661, up from 0.621 before credit-report facts were added, and the riskiest tenth of borrowers default 6 times as often as the safest tenth. Borrowers at 1.5 times the average default rate of 8.1% or more are high risk and go to a credit officer; it never declines anyone on its own. First-time borrowers defaulted 10.1% of the time against 7.7% for others: riskier, but not enough to decline them.
Keywords: default risk repayment probability Home Credit real data second model 307511 credit bureau active loans outstanding debt overdue history

## Employment and job stability
Lenders look at how stable the income is. Salaried and government employees with several years in the same job are lower risk; people new to a job, or very young borrowers, default more often in the data. Self-employed applicants are judged on business vintage, so enter years running the business. Applicants with no regular employment are always sent to a credit officer to verify income.
Keywords: salaried self employed business government pensioner unemployed not employed job jobs change changing switch new job stability vintage affect

## Types of retail loans
Common retail loans in India: personal loans (unsecured, usually 1 to 5 years, higher interest), home loans (secured on the property, up to 20 to 30 years, lower interest), loan against property, car and two-wheeler loans (secured on the vehicle), gold loans (secured on gold jewellery, quick, short term), education loans, and business or MSME loans. Secured loans are cheaper because the lender can recover the asset; unsecured loans rely entirely on income and credit history.
Keywords: personal loan home loan housing car loan vehicle two wheeler gold loan education loan business loan MSME secured unsecured types kinds

## Documents usually needed
Lenders typically ask for KYC (PAN and Aadhaar or another address proof), income proof (recent salary slips, Form 16 or income tax returns), and bank statements for the last several months. Self-employed applicants usually need two to three years of income tax returns, business proof such as GST registration, and business bank statements. Home loans also need property papers. Exact lists vary by lender.
Keywords: documents papers KYC PAN Aadhaar salary slip payslip ITR income tax return Form 16 bank statement proof required need

## How to improve a CIBIL score
Pay every EMI and credit card bill on time, since payment history matters most. Keep credit card use well below the limit (many advisers suggest under about 30%). Avoid applying to many lenders in a short time, because each application adds a hard enquiry. Keep old accounts open, keep a healthy mix of secured and unsecured credit, and check your credit report regularly for errors. Scores improve gradually over months, not days.
Keywords: improve increase raise boost build fix CIBIL credit score low score repair tips how to

## Disputing errors in a credit report
Credit reports can contain mistakes, such as a closed loan shown as open or someone else's account. You can raise a dispute with the credit bureau (for example CIBIL) online, and the bureau checks with the lender. CIBIL received about 22.9 lakh complaints in 2024-25, of which around 5.8 lakh were due to its own errors, so it is worth checking your report.
Keywords: dispute error mistake wrong incorrect credit report correction complaint CIBIL bureau

## Hard and soft enquiries
A hard enquiry happens when a lender pulls your credit report because you applied for a loan or card; many hard enquiries close together can lower your score. A soft enquiry, such as checking your own score or a pre-approved offer check, does not affect it. Patrata's pre-screening itself does not pull a credit report.
Keywords: hard enquiry soft enquiry inquiry credit check pull affects score multiple applications

## New to credit borrowers
People with no credit history are often called new to credit. The RBI's Master Direction of 6 January 2025 says first-time borrowers should not be rejected only because they have no credit history. Lenders can look at income stability, bank statements and other information instead. A small secured credit card or a small loan repaid on time is a common way to start building a history.
Patrata supports this: choose 'No credit history yet' on the form. The approval model is skipped (it needs a CIBIL score), the repayment-risk model still runs because it doesn't use CIBIL, and the case goes to a credit officer to check income and bank statements instead of being declined.
Keywords: no credit history first time borrower new to credit NTC thin file no CIBIL score build credit history

## Fixed and floating interest rates
A fixed rate stays the same for the agreed period, so the EMI is predictable. A floating rate moves with a benchmark, so the EMI or tenure can rise or fall over time. For floating-rate retail loans, banks link the rate to an external benchmark such as the RBI repo rate. Fixed rates are usually set a little higher to cover the lender's risk.
Keywords: fixed floating variable interest rate repo rate benchmark EBLR MCLR which is better

## Tenure and EMI trade-off
A longer tenure lowers the monthly EMI but increases the total interest paid; a shorter tenure does the opposite. A common approach is to choose the shortest tenure whose EMI still fits comfortably within your budget, and prepay when you can.
Keywords: tenure term longer shorter reduce EMI total interest trade off duration years

## Prepayment and foreclosure
Prepaying part of a loan reduces either the EMI or the remaining tenure, and saves interest. RBI rules do not allow foreclosure or prepayment charges on floating-rate term loans taken by individuals for purposes other than business. Fixed-rate loans and business loans may carry charges, so check the loan agreement.
Keywords: prepayment part payment foreclosure close loan early charges penalty pay off

## Key Fact Statement and loan costs
Banks and NBFCs must give borrowers a Key Fact Statement (KFS) for retail and MSME loans before signing. It shows the annual percentage rate (APR), which includes interest and fees, the EMI schedule, and charges. Compare loans on APR, not just the headline interest rate. Processing fees, insurance and other charges all add to the real cost.
Keywords: KFS key fact statement APR annual percentage rate processing fee charges hidden costs compare loans

## Co-applicants and guarantors
Adding a co-applicant, usually a spouse or parent with income, lets the lender count both incomes, which lowers the EMI burden and can raise the eligible amount. Both are equally responsible for repayment, and the loan appears on both credit reports. A guarantor only pays if the borrower doesn't.
Keywords: co-applicant co applicant joint loan spouse guarantor add income increase eligibility

## Balance transfer and debt consolidation
A balance transfer moves an existing loan to another lender offering a lower rate; it can save money if the rate gap outweighs fees. Debt consolidation combines several high-interest debts, such as credit card dues, into one cheaper loan, which can lower the total EMI burden.
Keywords: balance transfer refinance switch lender lower rate debt consolidation credit card debt combine

## Complaints and grievance redressal
If a lender doesn't resolve a complaint, borrowers can escalate to the lender's grievance redressal officer, and then to the RBI Ombudsman under the Integrated Ombudsman Scheme, usually if there is no satisfactory reply within 30 days. Digital lending apps must also show grievance contact details.
Keywords: complaint grievance ombudsman RBI escalate harassment recovery agent problem with lender

## Review Agent
For a referred or flagged case, the credit manager can ask the Review Agent for help. It is an AI agent: the language model decides which tool to use next (re-score the application with a different amount, term or EMIs; look up policy; work out the full loan cost including the processing fee and APR), reads each result, and after at most four steps writes a memo recommending approve, approve with conditions, decline, or more information. Its memo is checked so every number comes from a tool, and it can never recommend a plain approval when a hard policy rule failed. It only advises: the credit manager records the final decision and reason. Without an AI connection, a scripted plan runs the same tools.
Keywords: agent agentic AI review agent copilot tools memo credit manager assistant automation

## Credit report facts
Besides the CIBIL score, Patrata asks for five facts from the applicant's credit report: the number of active loans and cards, the total outstanding on them, whether any payment is overdue right now, years since the first loan or card, and new loans or cards in the last 12 months. A payment overdue now declines the application until it is cleared. Three or more new loans in a year sends it to a credit officer, because heavy recent borrowing can signal stress (a Patrata policy assumption). All five feed the repayment-risk model, which learned their effect from 1.7 million real credit-bureau records.
Keywords: credit report current obligations active loans outstanding overdue missed payment credit history new loans credit hunger bureau
