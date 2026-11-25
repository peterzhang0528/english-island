import { BodyLimitError, json, problem, readBounded } from './wish-ai';
import { getWishClientAddress, getWishEnvironment, type WishEnvironment } from './wish-runtime';
import dialogue from './rescue-dialogue.json';

const { goals: GOALS, schema: SCHEMA, instructions: INSTRUCTIONS } = dialogue;

type Options = { getEnvironment?: () => WishEnvironment; fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number };
export function createRescueHandlers(options: Options = {}) {
  const environment = options.getEnvironment ?? getWishEnvironment;
  const send = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, { time: number; count: number }>();
  let total = { time: 0, count: 0 };
  const config = () => {
    const env = environment(), key = env.OPENAI_API_KEY?.trim() ?? '', model = env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
    return { key, model, available: !!key && !/[\r\n]/u.test(key) && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/u.test(model) };
  };
  return {
    async GET() { return json(200, { available: config().available }); },
    async POST(request: Request) {
      if (request.headers.get('origin') !== new URL(request.url).origin) return problem(403,'ORIGIN_NOT_ALLOWED','Use the island radio.');
      if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type') || '')) return problem(415,'INVALID_CONTENT_TYPE','Send a text message.');
      if (Number(request.headers.get('content-length')) > 2048) return problem(413,'REQUEST_TOO_LARGE','Keep your radio call short.');
      const controller = new AbortController();
      const cancel = () => controller.abort();
      request.signal.addEventListener('abort',cancel,{once:true});
      const timer = setTimeout(cancel,options.timeoutMs ?? 15000);
      try {
        if (request.signal.aborted) controller.abort();
        let input;
        try { input = JSON.parse(await readBounded(request.body,2048,controller.signal)); }
        catch(error) { return problem(error instanceof BodyLimitError ? 413 : controller.signal.aborted ? 408 : 400,'INVALID_REQUEST','Try a short radio call again.'); }
        if (!input || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'message,stage' || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 180 || /[<>\u0000-\u001f\u007f]/u.test(input.message) || !Number.isInteger(input.stage) || input.stage < 0 || input.stage > 3) return problem(400,'INVALID_REQUEST','Try a short radio call again.');
        const settings = config();
        if (!settings.available) return problem(503,'AI_UNAVAILABLE','AI radio is offline. Mission simulator is available.');
        const time = now();
        for (const [id,b] of buckets) if (time-b.time >= 60000) buckets.delete(id);
        if (time-total.time >= 60000) total = { time,count:0 };
        const id = getWishClientAddress() || 'shared-local';
        let bucket = buckets.get(id);
        if (!bucket) { if (buckets.size >= 256) return problem(429,'RATE_LIMITED','Radio busy. Try in a minute.'); bucket = {time,count:0}; buckets.set(id,bucket); }
        if (bucket.count >= 8 || total.count >= 40) return problem(429,'RATE_LIMITED','Radio busy. Try in a minute.',{'Retry-After':'60'});
        bucket.count++; total.count++;
        const response = await send('https://api.openai.com/v1/responses',{
          method:'POST',redirect:'manual',signal:controller.signal,
          headers:{'Content-Type':'application/json',Authorization:`Bearer ${settings.key}`},
          body:JSON.stringify({model:settings.model,store:false,max_output_tokens:350,instructions:INSTRUCTIONS,input:[{role:'user',content:[{type:'input_text',text:JSON.stringify({objective:GOALS[input.stage],message:input.message})}]}],text:{format:{type:'json_schema',name:'rescue_radio',strict:true,schema:SCHEMA}}}),
        });
        if (!response.ok) { void response.body?.cancel().catch(()=>{}); return problem(502,'AI_UNAVAILABLE','AI radio unavailable. Squad commands still work.'); }
        const data = JSON.parse(await readBounded(response.body,16384,controller.signal));
        if (data.status !== 'completed' || !Array.isArray(data.output)) throw Error('invalid response');
        const parts = data.output.filter((item: { type?: string }) => item.type === 'message').flatMap((item: {content?: {type?: string; text?: string}[]}) => item.content ?? []);
        if (parts.some((part: {type?: string}) => part.type === 'refusal')) throw Error('refusal');
        const texts = parts.filter((part: {type?: string}) => part.type === 'output_text');
        if (texts.length !== 1) throw Error('invalid output');
        const parsed = JSON.parse(texts[0].text);
        if (Object.keys(parsed).join(',') !== 'lines' || !Array.isArray(parsed.lines) || parsed.lines.length !== 2) throw Error('invalid lines');
        if (parsed.lines.some((line: {who?: unknown; text?: unknown}, i: number) => !line || Object.keys(line).sort().join(',') !== 'text,who' || line.who !== ['mia','leo'][i] || typeof line.text !== 'string' || !line.text.trim() || line.text.length > 240 || /[<>\u0000-\u001f\u007f]/u.test(line.text))) throw Error('invalid dialogue');
        return json(200,{source:'ai',lines:parsed.lines});
      } catch { return problem(controller.signal.aborted?504:502,'AI_UNAVAILABLE','AI radio unavailable. Squad commands still work.'); }
      finally { clearTimeout(timer);request.signal.removeEventListener('abort',cancel); }
    },
  };
}
