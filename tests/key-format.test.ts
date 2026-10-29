import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { rsaSign, rsaVerify } from "@/lib/crypto";

/**
 * Provider consoles (notably Alipay's key tool) hand out raw base64 DER
 * bodies with no PEM headers, in either PKCS#1 or PKCS#8. Regression guard:
 * pasting those straight from the console must work.
 */
function stripPem(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
}

function keypair(privateType: "pkcs1" | "pkcs8") {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: privateType, format: "pem" },
  });
  return { publicKey, privateKey };
}

describe("RSA key input formats", () => {
  for (const type of ["pkcs1", "pkcs8"] as const) {
    it(`accepts a raw base64 ${type} private key`, () => {
      const { publicKey, privateKey } = keypair(type);
      const payload = "order=1&amount=1";
      const signature = rsaSign(payload, stripPem(privateKey));
      expect(rsaVerify(payload, signature, publicKey)).toBe(true);
    });
  }

  it("accepts a raw base64 SPKI public key", () => {
    const { publicKey, privateKey } = keypair("pkcs8");
    const payload = "hello";
    const signature = rsaSign(payload, privateKey);
    expect(rsaVerify(payload, signature, stripPem(publicKey))).toBe(true);
  });

  it("accepts a PEM block as-is", () => {
    const { publicKey, privateKey } = keypair("pkcs8");
    const signature = rsaSign("payload", privateKey);
    expect(rsaVerify("payload", signature, publicKey)).toBe(true);
  });

  it("accepts keys containing literal \\n escapes", () => {
    const { publicKey, privateKey } = keypair("pkcs8");
    const escaped = privateKey.replace(/\n/g, "\\n");
    const signature = rsaSign("payload", escaped);
    expect(rsaVerify("payload", signature, publicKey)).toBe(true);
  });

  it("rejects a signature from a different key", () => {
    const a = keypair("pkcs8");
    const b = keypair("pkcs8");
    const signature = rsaSign("payload", stripPem(a.privateKey));
    expect(rsaVerify("payload", signature, b.publicKey)).toBe(false);
  });

  it("throws a clear error for unparseable key material", () => {
    expect(() => rsaSign("payload", "not-a-key")).toThrow(
      /Could not parse the RSA private key/
    );
  });
});
