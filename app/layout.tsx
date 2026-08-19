import type { Metadata } from "next";
import "./globals.css";
import "./weave.css";

export const metadata: Metadata = {
  title: "LABVIE Pattern Generator",
  description: "格纹、条纹与波点图案实时生成工具",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
