"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Order {
  id: string;
  amount: number;
  provider: string;
  status: string;
  createdAt: string;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((data) => setOrders(data))
      .finally(() => setLoading(false));
  }, []);

  const statusLabel: Record<string, string> = {
    pending: "待支付",
    paid: "已支付",
    failed: "失败",
    closed: "已关闭",
  };

  const statusColor: Record<string, string> = {
    pending: "text-amber-600",
    paid: "text-green-600",
    failed: "text-red-600",
    closed: "text-gray-400",
  };

  return (
    <main className="min-h-screen px-4 py-8 bg-gray-50">
      <div className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center text-sm font-semibold py-1.5 z-50">
        模拟模式
      </div>
      <div className="max-w-md mx-auto pt-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">我的订单</h1>
          <Link href="/dashboard" className="text-sm text-blue-500 hover:underline">
            返回
          </Link>
        </div>
        {loading ? (
          <p className="text-gray-500 text-sm">加载中...</p>
        ) : orders.length === 0 ? (
          <p className="text-gray-500 text-sm">暂无订单</p>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-sm">
                      {(order.amount / 100).toFixed(2)} CNY
                    </p>
                    <p className="text-xs text-gray-500">
                      {order.provider === "wechat" ? "微信" : "支付宝"} ·{" "}
                      {new Date(order.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <span className={`text-sm font-medium ${statusColor[order.status] || ""}`}>
                    {statusLabel[order.status] || order.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
