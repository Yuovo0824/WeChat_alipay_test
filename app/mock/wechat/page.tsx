"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

function MockWeChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const state = searchParams.get("state") ?? "";
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string>("");
  const [status, setStatus] = useState<"loading" | "pending" | "confirmed" | "error">("loading");
  const consumed = useRef(false);

  // 1. Create a ticket, then render a real QR pointing at the phone-confirm page
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/mock/wechat/qr", { method: "POST" });
        if (!res.ok) throw new Error("ticket failed");
        const data = await res.json();
        if (cancelled) return;
        setTicketId(data.ticketId);
        setScanUrl(`${window.location.origin}/mock/wechat/scan?t=${data.ticketId}`);
        setStatus("pending");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 2. Poll the ticket, mirroring real WeChat desktop QR login
  useEffect(() => {
    if (!ticketId || status !== "pending") return;
    const iv = setInterval(async () => {
      const res = await fetch(`/api/mock/wechat/qr/${ticketId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "confirmed" && data.code && !consumed.current) {
        consumed.current = true;
        setStatus("confirmed");
        // Finish login through the SAME callback route as the real flow
        router.push(`/api/auth/wechat/callback?code=${encodeURIComponent(data.code)}&state=${encodeURIComponent(state)}`);
      }
    }, 1500);
    return () => clearInterval(iv);
  }, [ticketId, status, state, router]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-sm">
      <h1 className="text-lg font-bold text-green-600 mb-1">微信扫码登录</h1>
      <p className="text-gray-500 text-sm mb-6">用手机扫描下方二维码，在手机上确认登录</p>

      <div className="mx-auto w-48 h-48 bg-white border border-gray-200 rounded-lg flex items-center justify-center mb-3 p-2">
        {scanUrl ? (
          <QRCodeSVG value={scanUrl} size={168} level="M" />
        ) : (
          <span className="text-xs text-gray-400">生成二维码中...</span>
        )}
      </div>

      <p className="text-center text-sm mb-4 h-5">
        {status === "pending" && <span className="text-amber-600">等待扫码...</span>}
        {status === "confirmed" && <span className="text-green-600">已确认，正在登录...</span>}
        {status === "error" && <span className="text-red-500">生成失败</span>}
      </p>

      {scanUrl && (
        <p className="text-[10px] text-gray-400 break-all text-center mb-4 leading-tight">{scanUrl}</p>
      )}

      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-400 mb-2 text-center">没有第二台设备？直接模拟手机端扫码</p>
        {ticketId && (
          <Link
            href={`/mock/wechat/scan?t=${ticketId}`}
            className="block text-center rounded-lg bg-green-500 text-white px-4 py-2.5 text-sm font-medium hover:bg-green-600 transition-colors"
          >
            打开手机端确认页
          </Link>
        )}
      </div>

      <Link href="/" className="block text-center text-sm text-gray-400 mt-4 hover:text-gray-600">返回</Link>
    </div>
  );
}

export default function MockWeChatPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-gray-50">
      <div className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center text-sm font-semibold py-1.5 z-50">
        模拟模式 -- 微信扫码登录
      </div>
      <Suspense fallback={<p className="text-gray-500 text-sm">加载中...</p>}>
        <MockWeChatContent />
      </Suspense>
    </main>
  );
}
