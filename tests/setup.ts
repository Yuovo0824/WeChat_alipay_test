// Baseline environment for tests. Runs before each test file is imported so
// modules that read process.env at import time (Prisma client, env schema)
// have something valid to work with.
process.env.APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "test-secret-at-least-32-characters-long";
process.env.DATABASE_URL ??= "file:./dev.db";
process.env.WECHAT_LOGIN_MODE ??= "mock";
process.env.WECHAT_PAY_MODE ??= "mock";
process.env.ALIPAY_LOGIN_MODE ??= "mock";
process.env.ALIPAY_PAY_MODE ??= "mock";
