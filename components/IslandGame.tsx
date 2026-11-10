"use client";

import { useEffect, useRef } from "react";

export type IslandProgress = {
  level?: 1 | 2 | 3;
  ready: boolean;
  step: number;
  busy: boolean;
  words: string[];
  muted: boolean;
  completed: boolean;
  error?: string;
};

export default function IslandGame({
  className = "",
  level = 1,
  onNavigate,
  onProgress,
}: {
  className?: string;
  level?: 1 | 2 | 3;
  onNavigate?: (level: 1 | 2 | 3) => void;
  onProgress?: (progress: IslandProgress) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const onProgressRef = useRef(onProgress);
  const onNavigateRef = useRef(onNavigate);
  useEffect(() => { onNavigateRef.current = onNavigate; }, [onNavigate]);

  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "island-navigate" && (event.data.level === 1 || event.data.level === 2 || event.data.level === 3)) { onNavigateRef.current?.(event.data.level); return; }
      if (event.data?.type !== "island-status") return;
      if (event.data.level && event.data.level !== level) return;
      event.data.level = level;
      onProgressRef.current?.(event.data);
      window.dispatchEvent(new CustomEvent("island-status", { detail: event.data }));
    };
    const command = (event: Event) => {
      const detail = (event as CustomEvent<{ command: string }>).detail;
      if (detail?.command === "fullscreen") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void frame.current?.requestFullscreen().catch(() => {});
        return;
      }
      frame.current?.contentWindow?.postMessage({ type: "island-command", ...detail }, window.location.origin);
    };
    window.addEventListener("message", receive);
    window.addEventListener("island-command", command);
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("island-command", command);
    };
  }, [level]);

  return <iframe ref={frame} src={level === 1 ? "/game/index.html" : `/game/day${level}.html`} title={level === 3 ? "第三关 · 自由探索小岛" : level === 2 ? "第二关 · 给僵尸做蛋糕" : "第一关 · 第一把斧头"} className={className} style={{ width: "100%", height: "100%", border: 0, display: "block" }} allow="autoplay; fullscreen" allowFullScreen />;
}
