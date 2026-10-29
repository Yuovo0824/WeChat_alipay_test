import { isMockMode } from "@/lib/env";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      {isMockMode() && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center text-sm font-semibold py-1.5 z-50">
          模拟模式
        </div>
      )}

      <h1 className="text-2xl font-bold mb-2">微信 &amp; 支付宝集成</h1>
      <p className="text-gray-500 mb-10 text-sm">请选择登录方式</p>

      <div className="flex flex-col gap-3 w-64">
        <a
          href="/api/auth/wechat/start"
          className="flex items-center justify-center gap-2 rounded-lg bg-green-500 text-white px-5 py-3 font-medium hover:bg-green-600 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8.69 3.19c3.24-1.54 7.08-.67 9.31 2.12 1.8 2.25 1.88 5.33.5 7.74-.38.65-.83 1.23-1.35 1.73-.1.1-.17.17-.25.22.42 5.22-.72 4.97-2.25 4.31-.31-.13-.56-.24-.81-.34-.97-.41-1.82-.8-3.84.5-.87.56-1.86.5-2.61-.14-1.26-1.07-.94-2.56-.62-3.75.47-1.76-.7-3.56-2.28-4.57-2.24-1.43-5-1.22-6.93.29-.45.35-.22.88.18.75.88-.29 2.84-.89 4.5.25 1.91 1.31 1.73 3.24 1.18 4.91-.26.8-.65 1.6-1.03 2.38-.08.14-.16.27-.23.4-.14.21-.36.24-.55.08-2.4-2.1-3.33-5.32-2.32-8.28.91-2.67 3.14-4.7 5.85-5.6z"/></svg>
          微信登录
        </a>
        <a
          href="/api/auth/alipay/start"
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-500 text-white px-5 py-3 font-medium hover:bg-blue-600 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/></svg>
          支付宝登录
        </a>
      </div>
    </main>
  );
}
