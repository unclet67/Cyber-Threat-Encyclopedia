# Research features and review workflow

The feature pull requests are stacked in this order: campaign assessments → AI Research Assistant → gap analyzer → actor comparison → campaign timelines → report export → watchlist/monitoring. Review and merge them in order only after owner approval. No deployment is included.

## Assessment generator

Open an actor and select **Campaign assessment**, then select a documented campaign. The deterministic generator uses curated campaign evidence at zero model cost. It does not treat actor-level Diamond Model fields as campaign facts. Missing evidence stays unknown, including when a profile contains only a campaign summary. Campaign summaries use the campaign's listed source refs; publication dates retain their recorded precision.

For recorded element evidence, campaign objects may carry `evidence: [{element, text, excerpt, sourceRef}]`. `element` is adversary/capability/infrastructure/victim; the source ref must belong to that campaign and resolve to a unique, dated HTTP(S) source. The excerpt is profile evidence supplied by an analyst, not a claim that this software independently fetched/verified a passage. Existing profiles without these excerpts remain useful gap-analysis drafts. Review the original reporting before accepting an assessment.

Private Site users can save review notes and explicitly accept a draft after acknowledging unknowns. Review decisions are versioned and audited; changed profiles make a draft stale. An accepted assessment stays separate from curated profiles. Public snapshots offer generation/export without persistence or approval.

## AI Research Assistant and API controls

The existing provider-backed assistant proposes sourced section replacements. Check suggested changes and source links, select sections, open the editor, then explicitly **Save changes**. The assistant never automatically overwrites a profile.

No paid API requests or key changes were made during implementation. Keep the existing server-only `OPENAI_API_KEY` configuration. Never put secrets in browser JavaScript, GitHub variables, or repository files.

Server limits are enforced atomically before starting a provider request; failed/timeout attempts retain their reservation:

| Control | Hard ceiling | Optional lower-limit variable |
|---|---:|---|
| User starts per UTC day | 4 | `RESEARCH_USER_DAILY_RUNS` |
| Global starts per UTC day | 12 | `RESEARCH_GLOBAL_DAILY_RUNS` |
| Global starts per UTC month | 40 | `RESEARCH_MONTHLY_RUNS` |
| Output tokens per run | 4,000 | Code review required to change |
| Search/tool calls per run | 4 | Code review required to change |

Zero disables a run limit. Invalid settings fail closed. Idempotent retries reuse existing jobs; budgets count all existing research jobs in the period. These are volume/token controls, not a guaranteed dollar cap. Input, search and provider pricing also affect cost. A dedicated provider project with billing alerts is an additional control; alerts should not be treated as guaranteed spending enforcement. Use monthly limit zero to disable new paid research.

## Gap analysis, comparison, timelines and reports

- **Analyze intelligence gaps** identifies missing sections, dated citations and campaign-specific evidence; it proposes PIR/EEI collection prompts. Priorities refer to evidence gaps, not threat severity.
- **Compare** preserves the existing side-by-side view and adds shared/observed-unique ATT&CK IDs and pairwise Jaccard overlap. Missing coverage is unknown; overlap is not attribution.
- **Campaign history** sorts valid record dates with their original precision, retains malformed/undated entries and exposes source publication dates separately. A disclosure date is not silently relabeled as an intrusion date.
- Profile/comparison/assessment buttons download Markdown and JSON reports. Exports retain citations, unknowns and analytic labels. They do not independently reverify reporting or publish changes.

## Private watchlist and shared Sunday monitoring

The Site watchlist stores each signed-in user's actor interests and notes privately with revision checks. Pausing an entry preserves its notes. The shared GitHub monitor uses **only** `config/monitoring.json`, not personal D1 entries. Change the shared actor registry by reviewed pull request; personal notes never leave the Site.

The selected default registry covers major China, Russia, Iran and North Korea actors already in the dataset. It is an initial analyst selection, not an authoritative ranking. Names/aliases remain research leads; alias matches do not prove identity.

The workflow screens six configured government/vendor/MITRE feeds, caps each response at 2 MB and each request at 20 seconds, and performs **zero paid model calls**. Feed outages and partial coverage appear in `review-candidates.json`. Screening is not exhaustive internet research. Dates in feed metadata remain unverified until an analyst opens the source. MITRE release notices enter a separate taxonomy review category.

Schedule: Sunday **08:00 America/Chicago**, using 13:00/14:00 UTC triggers plus a DST-aware gate. GitHub may delay scheduled jobs; a delay beyond the local hour can skip a scan. Manual `workflow_dispatch` bypasses the time gate. GitHub schedules become active only after an approved merge to the default branch. No workflow was activated by merging or deploying in this task.

Review each run in **Actions → Weekly actor monitoring** and download the `actor-monitor-review-<run_id>` artifact. Check feed errors, validate original sources, resolve alias/campaign scope, then use the assistant/editor or a separate reviewed data PR. The workflow has read-only repository permissions, no model key, and no profile write path. It does not create profile-update PRs or approve changes. A cached content fingerprint suppresses duplicates for one year; cache loss may repeat candidates, never profile writes.

## Release preparation (requires separate authorization)

Before a future deployment, apply `0003_campaign_assessments.sql` and `0004_watchlist.sql` to the target D1 database using the existing migration process. These additive migrations and Drizzle metadata are committed; no remote database was changed. Verify authenticated API calls in the target hosting environment and provision the existing research secret if absent. Public GitHub Pages cannot persist private watchlists or approvals.

## Validation

`npm test` runs Node/SQLite API and helper tests plus Python monitoring fixtures. `npm run build` builds the public snapshot and private Site bundle. Feature checks run both in GitHub Actions; the final PR also smoke-tests live public feeds and uploads coverage/results without publishing anything.
