"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

const LABELS: Record<string, string> = { pending: "待支付", paid: "已支付", failed: "失败", closed: "已关闭" };

interface OrderDetail {
  id: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  providerOrderId: string | null;
  createdAt: string;
}

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    try { const r = await fetch("/api/orders/" + id); if (!r.ok) throw new Error("failed"); setOrder(await r.json()); setError(null); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);
  useEffect(() => { if (order?.status === "pending") { const iv = setInterval(fetchOrder, 3000); return () => clearInterval(iv); } }, [order, fetchOrder]);

  if (loading) return <main className="min-h-screen px-4 py-8 bg-gray-50"><div className="max-w-md mx-auto pt-10"><p className="text-gray-500 text-sm">加载中...</p></div></main>;
  if (error || !order) return <main className="min-h-screen px-4 py-8 bg-gray-50"><div className="max-w-md mx-auto pt-10"><p className="text-red-500">{error || "订单未找到"}</p><Link href="/orders" className="text-sm text-blue-500 mt-4 inline-block">返回</Link></div></main>;

  return (
    <main className="min-h-screen px-4 py-8 bg-gray-50">
      <div className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center text-sm font-semibold py-1.5 z-50">模拟模式</div>
      <div className="max-w-md mx-auto pt-10">
        <div className="flex items-center justify-between mb-6"><h1 className="text-xl font-bold">订单详情</h1><Link href="/orders" className="text-sm text-blue-500 hover:underline">返回列表</Link></div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="mb-4">
            <span className={"inline-block px-3 py-1 rounded-full text-sm font-medium " + (order.status === "paid" ? "bg-green-100 text-green-700" : order.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600")}>{LABELS[order.status] || order.status}</span>
            {order.status === "pending" && <span className="ml-2 text-xs text-amber-500 animate-pulse">等待支付通知...</span>}
          </div>
          <table className="w-full text-sm text-gray-600"><tbody>
            <tr><td className="py-1.5 pr-3 text-gray-400">订单号</td><td className="font-mono text-xs break-all">{order.id}</td></tr>
            <tr><td className="py-1.5 pr-3 text-gray-400">金额</td><td>{(order.amount / 100).toFixed(2)} {order.currency}</td></tr>
            <tr><td className="py-1.5 pr-3 text-gray-400">支付方式</td><td>{order.provider === "wechat" ? "微信支付" : "支付宝"}</td></tr>
            {order.providerOrderId != null ? <tr><td className="py-1.5 pr-3 text-gray-400">交易号</td><td className="font-mono text-xs break-all">{order.providerOrderId}</td></tr> : null}
            <tr><td className="py-1.5 pr-3 text-gray-400">创建时间</td><td>{new Date(order.createdAt).toLocaleString("zh-CN")}</td></tr>
          </tbody></table>
        </div>
      </div>
    </main>
  );
}
