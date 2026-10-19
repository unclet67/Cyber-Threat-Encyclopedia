import { env } from 'cloudflare:workers';
import seed from '../../../data/bundle.json';
import snapshot from '../../../data/enrichment/galaxy.json';
import { handleEnrichment } from '../../../server/enrichment.mjs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handleEnrichment(request, env.DB, seed, snapshot);
export const POST = GET;
