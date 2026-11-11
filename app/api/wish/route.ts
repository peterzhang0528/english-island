import { createWishHandlers } from '../../../lib/wish-ai';

const handlers=createWishHandlers();
export async function GET() { return handlers.GET(); }
export async function POST(request:Request) { return handlers.POST(request); }
