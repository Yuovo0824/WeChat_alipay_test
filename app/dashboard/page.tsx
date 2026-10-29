import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isMockMode } from "@/lib/env";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/?error=unauthorized");
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/?error=user_not_found");

  return (
    <main className="min-h-screen px-4 py-8 bg-gray-50">
      {isMockMode() && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center text-sm font-semibold py-1.5 z-50">模拟模式</div>
      )}
      <div className="max-w-md mx-auto pt-10">
        <h1 className="text-xl font-bold mb-6">个人中心</h1>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4">
          <div className="flex items-center gap-3 mb-4">
            {user.avatar ? <Image src={user.avatar} alt="" width={48} height={48} className="rounded-full" /> : <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-lg font-semibold">{(user.nickname || "U")[0].toUpperCase()}</div>}
            <div><p className="font-semibold">{user.nickname || "User"}</p><p className="text-xs text-gray-500">{user.provider === "wechat" ? "微信" : "支付宝"}</p></div>
          </div>
          <table className="w-full text-sm text-gray-600"><tbody>
            <tr><td className="py-1 pr-3 text-gray-400">登录方式</td><td className="font-medium">{user.provider === "wechat" ? "微信" : "支付宝"}</td></tr>
            <tr><td className="py-1 pr-3 text-gray-400">用户 ID</td><td className="font-mono text-xs break-all">{user.providerId}</td></tr>
            {user.unionId && <tr><td className="py-1 pr-3 text-gray-400">Union ID</td><td className="font-mono text-xs break-all">{user.unionId}</td></tr>}
          </tbody></table>
        </div>
        <Link href="/checkout?amount=1" className="block text-center rounded-lg bg-blue-600 text-white px-4 py-3 font-medium mb-3 hover:bg-blue-700 transition-colors">购买测试商品 (0.01 CNY)</Link>
        <Link href="/orders" className="block text-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">我的订单</Link>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 mt-3 hover:bg-gray-50 transition-colors">退出登录</button>
        </form>
      </div>
    </main>
  );
}
