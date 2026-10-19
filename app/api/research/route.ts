import { env } from 'cloudflare:workers';
import snapshot from '../../../data/bundle.json';
import { handleResearch } from '../../../server/research.mjs';

export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handleResearch(request, env, snapshot);
export const POST = GET;
