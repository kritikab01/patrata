# Security policy

Patrata is a student project and a decision-support demo. It is not a lender and holds no real customer data.

## Reporting a problem

Please **do not open a public issue** for a security problem. Use GitHub's
[private vulnerability reporting](https://github.com/kritikab01/patrata-app/security/advisories/new)
or contact the maintainer through her GitHub profile ([@kritikab01](https://github.com/kritikab01)).
I aim to reply within 7 days.

## What the app does to protect users

- No PAN, Aadhaar, phone number or address is collected.
- The borrower's first name and check history stay in their own browser.
- Only derived figures and rule results are sent to the AI provider, after consent.
- The engine records decisions and officer reviews in an audit log.

## Known gaps (tracked for v1.1 / v2)

- The lender-desk PIN is a screen-level gate in the demo; the server-side desk key must be set on the engine to protect the review endpoint.
- The engine currently allows requests from any origin; it will be restricted to the Netlify site.
- Hosting and the LLM provider are likely outside India; RBI's digital lending rules require Indian data storage before real use.
- Officer logins and roles are planned for v2.
