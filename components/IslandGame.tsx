"use client";

import { useEffect, useRef } from "react";

export type IslandProgress = {
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
  onProgress,
}: {
  className?: string;
  onProgress?: (progress: IslandProgress) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const onProgressRef = useRef(onProgress);

  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type !== "island-status") return;
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
  }, []);

  return <iframe ref={frame} src="/game/index.html" title="英语小岛 · 互动英语冒险" className={className} style={{ width: "100%", height: "100%", border: 0, display: "block" }} allow="autoplay; fullscreen" allowFullScreen />;
}
