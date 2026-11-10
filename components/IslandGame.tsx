"use client";

import { useEffect, useRef } from "react";
import { chapters, dayNames, gamePath, isLevel, type Level } from "../lib/chapters";

export type IslandProgress = {
  level?: Level;
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
  level?: Level;
  onNavigate?: (level: Level) => void;
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
      if (event.data?.type === "island-navigate" && isLevel(event.data.level)) { onNavigateRef.current?.(event.data.level); return; }
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

  return <iframe ref={frame} src={gamePath(level)} title={`${dayNames[level].replace("天", "关")} · ${chapters[level].title}`} className={className} style={{ width: "100%", height: "100%", border: 0, display: "block" }} allow="autoplay; fullscreen" allowFullScreen />;
}
