import { AsyncLocalStorage } from 'node:async_hooks';

export type WishEnvironment = { OPENAI_API_KEY?: string; OPENAI_MODEL?: string };
const environments = new AsyncLocalStorage<{ environment: WishEnvironment; clientAddress?: string }>();

export function runWithWishEnvironment<T>(environment: WishEnvironment, run: () => T, clientAddress?: string): T {
  const address = typeof clientAddress === 'string' ? clientAddress.trim() : '';
  return environments.run({ environment, clientAddress: address && address.length <= 128 ? address : undefined }, run);
}

/** Server-only settings. Request bindings take precedence over local development env. */
export function getWishEnvironment(): WishEnvironment {
  const env = environments.getStore()?.environment;
  return {
    OPENAI_API_KEY: env?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    OPENAI_MODEL: env?.OPENAI_MODEL ?? process.env.OPENAI_MODEL,
  };
}

/** Captured from the original trusted edge request, never from route headers. */
export function getWishClientAddress(): string | undefined {
  return environments.getStore()?.clientAddress;
}
