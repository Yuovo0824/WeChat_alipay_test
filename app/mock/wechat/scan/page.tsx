"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const USERS = ["alice", "bob", "charlie"];

function ScanContent() {
  const searchParams = useSearchParams();
  const ticket = searchParams.get("t") ?? "";
  const [state, setState] = useState<"choose" | "done" | "error">("choose");
  const [chosen, setChosen] = useState<string | null>(null);

  async function confirm(code: string) {
    try {
      const res = await fetch(`/api/mock/wechat/qr/${ticket}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error("failed");
      setChosen(code);
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-sm text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" className="text-green-600"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </div>
        <h1 className="text-lg font-bold text-green-600 mb-2">已确认登录</h1>
        <p className="text-sm text-gray-500 mb-1">身份：{chosen}</p>
        <p className="text-xs text-gray-400">请回到电脑上查看，页面会自动跳转</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-sm text-center">
        <p className="text-red-500 text-sm">确认失败，二维码可能已过期</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-sm">
      <h1 className="text-lg font-bold text-green-600 mb-1">确认登录</h1>
      <p className="text-gray-500 text-sm mb-6">选择一个身份，模拟在微信里点击「确认登录」</p>
      <div className="flex flex-col gap-2">
        {USERS.map((u) => (
          <button
            key={u}
            onClick={() => confirm(u)}
            className="rounded-lg bg-green-500 text-white px-4 py-2.5 text-sm font-medium hover:bg-green-600 transition-colors"
          >
            确认登录为 {u}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-300 break-all mt-4 text-center">ticket: {ticket}</p>
    </div>
  );
}

export default function MockWeChatScanPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-gray-50">
      <div className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center text-sm font-semibold py-1.5 z-50">
        模拟模式 -- 手机端
      </div>
      <Suspense fallback={<p className="text-gray-500 text-sm">加载中...</p>}>
        <ScanContent />
      </Suspense>
    </main>
  );
}
