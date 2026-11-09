import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "英语方块岛 · 第一天的冒险",
  description: "推开木门、收集原木、制作一把石斧。在一个会说英语的方块世界里，开始你的第一天冒险。",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) { return <html lang="zh-CN"><body>{children}</body></html>; }
