import "server-only";

/**
 * Keys whose values must never reach the logs: credentials, tokens and
 * signatures. Note that provider *error codes* (`code`, `sub_code`,
 * `errcode`) are deliberately NOT redacted - they are diagnostics, not
 * secrets, and hiding them makes failures impossible to debug.
 */
const SECRET_KEY_PATTERN =
  /(secret|token|password|passwd|signature|private[_-]?key|api[_-]?v3|api[_-]?key|apiv3|authorization|auth[_-]?code|credential|cookie|session)/i;

export function log(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>
) {
  const entry = { level, message, ...meta, ts: new Date().toISOString() };
  const safe = JSON.parse(
    JSON.stringify(entry, (key, value) =>
      typeof key === "string" && SECRET_KEY_PATTERN.test(key)
        ? "[redacted]"
        : value
    )
  );
  console[level](JSON.stringify(safe));
}
