"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function MockAlipayPayContent() {
  const searchParams = useSearchParams();
  const outTradeNo = searchParams.get("outTradeNo") ?? "";
  const amount = searchParams.get("amount") ?? "0.01";
  const subject = searchParams.get("subject") ?? "Test Item";

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-sm">
      <h1 className="text-lg font-bold text-blue-600 mb-1">支付宝收银台（模拟）</h1>
      <p className="text-gray-500 text-sm mb-6">
        {subject} - {amount} 元
      </p>
      <div className="mx-auto w-40 h-40 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
        <span className="text-blue-500 font-bold text-2xl">¥{amount}</span>
      </div>
      <p className="text-sm text-gray-500 mb-4 text-center">
        模拟：在真实环境中将跳转到支付宝收银台页面。
      </p>
      <a
        href={`/orders/${outTradeNo}`}
        className="block text-center rounded-lg bg-blue-500 text-white px-4 py-3 font-medium hover:bg-blue-600 transition-colors mb-2"
      >
        返回订单
      </a>
      <a
        href="/checkout?amount=1"
        className="block text-center text-sm text-gray-400 hover:text-gray-600"
      >
        返回
      </a>
    </div>
  );
}

export default function MockAlipayPayPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-gray-50">
      <div className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center text-sm font-semibold py-1.5 z-50">
        模拟模式 -- 支付宝收银台
      </div>
      <Suspense fallback={<p className="text-gray-500 text-sm">加载中...</p>}>
        <MockAlipayPayContent />
      </Suspense>
    </main>
  );
}
