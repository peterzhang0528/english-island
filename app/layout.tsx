import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "英语方块岛 · 每天一个新冒险",
  description: "做一把斧头，给新朋友烤一个蛋糕。跟着英语提示，在方块小岛上完成每一天的新冒险。",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) { return <html lang="zh-CN"><body>{children}</body></html>; }
