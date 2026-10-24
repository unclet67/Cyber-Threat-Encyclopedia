import { env } from 'cloudflare:workers';
import snapshot from '../../../data/bundle.json';
import { handleAssessments } from '../../../server/assessments.mjs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handleAssessments(request, env.DB, snapshot);
export const POST = GET;
