# Changelog

All notable changes to the Patrata app. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]
- v1.1 hardening: enforce the server-side desk key, restrict CORS to the Netlify site, stop the LLM from writing "proceed with disbursement" style next steps, keep Hindi source tags.

## [1.0.0] - 2026-10-04
First public release (course MVP), live at https://patrata-loan-screener.netlify.app

### Added
- Repository documentation: README, PRD, decision log, changelog, security policy, contributing guide, MIT license.
- CI on GitHub Actions: TypeScript check and production build on every push and pull request.
- Issue and pull request templates; social preview image.

### Fixed
- Check form opened from Home showed an amount but no tenure or rate, so "Next" did nothing. Each product now fills sensible defaults and missing fields show a clear "Please fix" banner.
- Model and governance page showed retrieval accuracy as "25%" instead of 100% (25/25).

### Changed
- Package renamed to `patrata-app` and versioned 1.0.0; unused Supabase dependency removed; Bolt template files removed.

## [0.9.0] - 2026-10-03 (Google AI Studio + Netlify)
- Borrower app redesign: Home with greeting and word of the day, 3-step Check with live preview, Tools (EMI, borrow power, prepayment, EMI burden, compare), My checks, Help with grievance officer.
- Lender desk behind a PIN: dashboard, review queue, Review Agent, batch screening, compare, model and governance.
- Consent before scoring, receipt-style decision slip with print/PDF, PWA install, English/Hindi.
- Deployed from GitHub to Netlify.

## [0.2.0] - 2026-09 (Bolt.new v2)
- Hindi, lender desk, batch screening and compare. https://kritikab01-patrata-b-ooku.bolt.host

## [0.1.0] - 2026-09 (Bolt.new v1)
- Minimal app for the brief: input form, score, drivers, Approve / Refer / Reject. https://patrata-loan-prescre-xpvs.bolt.host
