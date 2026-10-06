# Decision log

Short records of the product and technical choices behind Patrata, why they were made, and what was traded off.

---

### D1. Rules and models decide; the LLM only explains
**Context.** Lending decisions must be exact, repeatable and auditable. LLMs are fluent but can be confidently wrong and can invent numbers.
**Decision.** Decisions come from a deterministic rule engine plus XGBoost scores. The LLM is called only after the decision is locked, and only to rewrite it in plain language.
**Trade-off.** Less "magical" conversation; much lower risk. Every LLM number is checked against the engine's numbers, with a template fallback.

### D2. The model can refer, never decline
**Context.** The repayment-risk model is only moderately strong (ROC-AUC 0.661).
**Decision.** A weak model signal sends a case to a person (Refer). Only hard policy rules can Decline.
**Trade-off.** More manual reviews; fewer wrong rejections.

### D3. A Refer band for CIBIL 600–699
**Context.** With a single cut-off, one point of CIBIL flipped Decline ↔ Approve.
**Decision.** Below 600 fails, 600–699 goes to an officer, 700+ is clear.
**Trade-off.** Slightly more referrals; no cliff from decline to approve.

### D4. Hand-code the engine, AI-build the interface
**Context.** The course asked for an AI app builder. The decision logic had to be mine and testable.
**Decision.** Engine written in VS Code (FastAPI, 83 tests) and deployed on Render. Interface built with AI builders on top of the same API.
**Trade-off.** Two repos to maintain; but the UI could be rebuilt three times without touching the decision logic.

### D5. Bolt.new → Google AI Studio → Netlify
**Context.** Bolt free tokens ran out twice (v1, v2). Google AI Studio's Publish needed a billing account.
**Decision.** Keep the code on GitHub, edit in Google AI Studio, deploy from GitHub to Netlify.
**Lesson.** Push to GitHub from day one; the builder is replaceable, the repo is not.

### D6. Groq for the LLM
**Context.** Needed a free, fast model that follows a JSON format; the brief allowed Gemini "or any other".
**Decision.** Groq-hosted open-weight models (GPT-OSS 120B and Llama 3.3 70B, with automatic fallback). Provider and model are one setting in the engine.
**Trade-off.** Free-tier rate limits; servers likely outside India (to fix in v2).

### D7. No PAN, Aadhaar or phone number
**Context.** RBI's need-based data principle and the DPDP Act. A pre-screen does not need identity.
**Decision.** Only the numbers needed to pre-screen; first name stays on the device; consent before scoring.
**Trade-off.** Inputs are self-declared, so v1 cannot verify them. Account Aggregator verification is planned for v2.

### D8. BM25 retrieval instead of embeddings
**Context.** 30 short policy notes; needed transparent, testable grounding.
**Decision.** BM25 keyword retrieval with visible source chips; evaluated on 25 questions (25/25 top-1).
**Trade-off.** Weaker on paraphrases than embeddings; simple and explainable at this size.

### D9. A PWA instead of native apps
**Context.** Borrowers are mostly on phones; no budget for app stores.
**Decision.** Progressive Web App with manifest and service worker; installs from the browser.
**Trade-off.** No push notifications on all devices; zero store friction.

### D10. Bilingual from v1
**Context.** Many first-time borrowers prefer Hindi.
**Decision.** EN / हिं toggle for navigation, greeting, explanations and Q&A.
**Trade-off.** More strings to maintain; much wider reach.
