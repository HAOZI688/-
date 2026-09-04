import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content OS — AI 社交内容运营平台",
  description: "AI / B2B 内容运营团队的 Content Operations OS：选题、事实核验、AI 工作流、审核、发布与数据回流。",
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
