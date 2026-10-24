# Encyclopedia Features Implementation Plan

**Goal:** Implement the requested research and review tools on separate review branches, preserving main.
**Architecture:** Extend the existing vanilla browser UI and Cloudflare D1 APIs. Pure evidence helpers are shared with Node tests; generated material never writes curated profiles. Pull requests are stacked in the requested order so each diff stays reviewable.
**Tech Stack:** JavaScript modules, Node test runner/SQLite, TypeScript route adapters, D1, GitHub Actions.
**Spec:** `docs/automated-campaign-assessment-design.md` and the owner's October 24 implementation request.

## Global constraints
- No merge, deploy, automatic profile edits, or paid research during implementation.
- Curated evidence first; unsupported campaign associations remain unknown.
- Sunday monitoring produces review candidates only. Default schedule: Sunday 08:00 America/Chicago, configurable in the workflow.
- Research defaults: 4 starts/day per user, 12 globally/day, 40 globally/month, 4 search calls/run, 4,000 output tokens/run. Attempts reserve quota before provider access, including failures. Paid monitoring is disabled; public-feed monitoring has zero model spend.
- Continue `feature/automated-campaign-assessments`; subsequent branches stack on the previous feature.

## Review focus
Cross-user access; stale profile approval; unsupported campaign evidence; concurrent quota reservations; missing/ambiguous dates.

## Tasks
1. Assessment generator: `lib/campaign-assessment.mjs`, `server/assessments.mjs`, route, migration, tests and UI. Test missing campaign-linked evidence, citation/excerpt/date validation, persistence, tenant isolation, optimistic review conflicts and no profile writes.
2. AI assistant: extend `server/research.mjs` and schema with atomic quotas, explicit cost notice in existing research UI; test exhausted budgets and idempotency.
3. Gap analyzer: `lib/intelligence-gaps.mjs`, tests and profile UI. Report missing evidence, dates, sections, campaign elements, and suggested collection questions without inventing facts.
4. Comparison: `lib/actor-comparison.mjs`, tests and existing compare UI. Show shared/unique techniques and missing coverage separately, never infer attribution from overlap.
5. Timelines: `lib/campaign-timeline.mjs`, tests and profile UI. Sort partial dates without inventing precision; retain undated/invalid entries and source links.
6. Reports: `lib/report.mjs`, tests and download controls. Export Markdown/JSON with dated citations, explicit draft/assessment labels and unknowns.
7. Watchlist and monitoring: authenticated D1 watchlist API/UI, checked-in country defaults, public feed scanner and Sunday Actions workflow. Tests cover isolation, review-only artifacts, source/actor matching, deduplication, timeouts, and zero paid calls.

## Execution
For each task: write regression tests, observe failures, implement, run the complete test suite, commit on a feature branch and create its review PR. Run build/CI where dependencies are available; disclose environmental blockers. Review the final stack before handoff.
