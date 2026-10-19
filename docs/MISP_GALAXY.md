# MISP Galaxy enrichment and analyst review

This feature treats Galaxy as a structured research lead, never as a publisher. It imports no actor profiles and never changes `data/actors`, profile completeness, saved D1 profiles, or research jobs. Approval records an analyst decision in a separate table. It has no profile-apply or deployment operation.

## Inspect and compare

Use **Galaxy research** in the navigation, or **Inspect Galaxy enrichment** on a profile. Choose the encyclopedia profile and search Galaxy by name, alias, or cluster UUID. Exact profile names sort first. Inspect the description, raw metadata (including attribution and name attribution), typed relationships, and original references beside the existing profile and its CTI sources. Links open the original reporting; the interface does not claim it has independently verified their contents.

Microsoft correlation uses only the official `microsoft/mstic` mapping, recommended by Microsoft's naming documentation:
https://learn.microsoft.com/en-us/unified-secops/microsoft-threat-actor-naming

Matching normalizes case and whitespace only. A match is a **candidate**, even if several sources share a name. No fuzzy or transitive merging occurs. Multiple Microsoft mappings, country differences and disagreement with the current profile designation generate explicit gaps. A Microsoft-looking URL in Galaxy does not establish primary-source support. Microsoft mapping rows support the naming assertion reported by Microsoft, not universal equivalence of vendor scopes. Analyst judgments distinguish equivalent, overlap, related, distinct and unresolved.

## Workflow

1. **Research Required**: create a draft; inspect the proposed description, alias claims, relationships, source versions and gaps.
2. Enter an explicit relationship judgment, an explanation of scope and contradictions, and citations: URL, publication date, access date, publisher and title. Read the sources and verify the dates. Incomplete and impossible dates are rejected. Reference URLs are not automatically fetched or treated as supporting claims.
3. Submit as **Ready for Review**. This is an immutable evidence package, not approval or profile completeness.
4. An authenticated analyst explicitly chooses **Approve analyst record** or **Reject**. The reviewer identity and timestamp are retained. This is an account-owned review workflow; it does not enforce independent two-person separation of duties.
5. **Analyst Approved** decisions remain separate records. Incorporating a judgment into a profile requires a deliberate normal profile edit after reviewing the evidence; deployment is a separate owner-authorized operation. No automation links approval to either action.

Review records are scoped to account, actor, Galaxy cluster, feed snapshot and a hash of the exact profile. Profile or feed changes require a new draft. Older decisions and their histories remain inspectable; approved records cannot be restaged or overwritten in the same context. Optimistic revision checks reject competing writes. This protects the review package; it is not a guarantee of a transactional profile lock against a simultaneous ordinary profile edit.

Publication dates are separate from access/retrieval dates and repository commit dates. Feed publication dates and Galaxy reference publication dates remain null/unverified. Feed retrieval timestamps must not be reused as reporting dates. The workbench flags gaps in the existing eleven analytic sections without altering their completeness rules. Its stricter date check can flag existing non-ISO source dates even when the existing profile completeness indicator accepts them.

## Source snapshot

`data/enrichment/galaxy.json` contains normalized threat-actor Galaxy entries and Microsoft mappings. The manifest preserves immutable source URLs, upstream commit SHAs, SHA-256 hashes of downloaded bytes, repository commit timestamps, retrieval timestamps, Galaxy version/UUID/authors, original metadata and typed relationships. The snapshot ID hashes both feed content hashes, so content changes require fresh reviews. A later retrieval of unchanged content keeps the same snapshot ID.

Run `npm run enrichment:sync` explicitly to refresh. It resolves each official repository's commit, then downloads the file at that immutable commit, validates both inputs, and atomically replaces only the enrichment snapshot. It does not run during builds, on a schedule, or in response to browser requests. It does not crawl Galaxy references. Network failure, malformed/empty feeds and duplicate UUIDs fail before replacement. Review all staged source updates before release. This feature covers `clusters/threat-actor.json`; other Galaxy collections are outside this integration.

## Repository and private Site

Base: GitHub main `f9b929d`. That branch contained the public static site but no private Site runtime. This feature branch restores the previously working private runtime from local commit `7742958` (profile/research API, build configuration, schema, migrations and tests), adds enrichment, and retains all GitHub-main actor/scenario records. The configured private project remains `appgprj_6ad0ee35d5688191add9bb52bd1c5995`. No live D1 reads, writes, migrations, deployment, or changes to the original checkout were performed during implementation.

Static GitHub Pages supports read-only source inspection. The private Site provides saved reviews via `/api/enrichment`. New storage is additive: apply the generated `drizzle/0002_mushy_famine.sql` through the existing Site's migration process only during an authorized release. Preserve `profiles` and `research_jobs`; do not recreate or seed over the live database. A fresh local environment needs all three migrations in order. If review storage is absent, inspection works and review writes fail closed with a storage-unavailable message.

Validation: `npm test`, `npm run build`. Tests exercise ambiguity and nontransitive matching, citation validation, authentication/origin checks, state transitions, profile/snapshot changes, concurrency revisions, cross-account access, preservation of profile/research data and reviewed history. The static workbench was also inspected in a local browser. Live authenticated Site review behavior still requires validation after an authorized migration and deployment.

No public deployment or main-branch merge is authorized by this implementation request.
