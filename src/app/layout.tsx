import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "图文工厂｜AI 内容生产与运营中台",
  description: "图文工厂：AI 内容生产与运营中台——趋势发现、内容计划、AI 生产、人工审核、发布包与数据回流；对接小豆芽 App 完成发布与数据采集。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
