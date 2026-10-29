import "server-only";
import {
  createSign,
  createVerify,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// --- RSA Helpers ---

/**
 * Provider consoles hand out keys in several shapes:
 *   - a PEM block with `-----BEGIN ... -----`
 *   - a raw base64 DER body (what Alipay's key tool usually gives you)
 *   - the above with literal `\n` escapes, common when pasting into a .env file
 *
 * A raw body can be either PKCS#1 or PKCS#8 for private keys, and SPKI or
 * PKCS#1 for public keys. Rather than guessing, we try the plausible PEM
 * wrappers in order and use the first one Node accepts.
 */
function pemVariants(
  raw: string,
  labels: readonly string[]
): string[] {
  const value = raw.replace(/\\n/g, "\n").trim();
  if (value.includes("-----BEGIN")) return [value];
  const body = (value.replace(/\s+/g, "").match(/.{1,64}/g) ?? [value]).join("\n");
  return labels.map(
    (label) => `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`
  );
}

const PRIVATE_KEY_LABELS = ["PRIVATE KEY", "RSA PRIVATE KEY"] as const;
const PUBLIC_KEY_LABELS = ["PUBLIC KEY", "RSA PUBLIC KEY"] as const;

export function rsaSign(payload: string, privateKey: string): string {
  let lastError: unknown;
  for (const pem of pemVariants(privateKey, PRIVATE_KEY_LABELS)) {
    try {
      const sign = createSign("RSA-SHA256");
      sign.update(payload);
      sign.end();
      return sign.sign(pem, "base64");
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `Could not parse the RSA private key: ${(lastError as Error)?.message}`
  );
}

export function rsaVerify(
  payload: string,
  signature: string,
  publicKey: string
): boolean {
  for (const pem of pemVariants(publicKey, PUBLIC_KEY_LABELS)) {
    try {
      const verify = createVerify("RSA-SHA256");
      verify.update(payload);
      verify.end();
      if (verify.verify(pem, signature, "base64")) return true;
    } catch {
      // try the next wrapper
    }
  }
  return false;
}

// --- AES-256-GCM for WeChat Pay APIv3 resource decryption ---

export function aesGcmDecrypt(
  ciphertext: string,
  associatedData: string,
  nonce: string,
  key: Buffer
): Buffer {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(nonce, "base64")
  );
  decipher.setAAD(Buffer.from(associatedData));
  // WeChat Pay: ciphertext has auth tag appended (last 16 bytes)
  const decoded = Buffer.from(ciphertext, "base64");
  const tag = decoded.subarray(decoded.length - 16);
  const encrypted = decoded.subarray(0, decoded.length - 16);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function aesGcmEncrypt(
  plaintext: string,
  associatedData: string,
  nonce: Buffer,
  key: Buffer
): string {
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([encrypted, tag]).toString("base64");
}

// --- RSA Key Generation for Mock Mode ---

const KEYS_DIR = path.join(process.cwd(), ".mock", "keys");

interface MockKeys {
  wechatMerchantPrivate: string;
  wechatPlatformPublic: string;
  wechatApiV3Key: string; // 32-byte hex string
  alipayPrivate: string;
  alipayPublic: string;
}

let cachedMockKeys: MockKeys | null = null;

function generateRsaKeypair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export function getMockKeys(): MockKeys {
  if (cachedMockKeys) return cachedMockKeys;

  const merchantPem = path.join(KEYS_DIR, "wechat_merchant_private.pem");
  const platformPem = path.join(KEYS_DIR, "wechat_platform_public.pem");
  const apiV3KeyFile = path.join(KEYS_DIR, "wechat_apiv3_key.txt");
  const alipayPrivateFile = path.join(KEYS_DIR, "alipay_merchant_private.pem");
  const alipayPublicFile = path.join(KEYS_DIR, "alipay_public.pem");

  const generateWeChat = () => {
    const kp = generateRsaKeypair();
    const apiV3Key = randomBytes(32).toString("hex");
    fs.mkdirSync(KEYS_DIR, { recursive: true });
    fs.writeFileSync(merchantPem, kp.privateKey);
    fs.writeFileSync(platformPem, kp.publicKey);
    fs.writeFileSync(apiV3KeyFile, apiV3Key);
    return { wechatMerchantPrivate: kp.privateKey, wechatPlatformPublic: kp.publicKey, wechatApiV3Key: apiV3Key };
  };

  const generateAlipay = () => {
    const kp = generateRsaKeypair();
    fs.mkdirSync(KEYS_DIR, { recursive: true });
    fs.writeFileSync(alipayPrivateFile, kp.privateKey);
    fs.writeFileSync(alipayPublicFile, kp.publicKey);
    return {
      alipayPrivate: kp.privateKey,
      alipayPublic: kp.publicKey,
    };
  };

  // Try to read existing keys, generate if missing
  let wechatKeys: ReturnType<typeof generateWeChat> | null = null;
  let alipayKeys: ReturnType<typeof generateAlipay> | null = null;

  try {
    if (
      fs.existsSync(merchantPem) &&
      fs.existsSync(platformPem) &&
      fs.existsSync(apiV3KeyFile)
    ) {
      wechatKeys = {
        wechatMerchantPrivate: fs.readFileSync(merchantPem, "utf8"),
        wechatPlatformPublic: fs.readFileSync(platformPem, "utf8"),
        wechatApiV3Key: fs.readFileSync(apiV3KeyFile, "utf8").trim(),
      };
    } else {
      wechatKeys = generateWeChat();
    }
  } catch {
    wechatKeys = generateWeChat();
  }

  try {
    if (fs.existsSync(alipayPrivateFile) && fs.existsSync(alipayPublicFile)) {
      alipayKeys = {
        alipayPrivate: fs.readFileSync(alipayPrivateFile, "utf8"),
        alipayPublic: fs.readFileSync(alipayPublicFile, "utf8"),
      };
    } else {
      alipayKeys = generateAlipay();
    }
  } catch {
    alipayKeys = generateAlipay();
  }

  cachedMockKeys = { ...wechatKeys!, ...alipayKeys! };
  return cachedMockKeys!;
}
