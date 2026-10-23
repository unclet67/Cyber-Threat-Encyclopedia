// Deterministic, review-only campaign assessment seed. No unsupported claims are inferred.
const cited = (value, refs) => typeof value === 'string' && refs.some(ref => value.includes('[' + ref + ']'));
export function createCampaignAssessmentDraft(actor, campaignName) {
  if (!actor || typeof actor !== 'object') throw new Error('Actor profile required');
  if (typeof campaignName !== 'string' || !campaignName.trim()) throw new Error('Select a campaign');
  const campaign = (actor.campaigns || []).find(c => c.name === campaignName);
  if (!campaign) throw new Error('Campaign not found in this actor profile');
  const sources = (actor.sources || []).filter(s => s && typeof s.ref === 'string' && /^https?:\/\//.test(s.url || ''));
  const refs = sources.map(s => s.ref);
  const campaignRefs = (campaign.sources || []).map(r => String(r).replace(/^\[|\]$/g, ''));
  const verifiedRefs = campaignRefs.filter(r => refs.includes(r));
  const supported = verifiedRefs.length > 0 && cited(campaign.summary, verifiedRefs);
  const unknown = 'Research Required — no campaign-specific sourced evidence';
  const elements = {
    adversary: { assessment: supported ? actor.primaryName : unknown, evidenceRefs: supported ? verifiedRefs : [], status: supported ? 'attributed-in-profile; verify independently' : 'unknown' },
    capability: { assessment: unknown, evidenceRefs: [], status: 'unknown' },
    infrastructure: { assessment: unknown, evidenceRefs: [], status: 'unknown' },
    victim: { assessment: unknown, evidenceRefs: [], status: 'unknown' },
  };
  return {
    actorId: actor.id, actorName: actor.primaryName, campaign: campaign.name,
    campaignSummary: supported ? campaign.summary : unknown,
    diamond: elements, sources: sources.filter(s => verifiedRefs.includes(s.ref)),
    confidence: 'Not assessed', analyticJudgments: [], jipoe: { implications: [], pirs: [], eeis: [] },
    gaps: Object.entries(elements).filter(([,v]) => v.status === 'unknown').map(([key]) => 'Confirm campaign-specific ' + key + ' with original reporting.'),
    status: 'draft', requiresAnalystReview: true, publishable: false,
    cautions: ['Actor-level capabilities and victims are not automatically campaign evidence.', 'Attribution requires independent verification.'],
  };
}
