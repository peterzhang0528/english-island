import { createBuddyHandlers } from '../../../lib/buddies-live';

const handlers=createBuddyHandlers();
export async function GET() { return handlers.GET(); }
export async function POST(request:Request) { return handlers.POST(request); }
