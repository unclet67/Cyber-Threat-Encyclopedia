import { env } from 'cloudflare:workers';
import snapshot from '../../../data/bundle.json';
import { handleProfiles } from '../../../server/profiles.mjs';

export const dynamic = 'force-dynamic';
const handle = (request: Request) => handleProfiles(request, env.DB, snapshot);
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
