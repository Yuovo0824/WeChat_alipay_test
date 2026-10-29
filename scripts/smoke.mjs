// End-to-end smoke test against a running server.
//
//   npm run dev     && npm run smoke     # development
//   npm run build && npm start           # production (preferred)
//
// Covers: mock QR login (desktop poll + phone confirm), CSRF rejection,
// WeChat Pay + Alipay Pay order creation, signed notify handling,
// idempotency, amount checks, and authorization.
const BASE = process.env.APP_URL ?? "http://localhost:3000";

// `next dev` rewrites its build manifests on every hot reload; a request that
// lands mid-write can come back as an HTML 500 ("Unexpected end of JSON
// input" in loadManifest). That is a dev-server artifact, not an app error, so
// transient non-JSON responses are retried.
const RETRIES = 5;
const RETRY_DELAY_MS = 700;

function jar() {
  const store = new Map();
  return {
    header: () => [...store.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb(res) {
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1).trim();
        if (value === "") store.delete(name);
        else store.set(name, value);
      }
    },
    get: (n) => store.get(n),
  };
}

async function req(url, opts = {}, cookies) {
  const headers = { ...(opts.headers || {}) };
  if (cookies) headers.cookie = cookies.header();
  const res = await fetch(url.startsWith("http") ? url : BASE + url, {
    ...opts,
    headers,
    redirect: "manual",
  });
  if (cookies) cookies.absorb(res);
  return res;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jsonReq(url, opts = {}, cookies) {
  let last = "";
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    const res = await req(url, opts, cookies);
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    if (ct.includes("json")) return JSON.parse(text);
    last = `${res.status} ${ct} from ${url}`;
  }
  throw new Error(`never got JSON (${last})`);
}

const postJson = (path, body, cookies) =>
  jsonReq(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    cookies
  );

let failures = 0;
function ok(label, cond, extra = "") {
  if (!cond) failures += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
}

/** Warm every route so the first real request is not also the first compile. */
async function warmUp() {
  const probes = [
    ["GET", "/"],
    ["GET", "/api/auth/wechat/start"],
    ["GET", "/api/auth/alipay/start"],
    ["POST", "/api/mock/wechat/qr", "{}"],
    ["GET", "/api/mock/wechat/qr/warmup-probe"],
    ["POST", "/api/mock/wechat/qr/warmup-probe/confirm", "{}"],
    ["GET", "/api/orders"],
    ["GET", "/api/orders/warmup-probe"],
  ];
  for (const [method, path, body] of probes) {
    try {
      await fetch(BASE + path, {
        method,
        headers: { "content-type": "application/json" },
        body,
        redirect: "manual",
      });
    } catch {
      /* warm-up failures are expected and irrelevant */
    }
  }
}

async function main() {
  await warmUp();

  console.log("--- WeChat login (mock QR: desktop poll + phone confirm) ---");
  const desktop = jar();
  const start = await req("/api/auth/wechat/start", {}, desktop);
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  ok("start redirects with state", !!state);
  ok("oauth_state cookie set", !!desktop.get("oauth_state"));

  const { ticketId } = await postJson("/api/mock/wechat/qr", {});
  ok("QR ticket created", !!ticketId);

  let poll = await jsonReq(`/api/mock/wechat/qr/${ticketId}`);
  ok("ticket pending before scan", poll.status === "pending");

  await postJson(`/api/mock/wechat/qr/${ticketId}/confirm`, { code: "bob" });
  poll = await jsonReq(`/api/mock/wechat/qr/${ticketId}`);
  ok("ticket confirmed after scan", poll.status === "confirmed" && poll.code === "bob");

  const rescan = await postJson(`/api/mock/wechat/qr/${ticketId}/confirm`, {
    code: "charlie",
  });
  ok("re-scan does not switch identity", rescan.alreadyConfirmed === true);

  const cb = await req(
    `/api/auth/wechat/callback?code=${poll.code}&state=${state}`,
    {},
    desktop
  );
  ok("callback redirects to /dashboard", cb.headers.get("location") === BASE + "/dashboard");
  ok("session cookie issued", !!desktop.get("session"));
  ok("oauth_state cookie cleared", !desktop.get("oauth_state"));

  const dash = await (await req("/dashboard", {}, desktop)).text();
  ok("dashboard renders the WeChat user", dash.includes("WeChatUser_bob"));

  console.log("\n--- CSRF ---");
  for (const [label, qs] of [
    ["forged state rejected", "code=x&state=WRONG"],
    ["missing state rejected", "code=x"],
  ]) {
    const c = jar();
    await req("/api/auth/wechat/start", {}, c);
    const r = await req(`/api/auth/wechat/callback?${qs}`, {}, c);
    ok(label, r.headers.get("location") === BASE + "/?error=csrf");
  }

  console.log("\n--- WeChat Pay ---");
  const order = await postJson("/api/pay/wechat/create", { amount: 1 }, desktop);
  ok("order created server-side", !!order.orderId);
  ok("code_url returned", String(order.codeUrl).startsWith("weixin://"));

  const sim = await postJson(
    "/api/pay/mock/wechat/simulate",
    { orderId: order.orderId, amount: 1 },
    desktop
  );
  ok("signed notify accepted", sim.success === true && sim.updated === true);

  let detail = await jsonReq(`/api/orders/${order.orderId}`, {}, desktop);
  ok("order marked paid", detail.status === "paid", `txn=${detail.providerOrderId}`);

  const sim2 = await postJson(
    "/api/pay/mock/wechat/simulate",
    { orderId: order.orderId, amount: 1 },
    desktop
  );
  ok("duplicate notify is idempotent", sim2.success === true && sim2.updated === false);
  detail = await jsonReq(`/api/orders/${order.orderId}`, {}, desktop);
  ok("not double-applied", detail.status === "paid");

  const wrong = await postJson(
    "/api/pay/mock/wechat/simulate",
    { orderId: order.orderId, amount: 999 },
    desktop
  );
  ok("amount mismatch rejected", wrong.updated === false || !!wrong.error);

  console.log("\n--- Alipay Pay ---");
  const aOrder = await postJson("/api/pay/alipay/create", { amount: 1 }, desktop);
  ok("alipay order created", !!aOrder.orderId);
  const alipayRedirect = String(aOrder.redirectUrl);

  if (alipayRedirect.includes("/mock/alipay/pay")) {
    ok("mock cashier url returned", true);
    const aSim = await postJson(
      "/api/pay/mock/alipay/simulate",
      { orderId: aOrder.orderId, amount: 1 },
      desktop
    );
    ok("alipay signed notify accepted", aSim.success === true && aSim.updated === true);
    const aDetail = await jsonReq(`/api/orders/${aOrder.orderId}`, {}, desktop);
    ok("alipay order marked paid", aDetail.status === "paid", `trade=${aDetail.providerOrderId}`);
  } else {
    // Sandbox/live: the trade must be paid by a human in Alipay's cashier, so
    // there is nothing to simulate. Assert the signed request shape instead.
    const url = new URL(alipayRedirect);
    ok("sandbox gateway url returned", url.host.includes("alipaydev.com"));
    ok("request is signed", Boolean(url.searchParams.get("sign")));
    ok(
      "notify_url points at this app",
      String(url.searchParams.get("notify_url")).includes("/api/pay/alipay/notify")
    );
    console.log("INFO  real sandbox trade created; complete it manually in the cashier");
  }

  console.log("\n--- Authorization ---");
  const anon = await req("/api/pay/wechat/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount: 1 }),
  });
  ok("unauthenticated order creation rejected", anon.status === 401);
  const other = await req(`/api/orders/${order.orderId}`, {}, jar());
  ok("order detail requires a session", other.status === 401);

  console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Smoke run failed:", e.message);
  process.exit(1);
});
