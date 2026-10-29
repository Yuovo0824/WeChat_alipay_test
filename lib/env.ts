import "server-only";
import { z } from "zod";

// Each integration has its own switch so they can be mixed freely, e.g.
// real WeChat login + mock WeChat Pay + mock Alipay.
//   WeChat has no sandbox environment  -> mock | live
//   Alipay has a sandbox environment   -> mock | sandbox | live
const wechatMode = z.enum(["mock", "live"]);
const alipayMode = z.enum(["mock", "sandbox", "live"]);

const envSchema = z
  .object({
    APP_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
    DATABASE_URL: z.string().min(1),

    WECHAT_LOGIN_MODE: wechatMode.default("mock"),
    WECHAT_PAY_MODE: wechatMode.default("mock"),
    ALIPAY_LOGIN_MODE: alipayMode.default("mock"),
    ALIPAY_PAY_MODE: alipayMode.default("mock"),

    WECHAT_APP_ID: z.string().optional(),
    WECHAT_APP_SECRET: z.string().optional(),

    WECHAT_PAY_MCH_ID: z.string().optional(),
    WECHAT_PAY_APP_ID: z.string().optional(),
    WECHAT_PAY_API_V3_KEY: z.string().optional(),
    WECHAT_PAY_CERT_SERIAL_NO: z.string().optional(),
    WECHAT_PAY_PRIVATE_KEY_PATH: z.string().optional(),
    WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH: z.string().optional(),
    WECHAT_PAY_NOTIFY_URL: z.string().optional(),

    ALIPAY_APP_ID: z.string().optional(),
    ALIPAY_PRIVATE_KEY: z.string().optional(),
    ALIPAY_PUBLIC_KEY: z.string().optional(),
    ALIPAY_GATEWAY: z.string().optional(),
    ALIPAY_NOTIFY_URL: z.string().optional(),
    ALIPAY_RETURN_URL: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    const need = (key: keyof typeof v, because: string) => {
      if (!v[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `required when ${because}`,
        });
      }
    };

    if (v.WECHAT_LOGIN_MODE !== "mock") {
      need("WECHAT_APP_ID", "WECHAT_LOGIN_MODE is not mock");
      need("WECHAT_APP_SECRET", "WECHAT_LOGIN_MODE is not mock");
    }

    if (v.WECHAT_PAY_MODE !== "mock") {
      const because = "WECHAT_PAY_MODE is not mock";
      need("WECHAT_PAY_MCH_ID", because);
      need("WECHAT_PAY_APP_ID", because);
      need("WECHAT_PAY_API_V3_KEY", because);
      need("WECHAT_PAY_CERT_SERIAL_NO", because);
      need("WECHAT_PAY_PRIVATE_KEY_PATH", because);
      need("WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH", because);
      need("WECHAT_PAY_NOTIFY_URL", because);
    }

    if (v.ALIPAY_LOGIN_MODE !== "mock" || v.ALIPAY_PAY_MODE !== "mock") {
      const because =
        v.ALIPAY_LOGIN_MODE !== "mock"
          ? "ALIPAY_LOGIN_MODE is not mock"
          : "ALIPAY_PAY_MODE is not mock";
      need("ALIPAY_APP_ID", because);
      need("ALIPAY_PRIVATE_KEY", because);
      need("ALIPAY_PUBLIC_KEY", because);
      need("ALIPAY_GATEWAY", because);
    }

    if (v.ALIPAY_PAY_MODE !== "mock") {
      need("ALIPAY_NOTIFY_URL", "ALIPAY_PAY_MODE is not mock");
      need("ALIPAY_RETURN_URL", "ALIPAY_PAY_MODE is not mock");
    }
  });

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join(".")}: ${i.message}`
    );
    throw new Error(
      `Invalid environment configuration:\n${lines.join("\n")}\n` +
        `See .env.example for the full list.`
    );
  }
  return parsed.data;
}

/**
 * True when at least one integration still runs in mock mode.
 * Reads process.env directly so the UI banner never throws.
 */
export function isMockMode(): boolean {
  const p = process.env;
  return (
    (p.WECHAT_LOGIN_MODE ?? "mock") === "mock" ||
    (p.WECHAT_PAY_MODE ?? "mock") === "mock" ||
    (p.ALIPAY_LOGIN_MODE ?? "mock") === "mock" ||
    (p.ALIPAY_PAY_MODE ?? "mock") === "mock"
  );
}
