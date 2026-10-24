import { env } from 'cloudflare:workers';
import snapshot from '../../../data/bundle.json';
import config from '../../../config/monitoring.json';
import { handleWatchlist } from '../../../server/watchlist.mjs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handleWatchlist(request, env.DB, snapshot, config.actorIds);
export const POST = GET;
