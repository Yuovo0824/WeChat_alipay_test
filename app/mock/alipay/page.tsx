"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function MockAlipayContent() {
  const searchParams = useSearchParams();
  const state = searchParams.get("state") ?? "";
  const userIds = ["dave", "eve", "frank"];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-sm">
      <h1 className="text-lg font-bold text-blue-600 mb-1">支付宝登录</h1>
      <p className="text-gray-500 text-sm mb-6">
        模拟：选择一个测试用户登录
      </p>
      <div className="mx-auto w-40 h-40 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
        <svg width="64" height="64" viewBox="0 0 24 24" className="text-blue-400">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
        </svg>
      </div>
      <p className="text-sm text-gray-500 mb-4">假装你已经在支付宝 App 中授权了。</p>
      <div className="flex flex-col gap-2">
        {userIds.map((id) => (
          <a
            key={id}
            href={`/api/auth/alipay/callback?auth_code=${id}&state=${encodeURIComponent(state)}`}
            className="block text-center rounded-lg bg-blue-500 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            以 {id} 登录
          </a>
        ))}
      </div>
      <Link href="/" className="block text-center text-sm text-gray-400 mt-4 hover:text-gray-600">
        返回
      </Link>
    </div>
  );
}

export default function MockAlipayPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-gray-50">
      <div className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center text-sm font-semibold py-1.5 z-50">
        模拟模式 -- 支付宝登录模拟器
      </div>
      <Suspense fallback={<p className="text-gray-500 text-sm">加载中...</p>}>
        <MockAlipayContent />
      </Suspense>
    </main>
  );
}
