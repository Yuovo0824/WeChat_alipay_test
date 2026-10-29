"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const amount = searchParams.get("amount") ?? "1";
  const [step, setStep] = useState<"choose" | "wechat" | "alipay">("choose");
  const [codeUrl, setCodeUrl] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [alipayUrl, setAlipayUrl] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);

  async function payWithWeChat() {
    const res = await fetch("/api/pay/wechat/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount) }),
    });
    if (res.ok) {
      const data = await res.json();
      setCodeUrl(data.codeUrl);
      setOrderId(data.orderId);
      setStep("wechat");
    }
  }

  async function payWithAlipay() {
    const res = await fetch("/api/pay/alipay/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount) }),
    });
    if (res.ok) {
      const data = await res.json();
      setAlipayUrl(data.redirectUrl);
      setOrderId(data.orderId);
      setStep("alipay");
    }
  }

  async function simulateWeChat() {
    setSimulating(true);
    const res = await fetch("/api/pay/mock/wechat/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, amount: Number(amount) }),
    });
    const data = await res.json();
    setSimResult(data.success ? "支付模拟成功！" : "模拟失败");
    setSimulating(false);
  }

  async function simulateAlipay() {
    setSimulating(true);
    const res = await fetch("/api/pay/mock/alipay/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, amount: Number(amount) }),
    });
    const data = await res.json();
    setSimResult(data.success ? "支付模拟成功！" : "模拟失败");
    setSimulating(false);
  }

  if (step === "choose") {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-lg font-bold mb-1">选择支付方式</h1>
        <p className="text-gray-500 text-sm mb-6">
          金额：{(Number(amount) / 100).toFixed(2)} CNY
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={payWithWeChat}
            className="rounded-lg bg-green-500 text-white px-4 py-3 font-medium hover:bg-green-600 transition-colors"
          >
            微信支付
          </button>
          <button
            onClick={payWithAlipay}
            className="rounded-lg bg-blue-500 text-white px-4 py-3 font-medium hover:bg-blue-600 transition-colors"
          >
            支付宝
          </button>
        </div>
      </div>
    );
  }

  if (step === "wechat" && codeUrl) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-lg font-bold mb-1">微信扫码支付</h1>
        <p className="text-gray-500 text-sm mb-4">
          金额：{(Number(amount) / 100).toFixed(2)} CNY
        </p>
        <div className="mx-auto w-48 h-48 bg-white border border-gray-200 rounded-lg flex items-center justify-center mb-3 p-2">
          <QRCodeSVG value={codeUrl} size={168} level="M" />
        </div>
        <p className="text-xs text-gray-400 mb-4 text-center break-all">{codeUrl}</p>
        <button
          onClick={simulateWeChat}
          disabled={simulating}
          className="w-full rounded-lg bg-amber-500 text-white px-4 py-2.5 font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {simulating ? "模拟中..." : "模拟支付成功"}
        </button>
        {simResult && (
          <p className="text-sm text-center mt-3 text-green-600">{simResult}</p>
        )}
        <button
          onClick={() => router.push(`/orders/${orderId}`)}
          className="w-full rounded-lg border border-gray-300 text-gray-700 px-4 py-2.5 text-sm mt-3 hover:bg-gray-50 transition-colors"
        >
          查看订单状态
        </button>
      </div>
    );
  }

  if (step === "alipay" && alipayUrl) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-lg font-bold mb-1">支付宝支付</h1>
        <p className="text-gray-500 text-sm mb-4">
          金额：{(Number(amount) / 100).toFixed(2)} CNY
        </p>
        <p className="text-sm text-gray-500 mb-4">
          模拟模式下，点击下方按钮跳转到支付宝模拟页面。
        </p>
        <a
          href={alipayUrl}
          className="block text-center rounded-lg bg-blue-500 text-white px-4 py-3 font-medium hover:bg-blue-600 transition-colors mb-3"
        >
          前往支付宝支付
        </a>
        <button
          onClick={simulateAlipay}
          disabled={simulating}
          className="w-full rounded-lg bg-amber-500 text-white px-4 py-2.5 font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {simulating ? "模拟中..." : "模拟支付成功"}
        </button>
        {simResult && (
          <p className="text-sm text-center mt-3 text-green-600">{simResult}</p>
        )}
        <button
          onClick={() => router.push(`/orders/${orderId}`)}
          className="w-full rounded-lg border border-gray-300 text-gray-700 px-4 py-2.5 text-sm mt-3 hover:bg-gray-50 transition-colors"
        >
          查看订单状态
        </button>
      </div>
    );
  }

  return null;
}

export default function CheckoutPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-gray-50">
      <div className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center text-sm font-semibold py-1.5 z-50">
        模拟模式
      </div>
      <Suspense fallback={<p className="text-gray-500 text-sm">加载中...</p>}>
        <CheckoutContent />
      </Suspense>
    </main>
  );
}
