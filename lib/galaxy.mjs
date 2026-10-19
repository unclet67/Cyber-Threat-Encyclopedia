// Conservative matching: case and whitespace only. No fuzzy or transitive identity merges.
export const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
export const entryNames = entry => [entry.name, ...(entry.aliases || [])].filter(Boolean);
export const actorNames = actor => [actor.primaryName, actor.msName, ...(actor.aliases || []).map(x => x.name)].filter(Boolean);
export function correlateMicrosoft(entry, mappings) {
  const names = new Set(entryNames(entry).map(normalizeName));
  return mappings.flatMap(mapping => {
    const matchedNames = [mapping.name, ...mapping.aliases].filter(name => names.has(normalizeName(name)));
    return matchedNames.length ? [{ ...mapping, matchedNames, relation: 'candidate', authority: 'Microsoft primary mapping' }] : [];
  });
}
export function compareEntry(entry, actor, snapshot) {
  const microsoft = correlateMicrosoft(entry, snapshot.microsoft);
  const names = new Set(actorNames(actor).map(normalizeName));
  const matchedNames = entryNames(entry).filter(name => names.has(normalizeName(name)));
  const gaps = ['Validate Galaxy actor/campaign/activity-cluster scope against primary reporting before asserting equivalence.'];
  if (!matchedNames.length) gaps.push('No exact profile name/alias match; selection is an analyst research lead.');
  if (!microsoft.length) gaps.push('No direct Microsoft primary mapping match. Do not infer a Microsoft designation.');
  if (microsoft.length > 1) gaps.push('Multiple Microsoft candidates: resolve ambiguity; do not merge identities.');
  if (actor.msName && microsoft.length && !microsoft.some(m => normalizeName(m.name) === normalizeName(actor.msName))) gaps.push('Microsoft mapping conflicts with the current profile designation.');
  if (entry.meta?.country && actor.country !== entry.meta.country) gaps.push('Galaxy country differs from profile; assess attribution and entity scope.');
  gaps.push('Galaxy references have unverified publication dates and claim support; retrieval date is not a publication date.');
  const checks = {
    identification: actor.identification?.summary && actor.identification?.firstObserved,
    attribution: actor.attribution?.sponsor && actor.attribution?.confidence && actor.attribution?.basis,
    objectives: actor.objectives, targeting: actor.targeting?.sectors?.length && actor.targeting?.regions?.length,
    capabilities: actor.capabilities?.summary, attack: actor.attack?.length, campaigns: actor.campaigns?.length,
    diamond: ['adversary','capability','infrastructure','victim'].every(k => actor.diamond?.[k]),
    gaps: actor.gaps?.length, implications: actor.implications?.jipoe && actor.implications?.jcc2,
    sources: actor.sources?.length && actor.sources.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date || '')),
  };
  for (const [key, present] of Object.entries(checks)) if (!present) gaps.push(`Research Required: incomplete profile ${key}; Galaxy metadata does not fill this section automatically.`);
  return { status: 'Research Required', entryId: entry.uuid, actorId: actor.id, matchedNames, microsoft, gaps,
    proposed: { description: entry.description, aliases: entry.aliases, metadata: entry.meta, relationships: entry.related || [] },
    provenance: snapshot.sources,
    references: entry.refs.map(url => ({ url, publishedAt: null, retrievedAt: snapshot.retrievedAt, verification: 'Research Required' })),
    currentSources: actor.sources || [],
  };
}
