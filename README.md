# 微信 / 支付宝集成 —— 试炼任务

基于 **Next.js 15（App Router）** 的演示项目，实现微信、支付宝的 OAuth 登录，以及微信支付、支付宝支付的完整下单与回调链路。

**默认以 mock 模式运行，零外部账号即可跑通全流程**，通过环境变量可逐个集成切到 sandbox / live。

---

## 快速开始（mock 模式）

```bash
npm install
cp .env.example .env.local        # 默认全部 mock
npm run db:setup                  # 创建 SQLite 数据库并应用 migration
npm run dev                       # 打开 http://localhost:3000
```

mock 模式**不需要任何外部账号**，但会真实执行签名、验签、解密等加密逻辑（不是绕过）。

---

## 模式开关

四个集成各自独立开关，可以任意组合：

| 环境变量 | 可选值 | 说明 |
|---------|--------|------|
| `WECHAT_LOGIN_MODE` | `mock` / `live` | 微信开放平台没有沙箱环境 |
| `WECHAT_PAY_MODE` | `mock` / `live` | 微信支付同样没有沙箱 |
| `ALIPAY_LOGIN_MODE` | `mock` / `sandbox` / `live` | |
| `ALIPAY_PAY_MODE` | `mock` / `sandbox` / `live` | |

**任一开关设为非 mock 时，对应凭据变成启动时必填**（由 `lib/env.ts` 的 Zod `superRefine` + `instrumentation.ts` 在服务启动时校验）。缺变量会直接报出清晰错误：

```
Invalid environment configuration:
  - WECHAT_APP_ID: required when WECHAT_LOGIN_MODE is not mock
  - WECHAT_APP_SECRET: required when WECHAT_LOGIN_MODE is not mock
See .env.example for the full list.
```

**设计取舍**：题目原本只给了单一 `PAYMENT_MODE`，但那样「真实微信登录 + mock 支付」这种常见情况无法表达，所以拆成了四个独立开关。

---

## 架构

```
（浏览器）
     |
Next.js 15 App Router
     |
 +---+--------+----------+
 |   |        |          |
登录 支付   订单页    模拟层
OAuth APIv3/ 轮询    二维码轮询
 |   RSA2     |          |
 +-----------+----------+
 |                      |
微信 / 支付宝            SQLite（Prisma）
```

### 核心分层

| 层 | 位置 | 作用 |
|---|------|------|
| 路由（Controller） | `app/api/**/route.ts` | HTTP 入口，目录路径即 URL |
| 业务（Service） | `lib/wechat.ts`、`lib/alipay.ts`、`lib/orders.ts` | 下单、验签、加解密、状态同步 |
| 基础设施 | `lib/crypto.ts`、`lib/session.ts`、`lib/env.ts`、`lib/db.ts` | RSA/AES、会话、环境校验、ORM |
| 数据 | `prisma/schema.prisma` + `prisma/migrations/` | 三张表：User、Order、MockLoginTicket |

---

## 项目结构

```
app/
  page.tsx                      首页（登录按钮）
  dashboard/page.tsx            受保护页：用户信息 + 购买入口
  checkout/page.tsx             选择支付方式 → 二维码 / 跳转
  orders/                       订单列表与详情（详情页每 3 秒轮询）
  mock/wechat/                  模拟扫码页 + 手机端确认页
  mock/alipay/                  模拟支付宝登录
  api/auth/                     OAuth 回调、登出
  api/pay/                      下单、异步通知、模拟支付
  api/orders/                   订单查询（含状态兜底同步）
lib/
  wechat.ts / alipay.ts         两家服务商的登录 + 支付实现
  crypto.ts                     RSA 签名/验签、AES-GCM、mock 密钥生成
  session.ts                    HMAC 签名 httpOnly cookie + OAuth state
  env.ts                        Zod 环境校验（含条件必填）
  db.ts / orders.ts / logger.ts / errors.ts
prisma/
  schema.prisma                 数据模型
  migrations/                   纯 SQL migration
scripts/
  db-setup.mjs                  建库 + 应用 migration（Node 24 可用）
  smoke.mjs                     端到端冒烟测试
tests/                          77 个单元测试
```

---

## 登录流程（mock 扫码）

真实微信扫码登录的模式是「桌面轮询 + 手机确认」，mock 版保持同一结构：

```
桌面浏览器                        服务端                      手机
    |                              |                          |
    |-- /api/auth/wechat/start --->|                          |
    |   写入 state cookie           |                          |
    |<- 307 /mock/wechat?state=..   |                          |
    |                              |                          |
    |-- POST /mock/wechat/qr ----->|                          |
    |<- ticketId                   |                          |
    |                              |                          |
    |   二维码内容：scan?t=ticket    |                          |
    |                              |                          |
    |-- 每 1.5s 轮询 /qr/:id ----->|                          |
    |                              |<---- 扫码打开 /scan?t=.. -|
    |                              |<---- POST 确认 code=alice -|
    |<- status=confirmed, code ----|                          |
    |                              |                          |
    |-- GET /callback?code&state ->|                          |
    |   校验 state → 建用户 → 签发   |                          |
    |   session cookie             |                          |
    |<- 307 /dashboard             |                          |
```

**关键点**：第 6 步走的是**与真实登录完全相同的 callback 路由**，state 校验、用户 upsert、session 签发都复用生产代码。

支付宝登录的 mock 走同一套 callback 逻辑，只是没有扫码环节（真实场景也是跳转）。

---

## 支付流程

```
1. 服务端先创建订单（金额、币种、支付方式、status=pending、15 分钟过期）
2. 再调用服务商接口：
   - 微信：POST /v3/pay/transactions/native → code_url
   - 支付宝：alipay.trade.page.pay → 收银台跳转 URL
3. 前端把 code_url 渲染成二维码（qrcode.react）
4. 用户付款（mock 点「模拟支付成功」；sandbox 在真实收银台付）
5. 服务商异步通知到 /api/pay/*/notify：
   a. 验签（微信 RSA + AES-GCM 解密；支付宝 RSA2）
   b. 核对金额与订单号
   c. 幂等更新（UPDATE ... WHERE status = 'pending'）
6. 订单详情页每 3 秒轮询，同时主动查询服务商
   （alipay.trade.query / 微信订单查询）作为兜底
```

### 安全要点

- 金额和状态**只信服务端**，完全不接受浏览器传来的值
- 微信通知：先用平台公钥验签，再用 APIv3 密钥 AES-256-GCM 解密
- 支付宝通知：用支付宝公钥做 RSA2 验签，签名串排除 `sign` 与 `sign_type`
- 幂等：`updateMany({ where: { id, status: 'pending' } })`，重复通知不会重复更新
- 响应格式严格按各家要求：微信返回 `{"code":"SUCCESS"}`，支付宝返回纯文本 `success`
- 日志自动脱敏（secret/token/signature/private key 等），但保留错误码便于排查

---

## 支付宝沙箱配置

1. 在 [open.alipay.com](https://open.alipay.com) 注册（个人账号即可）
2. 控制台 → 沙箱 → 沙箱应用
3. 记下 **AppID**（16 位，通常 `2016...` 或 `9021...`）
4. 生成 RSA2 密钥对：

   ```bash
   openssl genpkey -algorithm RSA -out private_key.pem -pkeyopt rsa_keygen_bits:2048
   openssl rsa -pubout -in private_key.pem -out public_key.pem
   ```

5. 把**应用公钥**上传到沙箱应用的接口加签设置里
6. 上传后控制台会显示**支付宝公钥**，复制出来
7. 写进 `.env.local`：

   ```env
   ALIPAY_LOGIN_MODE=sandbox
   ALIPAY_PAY_MODE=sandbox
   ALIPAY_APP_ID=9021xxxxxxxxxxxx
   ALIPAY_PRIVATE_KEY=<应用私钥内容>
   ALIPAY_PUBLIC_KEY=<支付宝公钥内容>
   ALIPAY_GATEWAY=https://openapi-sandbox.dl.alipaydev.com/gateway.do
   ```

**最容易踩坑的地方**：

| 名称 | 谁给谁 | 用途 |
|------|--------|------|
| 应用公钥 | 你 → 上传给支付宝 | 支付宝用它验你的签名 |
| **支付宝公钥** | 支付宝 → 给你 | **你用**它验支付宝的签名 |

填反了会一直提示签名错误。`ALIPAY_PUBLIC_KEY` 要填的是**支付宝公钥**。

密钥支持三种格式：PEM（带 `-----BEGIN-----`）、纯 base64 DER（PKCS#1 / PKCS#8）、带字面 `\n` 转义的内容，代码会自动识别。

---

## 内网穿透（回调必需）

支付异步通知是**服务商服务器发起的 POST**，`localhost` 外部访问不到。

**方案 A：ngrok（推荐）**

```bash
ngrok http 3000
# 得到 https://xxxx.ngrok-free.dev
```

**方案 B：localhost.run（免费、免注册）**

```bash
ssh -R 80:localhost:3000 nokey@localhost.run
```

拿到地址后更新 `.env.local`：

```env
APP_URL=https://xxxx.ngrok-free.dev
ALIPAY_NOTIFY_URL=https://xxxx.ngrok-free.dev/api/pay/alipay/notify
ALIPAY_RETURN_URL=https://xxxx.ngrok-free.dev/orders
WECHAT_PAY_NOTIFY_URL=https://xxxx.ngrok-free.dev/api/pay/wechat/notify
```

改完需要重启 dev server 才生效。

> 隧道断了也不影响订单正确性 —— 订单页会主动查询服务商补状态。

---

## 已知限制

| 限制 | 说明 |
|------|------|
| **微信登录与支付未接真实账号** | 需要企业认证的微信开放平台账号（网站应用 AppID + AppSecret），以及备案域名 + HTTPS。题目原文亦说明「candidate cannot get real credentials alone」，因此以 mock 实现同等流程 |
| **支付宝沙箱 OAuth 无法使用** | `openauth.alipaydev.com` 的证书于 2026-06-05 过期，忽略证书后上游返回 502，属于支付宝侧问题。**支付链路（走另一个域名）正常** |
| **真实通知依赖稳定隧道** | 免费隧道会掉线。已实现订单状态查询兜底（`alipay.trade.query` / 微信订单查询），即使通知丢失也能纠正订单状态 |
| **Prisma migration engine 不支持 Node 24** | 因此提供 `npm run db:setup`，用 `node:sqlite` 按顺序应用纯 SQL migration。`prisma generate` 前需先停掉 dev server |
| **未实现加分项** | 账号绑定、Docker、微信 JSAPI 支付、支付宝移动端支付 |

---

## 后续可改进

- 增加**本地 mock OAuth token 端点**，让 `exchangeWeChatCode` / `exchangeAlipayCode` 在 mock 模式下也真实走一遍网络调用（目前 mock 是直接返回假用户）
- 补 `docker-compose.yml`，让评审一条命令起环境
- 实现跨服务商账号绑定（微信 + 支付宝 → 同一用户）
- 增加定时任务扫描过期订单（目前是查询时惰性关闭）
- 支付宝登录支持移动端 `alipay.user.info.share` 的更多字段

---

## 测试

```bash
npm test          # 77 个单元测试，9 个文件
npm run smoke     # 26 项端到端 HTTP 检查（需先启动服务）
```

单元测试覆盖：

- `session.test.ts` —— HMAC 签名、篡改检测、过期、state 校验
- `crypto` 相关 —— RSA 签名/验签、AES-256-GCM 加解密、密钥格式兼容
- `notify.test.ts` —— 微信通知验签解密、支付宝 RSA2 验签、金额篡改拒绝
- `provider-requests.test.ts` —— **断言支付宝请求真的带 `sign` 且可验通**（回归防护）
- `env.test.ts` —— 13 个用例覆盖各种模式组合的条件必填
- `logger.test.ts` —— 脱敏边界（保留错误码，隐藏密钥）

---

## 命令一览

| 命令 | 作用 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务器 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `eslint .` |
| `npm test` | `vitest run` |
| `npm run smoke` | 端到端冒烟测试 |
| `npm run db:setup` | 建库 + 应用 migration（任何 Node 版本可用） |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate` | `prisma migrate dev`（需 Node < 24） |

---

## 许可

试炼任务代码，不用于生产环境。
