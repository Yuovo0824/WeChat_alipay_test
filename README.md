# WeChat & Alipay Integration — Trial Task

Next.js 15 (App Router) web application with WeChat / Alipay OAuth login
and WeChat Pay / Alipay payment, designed to run in mock mode out of the
box and switch to real credentials through environment variables.

## Quick start (mock mode)

```bash
npm install
cp .env.example .env.local        # all defaults set to mock
npm run db:setup                   # create SQLite DB + apply migrations
npm run dev                        # http://localhost:3000
```

Mock mode requires **no external accounts** and exercises the full flow
end-to-end, including real cryptographic signature verification.

## Mode switches

Each integration is switched independently so they can be mixed freely.

| Variable | Valid values | Remarks |
|----------|-------------|--------|
| `WECHAT_LOGIN_MODE` | `mock` \| `live` | WeChat has no sandbox environment |
| `WECHAT_PAY_MODE` | `mock` \| `live` |
| `ALIPAY_LOGIN_MODE` | `mock` \| `sandbox` \| `live` |
| `ALIPAY_PAY_MODE` | `mock` \| `sandbox` \| `live` |

When any mode is set to a non-mock value the matching credentials
become **required at startup** (validated via Zod in `lib/env.ts` and
`instrumentation.ts`). A missing credential produces a clear error:

```
Invalid environment configuration:
  - WECHAT_APP_ID: required when WECHAT_LOGIN_MODE is not mock
  - WECHAT_APP_SECRET: required when WECHAT_LOGIN_MODE is not mock
See .env.example for the full list.
```

## Architecture

```
(Desktop browser)
       |
  Next.js 15 (App Router)
       |
  +----+----+----+----+
  |    |    |    |    |
 Login  Pay  Orders  Mock
 (OAuth) (APIv3/RSA2) (SSR) (QR poll)
       |         |
  WeChat      Alipay
  Open Plat.  Open Plat.
       |         |
  SQLite (Prisma)
```

### Project structure

```
app/
  page.tsx                      Landing (login buttons)
  dashboard/page.tsx            Protected: user info + "buy test item"
  checkout/page.tsx             Choose provider -> QR / redirect
  orders/page.tsx, [id]/page.tsx  Order list & detail (polls)
  mock/wechat/...               Mock QR login & phone confirmation
  mock/alipay/...               Mock Alipay login
  api/auth/                     OAuth callbacks, logout
  api/pay/                      Order creation, notify handlers, mock simulate
  api/orders/                   Order list & detail (+ status sync fallback)
lib/
  wechat.ts / alipay.ts         Provider logic (login + pay)
  crypto.ts                     RSA sign/verify, AES-GCM, mock key generation
  session.ts                    HMAC-signed httpOnly cookie + OAuth state
  env.ts                        Zod validation with superRefine
  db.ts / orders.ts / logger.ts / errors.ts
prisma/
  schema.prisma                 User + Order + MockLoginTicket
  migrations/                   SQL migrations
```

## Login flow (mock QR)

```
Desktop                        Server                     Phone
  |                              |                          |
  |-- /api/auth/wechat/start --> |                          |
  |   state cookie set           |                          |
  |<-- 307 /mock/wechat?state=   |                          |
  |                              |                          |
  |-- POST /mock/wechat/qr ----> |                          |
  |<-- ticketId                  |                          |
  |                              |                          |
  |-- poll /qr/:id (every 1.5s)  |                          |
  |                              |                          |
  |    (QR encodes scan?t=id)    |                          |
  |                              |      <-- phone scans ----|
  |                              |      opens /scan?t=id    |
  |                              |      taps "confirm alice"|
  |                              |      POST /qr/:id/confirm|
  |                              |<----- ticket=confirmed   |
  |                              |                          |
  |-- poll -> confirmed,code=    |                          |
  |                              |                          |
  |--GET /callback?code=&state=> |                          |
  |   state OK, user created,    |                          |
  |   session cookie set         |                          |
  |<-- 307 /dashboard            |                          |
```

The same state-validation / session-issuance code path runs for both
mock and live providers.

## Payment flow

```
1. Server creates Order (amount, provider, status=pending, expiresAt)
2. Server calls provider:
   - WeChat: POST /v3/pay/transactions/native -> code_url
   - Alipay: page pay gateway -> cashier redirect URL
3. UI renders the code_url as a QR code (qrcode.react)
4. User pays (mock: "Simulate payment success" button; sandbox: real cashier)
5. Provider sends async notification to /api/pay/*/notify:
   a. Signature verified (WeChat: RSA + AES-GCM; Alipay: RSA2)
   b. Amount checked against stored order
   c. Idempotent update (UPDATE ... WHERE status = 'pending')
6. Order detail page polls every 3 seconds and also queries the provider
   directly (alipay.trade.query / WeChat query) as fallback.
```

## Alipay sandbox setup

1. Register at [open.alipay.com](https://open.alipay.com) (personal account ok)
2. Enter Sandbox: Console -> Sandbox -> Sandbox App
3. Note the **AppID** (16 digits, starts with 2016 or 9021)
4. Generate RSA2 keys:

   ```bash
   openssl genpkey -algorithm RSA -out private_key.pem -pkeyopt rsa_keygen_bits:2048
   openssl rsa -pubout -in private_key.pem -out public_key.pem
   ```

5. Upload the **public key** in the Sandbox App settings
6. Copy the **Alipay public key** shown after upload
7. Write to `.env.local`:

   ```env
   ALIPAY_LOGIN_MODE=sandbox
   ALIPAY_PAY_MODE=sandbox
   ALIPAY_APP_ID=2016xxxxxxxxxxxx
   ALIPAY_PRIVATE_KEY=<contents of private_key.pem>
   ALIPAY_PUBLIC_KEY=<Alipay public key from the console>
   ALIPAY_GATEWAY=https://openapi-sandbox.dl.alipaydev.com/gateway.do
   ```

8. Run the app via a tunnel so Alipay can reach the callback (see below)

## Exposing localhost callbacks

Payment notifications are server-to-server POSTs — `localhost` is not
reachable from the outside.

**Option A — ngrok (recommended):**

```bash
ngrok http 3000
# https://xxxx.ngrok-free.dev -> http://localhost:3000
```

Update `.env.local`:

```env
APP_URL=https://xxxx.ngrok-free.dev
ALIPAY_NOTIFY_URL=https://xxxx.ngrok-free.dev/api/pay/alipay/notify
ALIPAY_RETURN_URL=https://xxxx.ngrok-free.dev/orders
WECHAT_PAY_NOTIFY_URL=https://xxxx.ngrok-free.dev/api/pay/wechat/notify
```

**Option B — localhost.run (free, no account):**

```bash
ssh -R 80:localhost:3000 nokey@localhost.run
```

## Known limitations

- **WeChat login & pay require a company-verified Open Platform account**
  and an ICP-filed domain with HTTPS. The real code paths are implemented
  but cannot be tested without those credentials (as the trial task
  acknowledges).
- **Alipay sandbox OAuth (`openauth.alipaydev.com`)**: the TLS certificate
  expired June 2025 and the upstream returns 502 — an Alipay-side issue.
  Payment (which uses a different host) works correctly.
- **Payment notifications from real providers** require a stable public
  URL. The order-status query fallback (`alipay.trade.query` /
  WeChat order query) guarantees correctness even when the notification
  is missed, but the *demo* of the notification path still depends on a
  tunnel being up.
- **Prisma migration engine** does not run on Node 24 (known
  incompatibility). Migrations are applied manually via `node:sqlite`,
  and `prisma generate` requires stopping the dev server first.

## What I would do next

- Split `PAYMENT_MODE` into finer-grain per-provider payment switches
  (already done for login vs pay; further split between WeChat/Alipay
  would be trivial).
- Add an in-process mock OAuth token endpoint so the OAuth code path
  (`exchangeWeChatCode` / `exchangeAlipayCode`) is genuinely exercised
  even in mock mode.
- Docker Compose setup so reviewers can run `docker compose up`.
- Account linking across providers (WeChat + Alipay → one user).

## Tests

```bash
npm test            # 77 unit tests, 9 files
npm run smoke       # 26 end-to-end HTTP checks (requires running server)
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `eslint .` |
| `npm run test` | `vitest run` |
| `npm run smoke` | End-to-end smoke test |
| `npm run db:migrate` | `prisma migrate dev` (requires Node < 24) |
| `npm run db:generate` | `prisma generate` |
| `npm run db:setup` | Create the SQLite DB and apply migrations (works on any Node) |

## License

Trial task — not licensed for production use.
