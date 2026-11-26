import { createBuddyCoopHandlers } from '../../../lib/buddy-coop-ai';

const handlers = createBuddyCoopHandlers();
export async function GET() { return handlers.GET(); }
export async function POST(request: Request) { return handlers.POST(request); }
