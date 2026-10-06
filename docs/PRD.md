# Patrata: Product Requirements Document

| | |
|---|---|
| **Product** | Patrata (पात्रता, "eligibility"): explainable loan pre-screening |
| **Owner** | Kritika Bhachawat |
| **Version** | 1.0 (course MVP, shipped) · v2 and v3 planned |
| **Status** | Live: [patrata-loan-screener.netlify.app](https://patrata-loan-screener.netlify.app) |
| **Last updated** | October 2026 |
| **Context** | End-term project, *AI for Managers: Applications and Strategy*, FORE School of Management. Use case #5 from the course menu: *Loan eligibility / credit-risk pre-screener* (App format). |

---

## 1. Problem

Retail lending in India is moving to digital journeys, but the decision itself is still a black box for the person applying.

1. **Borrowers apply blind.** They don't know the lender's rules (minimum CIBIL, EMI-to-income limits, age at loan end). Each rejected application adds a hard enquiry to their credit report and lowers their score. Rejections rarely come with a reason or a fix.
2. **Officers waste time on obvious cases.** A large share of files clearly pass or clearly fail policy. Officers still open them one by one, and the borderline files that need judgement get less attention.
3. **Regulation is raising the bar.** RBI's Digital Lending Directions (2025) ask for minimal, need-based data, a Key Fact Statement and a grievance officer. The DPDP Act and Rules require clear consent. RBI's FREE-AI framework (2025) expects explainability and human oversight for AI in finance.

**Opportunity:** one engine that tells the borrower *where they stand and why* before they apply, and lets the lender spend human time only where it is needed, with an audit trail.

## 2. Goals and non-goals

**Goals (v1)**

- G1. A borrower gets an Approved / Referred / Declined pre-screen in **under 2 minutes** with no PAN, Aadhaar or phone number.
- G2. Every outcome is **explained**: each rule with value vs benchmark, the model's top reasons, and what to change.
- G3. A lender desk where **every Referred case is reviewed by a person** who records a reason.
- G4. AI is used **safely**: the LLM never decides, never invents numbers, and refuses out-of-scope requests.
- G5. Works on a phone, in **English and Hindi**, and installs like an app.

**Non-goals (v1)**

- Sanctioning or disbursing loans; Patrata is not a lender.
- Pulling credit-bureau reports or verifying documents.
- Storing identity data or contact details.
- Personalised financial advice.

## 3. Users and personas

| Persona | Type | Jobs to be done | Pains |
|---|---|---|---|
| **Riya, 26**, first salaried job, Jaipur | Borrower (end user) | "Tell me if I'll get a ₹5 lakh personal loan and what EMI I can manage." | Fear of rejection and score damage; jargon; English-only apps |
| **Arjun, 31**, credit officer at an NBFC | Lender (end user) | "Clear my queue fast without missing risk." | Manual checks on obvious files; no quick way to test "what if" |
| **Meera, 42**, head of credit / risk | Lender (buyer) | "Faster turnaround, controlled risk, audit-ready decisions." | Black-box models; compliance exposure; override tracking |

## 4. Use cases and user stories

| ID | As a… | I want to… | So that… | Priority | v1 |
|---|---|---|---|---|---|
| U1 | Borrower | check my eligibility for a specific loan in a few steps | I know my chances before applying | Must | ✅ |
| U2 | Borrower | see why I was referred or declined, rule by rule | I understand the decision | Must | ✅ |
| U3 | Borrower | see the smallest change that would help (amount, tenure) | I can fix it before applying | Must | ✅ |
| U4 | Borrower | use the app in Hindi | I'm comfortable reading it | Should | ✅ |
| U5 | Borrower | calculate EMI, borrow power, prepayment savings and real cost (APR) | I plan an affordable loan | Should | ✅ |
| U6 | Borrower | save or print a decision slip | I can carry it to the bank | Should | ✅ |
| U7 | Borrower | ask questions about my result | I get answers without calling anyone | Should | ✅ |
| U8 | Borrower | know who to complain to | I have a grievance route | Must (regulatory) | ✅ |
| L1 | Officer | see referred cases with the reason they need attention | I review the right files first | Must | ✅ |
| L2 | Officer | get an AI-drafted review memo with options tested | I decide faster | Should | ✅ |
| L3 | Officer | record a final decision with a written reason | it is auditable | Must | ✅ |
| L4 | Officer | screen a CSV of applicants at once | I can handle volume | Should | ✅ |
| L5 | Officer | compare two applicants side by side | I can explain why similar files differ | Could | ✅ |
| L6 | Risk head | see volumes, approval rates, reasons for referral and overrides | I manage the portfolio | Should | ✅ |
| L7 | Risk head | see model accuracy, fairness and limits | I can trust and govern the model | Must | ✅ |
| L8 | Risk head | have officers log in with their own accounts and roles | access is controlled | Must (v2) | ⏳ |

## 5. Requirements

### 5.1 Functional

| # | Requirement |
|---|---|
| F1 | 4 loan products, 9 variants (personal, home, consumer durable, vehicle), each with its own rules from lenders' published criteria and RBI caps, stored as data (`products.json`). |
| F2 | 3-step form (loan, about you, credit) with sensible defaults per product, sample profiles and a live preview. |
| F3 | Validation in the browser and again on the server; clear field-level messages; nothing scored until valid. |
| F4 | Decision policy: hard rule fail → **Decline**; soft rule (e.g. CIBIL 600–699, EMI burden 50–65%) → **Refer**; approval model in its product's bottom 10% → **Refer**; else **Approve**. The model never declines alone. |
| F5 | Result shows verdict, approval likelihood, EMI burden, default-risk band, SHAP reasons, every rule with value vs benchmark, documents to keep ready, and a counterfactual suggestion. |
| F6 | Plain-language explanation in English or Hindi from an LLM, with number verification and a template fallback. |
| F7 | Scoped Q&A on the result and a general policy assistant grounded in 30 notes (BM25), with visible sources. |
| F8 | Decision slip (print / PDF) with EMI, rate, fee, APR and total interest. |
| F9 | Local history (My checks), drafts, URL state; idempotent submit (`request_id`). |
| F10 | Lender desk behind a PIN: dashboard, review queue, Review Agent, batch CSV, compare, model and governance. |
| F11 | Every decision and officer review written to an audit log with model version. |

### 5.2 Non-functional

| Area | Requirement |
|---|---|
| Speed | Score + rules < 1 s on a warm engine; explanation typically 1–3 s |
| Availability | Calculators work offline; app shows a "waking up" state when the free engine is asleep |
| Privacy | No PAN, Aadhaar, phone or address collected; only derived figures reach the LLM; consent before scoring |
| Accessibility | Mobile-first, large tap targets, readable contrast, Hindi support |
| Quality | 83 engine tests; TypeScript check and build on every push |
| Explainability | Every outcome traceable to rules, model reasons and a model card |

## 6. AI design

| Component | Role | Why this choice |
|---|---|---|
| Rule engine (Python) | Applies lender and RBI criteria exactly | Lending rules must be deterministic and auditable |
| XGBoost + SHAP | Approval likelihood and repayment risk, with per-decision reasons | Best fit for tabular data; explainable |
| LLM on Groq | Rewrites the decision in plain English / Hindi; answers questions | Fast, free tier, open-weight models; never decides |
| BM25 retrieval | Grounds assistant answers in written policy notes | Simple, transparent, testable (25/25 top-1) |
| Review Agent | Plans tool calls (simulate, policy lookup, loan cost), drafts a memo | Saves officer time; scripted fallback if the plan is invalid |

Guardrails: decision locked before the LLM runs; number verification; injection and scope guards; no identity data in prompts; template fallback; human review for every Refer.

## 7. Success metrics

| Type | Metric | v1 baseline / target |
|---|---|---|
| **North star** | % of pre-screened borrowers who apply and get approved | To be measured in a pilot |
| Borrower | Check completion rate (start → result) | Target > 70% |
| Borrower | Time to result | < 2 minutes |
| Lender | Officer minutes per application | Target −30% in a pilot |
| Lender | Share of files cleared by rules without manual review | Track |
| Quality | Explanation fallback rate (LLM failed or blocked) | Track; alert if > 10% |
| Quality | Retrieval top-1 accuracy | 25/25 (100%) on test set |
| Fairness | Approval-rate gap across groups | 0.5 pp (80.7% vs 81.2%) on training data |
| Governance | Override rate and reasons | Track per officer |

## 8. Competitive landscape

| Player | Type | Strength | Gap Patrata fills |
|---|---|---|---|
| Paisabazaar | Borrower marketplace | Offers from many lenders, free credit report | No rule-by-rule explanation or fix; needs bureau pull |
| FinBox Sentinel | Lender business-rule engine | Powerful back-office rules | Nothing that explains decisions to the borrower in simple language |
| Manual officer review | Status quo | Judgement | Slow, inconsistent, little audit detail |

**Positioning:** one engine for both sides; explanation and human oversight are the product, not an afterthought.

## 9. Business model

- **B2B SaaS for lenders (NBFCs, small banks, fintechs):** monthly plan with a screen quota plus a per-screen fee; the desk, batch screening and audit features are the paid tier.
- **White-label widget / API:** lenders and DSAs embed the borrower check on their own sites to receive better-prepared applicants.
- **Borrowers use it free.**
- **Go-to-market:** one NBFC pilot; replay 3 months of past applications through batch screening to show officer hours saved and referral accuracy.

## 10. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LLM states something wrong with confidence (e.g. "proceed with disbursement") | Misleads borrower | Prompt rule + banned-phrase check; template fallback; "decision support only" on every screen |
| Self-declared inputs are wrong | Wrong pre-screen | Clear labelling as a pre-screen; v2 Account Aggregator verification |
| Data stored outside India | Regulatory block | v2 India-region hosting for engine and LLM |
| LLM price change or model deprecation | Cost / outage | Model is one setting; multiple providers supported; template fallback |
| Competitor with bureau access copies the idea | Market | Focus on explanation quality, Hindi and the lender desk |
| Model bias | Unfair outcomes | Fairness check in model card; v3 live bias monitoring |

## 11. Compliance checklist

| Requirement | v1 | Plan |
|---|---|---|
| Need-based data only (RBI DL Directions 2025) | ✅ No PAN/Aadhaar/phone | — |
| Consent before processing (DPDP) | ✅ Consent box naming third-party AI | v2 consent log on server |
| Key Fact Statement | ✅ Slip with EMI, APR, fees | Exact RBI KFS format |
| Grievance officer | ✅ In Help, with RBI Ombudsman link | Ticket numbers |
| Data stored in India | ❌ | v2 India region |
| Human oversight, explainability (RBI FREE-AI) | ✅ Review queue, model card, audit log | v3 drift and bias monitoring |
| Access control for officers | ⚠️ PIN + server desk key | v2 logins and roles |

## 12. Release plan

| Release | Scope | Exit criteria |
|---|---|---|
| **v1.0** (shipped) | Everything in §5 except L8 | Live on Netlify + Render; course evaluation questions answered |
| **v1.1** | Enforce desk key, lock CORS, LLM next-steps wording, Hindi source tags | Engine patch deployed; 83 tests green |
| **v2** | Logins/roles, PostgreSQL, India hosting, consent log, AA income verification, WhatsApp, more languages | One NBFC pilot running |
| **v3** | Multi-tenant rule books, lender API/widget, monitoring, retraining on Indian data | Two paying lenders |

## 13. Open questions

1. Which lender segment first: small NBFCs (fast to sign) or fintech lending partners (higher volume)?
2. What is the right refer band per product once real outcome data is available?
3. Should the borrower see the approval likelihood number, or only bands, to avoid over-reading it?
4. Which Indian languages after Hindi: by applicant volume or by lender geography?
