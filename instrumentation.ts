// instrumentation.ts
// Optional: route the server's outbound requests (Kie.ai, Vercel Blob, Stripe)
// through an HTTP proxy during local development. Only turned on when
// DEV_PROXY_URL is set in .env.local, e.g. DEV_PROXY_URL="http://127.0.0.1:7890".
// Without it, requests go straight to the internet.
export async function register() {
  const proxyUrl = process.env.DEV_PROXY_URL;
  if (process.env.NODE_ENV === "development" && proxyUrl) {
    const { setGlobalDispatcher, ProxyAgent } = await import("undici");
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  }
}
