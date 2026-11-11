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
  wish = false,
  onWishChange,
  onNavigate,
  onProgress,
}: {
  className?: string;
  level?: Level;
  wish?: boolean;
  onWishChange?: (open: boolean) => void;
  onNavigate?: (level: Level) => void;
  onProgress?: (progress: IslandProgress) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const wishFrame = useRef<HTMLIFrameElement>(null);
  const onWishChangeRef = useRef(onWishChange);
  useEffect(() => { onWishChangeRef.current = onWishChange; }, [onWishChange]);
  const onProgressRef = useRef(onProgress);
  const onNavigateRef = useRef(onNavigate);
  useEffect(() => { onNavigateRef.current = onNavigate; }, [onNavigate]);

  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const activeFrame = wish ? wishFrame : frame;
      if (event.origin !== window.location.origin || event.source !== activeFrame.current?.contentWindow) return;
      if (level === 10 && event.data?.type === "island-wish-open" && !wish) { onWishChangeRef.current?.(true); return; }
      if (event.data?.type === "island-wish-close" && wish) { onWishChangeRef.current?.(false); return; }
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
        else void (wish ? wishFrame : frame).current?.requestFullscreen().catch(() => {});
        return;
      }
      (wish ? wishFrame : frame).current?.contentWindow?.postMessage({ type: "island-command", ...detail }, window.location.origin);
    };
    window.addEventListener("message", receive);
    window.addEventListener("island-command", command);
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("island-command", command);
    };
  }, [level, wish]);

  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: "island-command", command: wish ? "pause" : "resume" }, window.location.origin);
  }, [wish]);

  return <>
    <iframe ref={frame} src={gamePath(level)} title={`${dayNames[level].replace("天", "关")} · ${chapters[level].title}`} className={className} aria-hidden={wish} onLoad={() => { if (wish) frame.current?.contentWindow?.postMessage({ type: "island-command", command: "pause" }, window.location.origin); }} style={{ width: "100%", height: "100%", border: 0, display: wish ? "none" : "block" }} allow="autoplay; fullscreen" allowFullScreen />
    {wish && <iframe ref={wishFrame} src="/game/wish.html" title="第十关彩蛋 · 和 K 一起创造愿望地图" className={className} style={{ width: "100%", height: "100%", border: 0, display: "block" }} allow="autoplay; fullscreen" allowFullScreen />}
  </>;
}
