# Automated Campaign Assessment — MVP Design

## Purpose
Generate reviewable, evidence-backed campaign-specific Diamond Model and JIPOE assessments from the encyclopedia's curated intelligence, with optional external research to fill gaps.

## Workflow
1. Analyst selects a threat actor and a specific documented campaign.
2. Generator retrieves existing actor/campaign records and their cited source passages.
3. Generator assembles four Diamond Model elements: adversary, capability, infrastructure, victim.
4. Every claim is tagged as `sourced_fact`, `analytic_inference`, or `unknown`, with citation, source date, and confidence rationale.
5. Generator drafts operational implications, intelligence gaps, suggested PIRs, and EEIs.
6. Analyst reviews, edits, and explicitly accepts the draft before publication or modification of curated records.

## Required safeguards
- Never promote an actor-level capability, infrastructure indicator, or victim to a campaign-specific fact without campaign-linked evidence.
- Never invent IPs, domains, victims, citations, dates, or campaign associations.
- Missing evidence is `unknown`, not false or zero.
- No automatic overwrite of approved actor profiles.
- Separate generated draft state from approved published state.
- Retain provenance and audit trail for edits and approvals.

## Proposed assessment schema
- `assessment_id`, `actor_id`, `campaign_id`, `generated_at`, `status` (`draft` | `approved`)
- `diamond`: each element has `claims[]` containing `text`, `classification`, `confidence`, `confidence_rationale`, `source_ids[]`, `evidence_excerpt`, `gaps[]`
- `jipoe`: `operational_implications[]`, `pirs[]`, `eeis[]`, `intelligence_gaps[]`
- `review`: `reviewer`, `reviewed_at`, `edits[]`, `decision`

## Initial test
Use one specifically identified, documented Salt Typhoon campaign. Validate every generated element against campaign-level sources; leave unsupported elements unknown. Test draft persistence, citation integrity, and explicit approval before publish.

## Implementation order
1. Identify and reuse existing research-job, citation-validation, and profile APIs.
2. Implement typed schema and evidence-link validation.
3. Add draft-generation API and persistence, without profile writes.
4. Add Generate Campaign Assessment UI and reviewer controls.
5. Add automated tests for unsupported associations, missing citations, and non-overwrite behavior.

## Open design decision
Default to curated encyclopedia intelligence first, with external research only for identified gaps, unless the owner chooses fresh internet research for every assessment.
