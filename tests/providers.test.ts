import { describe, it, expect } from "vitest";
import { mockWeChatUser } from "@/lib/wechat";
import { mockAlipayUser } from "@/lib/alipay";

describe("WeChat mock user", () => {
  it("returns a user with correct provider", () => {
    const user = mockWeChatUser("testuser");
    expect(user.provider).toBe("wechat");
  });

  it("uses the id in providerId", () => {
    const user = mockWeChatUser("alice");
    expect(user.providerId).toBe("mock_wx_alice");
  });

  it("generates a unionId", () => {
    const user = mockWeChatUser("bob");
    expect(user.unionId).toBe("mock_union_bob");
  });

  it("generates a nickname", () => {
    const user = mockWeChatUser("charlie");
    expect(user.nickname).toBe("WeChatUser_charlie");
  });

  it("returns empty avatar string", () => {
    const user = mockWeChatUser("dave");
    expect(user.avatar).toBe("");
  });

  it("different ids produce different users", () => {
    const u1 = mockWeChatUser("alice");
    const u2 = mockWeChatUser("bob");
    expect(u1.providerId).not.toBe(u2.providerId);
    expect(u1.unionId).not.toBe(u2.unionId);
  });
});

describe("Alipay mock user", () => {
  it("returns a user with correct provider", () => {
    const user = mockAlipayUser("testuser");
    expect(user.provider).toBe("alipay");
  });

  it("uses the id in providerId", () => {
    const user = mockAlipayUser("eve");
    expect(user.providerId).toBe("mock_alipay_eve");
  });

  it("generates a nickname", () => {
    const user = mockAlipayUser("frank");
    expect(user.nickname).toBe("AlipayUser_frank");
  });

  it("returns empty avatar string", () => {
    const user = mockAlipayUser("grace");
    expect(user.avatar).toBe("");
  });

  it("has no unionId (alipay-specific)", () => {
    const user = mockAlipayUser("henry");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((user as any).unionId).toBeUndefined();
  });
});
