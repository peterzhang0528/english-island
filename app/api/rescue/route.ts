import { createRescueHandlers } from '../../../lib/rescue-ai';

const handlers = createRescueHandlers();
export async function GET() { return handlers.GET(); }
export async function POST(request: Request) { return handlers.POST(request); }
