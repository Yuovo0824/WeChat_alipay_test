/**
 * Runs once when the server boots. Validating the environment here means a
 * misconfiguration fails loudly at startup instead of surfacing as a 500 on
 * the first request that happens to touch a missing credential.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("./lib/env");
    getEnv();
  }
}
