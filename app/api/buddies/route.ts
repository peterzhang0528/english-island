import { createBuddyHandlers } from '../../../lib/buddies-live';

const handlers=createBuddyHandlers();
export async function GET(request: Request) { return handlers.GET(request); }
export async function POST(request:Request) { return handlers.POST(request); }
