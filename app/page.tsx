"use client";

import { useEffect, useRef, useState } from "react";
import IslandGame from "../components/IslandGame";

import ChapterArtwork from "../components/ChapterArtwork";
import { chapters, chapterNumbers, dayNames, isLevel, type Level } from "../lib/chapters";
import { version as gameVersion } from "../package.json";

type GameStatus = { level?: Level; ready?: boolean; step?: number; words?: string[]; muted?: boolean; completed?: boolean; busy?: boolean };
function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    sound: <><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    muted: <><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/></>,
    restart: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></>,
    expand: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 4 1.5c-1.3.8-1.8 1-1.8 2.5m0 3h.01"/></>,
    feedback: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 10h8m-8 4h5"/></>,
    leaf: <><path d="M20 4C9 1 1 8 7 16s17-1 13-12Z"/><path d="M4 21 16 9"/></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export default function Home() {
  const [level, setLevel] = useState<Level>(1);
  const [completedLevels, setCompletedLevels] = useState<number[]>([]);
  const chapterDialog = useRef<HTMLDialogElement>(null);
  const levelRef = useRef<Level>(1);
  const [status, setStatus] = useState<GameStatus>({ step: 0, muted: false });
  const [restartOpen, setRestartOpen] = useState(false);
  const [chapterOpen, setChapterOpen] = useState(false);
  const restartCancel = useRef<HTMLButtonElement>(null);
  const selectLevel = (next: Level) => {
    if (next === levelRef.current) { chapterDialog.current?.close(); return; }
    levelRef.current = next;
    setLevel(next);
    setStatus(previous => ({ step: 0, muted: previous.muted }));
    const url = new URL(window.location.href); url.searchParams.set("level", String(next));
    window.history.replaceState(null, "", url);
    try { localStorage.setItem("island-last-level", String(next)); } catch {}
    chapterDialog.current?.close();
  };
  useEffect(() => {
    let requested = new URL(window.location.href).searchParams.get("level");
    try { requested ||= localStorage.getItem("island-last-level"); } catch {}
    const restored = Number(requested); if (isLevel(restored)) { levelRef.current = restored; setLevel(restored); }
    try {
      const stored: unknown = JSON.parse(localStorage.getItem("island-completed-levels") || "[]");
      if (Array.isArray(stored)) setCompletedLevels(stored.filter(isLevel));
    } catch {}
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<GameStatus>).detail;
      if (detail.level && detail.level !== levelRef.current) return;
      setStatus(s => ({ ...s, ...detail }));
      if (detail.completed) setCompletedLevels(previous => {
        const next = Array.from(new Set([...previous, levelRef.current]));
        try { localStorage.setItem("island-completed-levels", JSON.stringify(next)); } catch {}
        return next;
      });
    };
    window.addEventListener("island-status", listener);
    return () => window.removeEventListener("island-status", listener);
  }, []);
  useEffect(() => { if(restartOpen) restartCancel.current?.focus(); },[restartOpen]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("island-command", { detail: { command: chapterOpen || restartOpen ? "pause" : "resume" } }));
  }, [chapterOpen, restartOpen, level]);
  const command = (command: string) => window.dispatchEvent(new CustomEvent("island-command", { detail: { command } }));
  const current = status.step || 0;
  const chapter = chapters[level];
  const steps = chapter.steps;
  const feedbackUrl = "https://github.com/peterzhang0528/english-island/issues/new?" + new URLSearchParams({
    template: "bug_report.yml",
    title: `[问题][${dayNames[level].replace("天", "关")}] `,
    version: `v${gameVersion}`,
    reproduce: `当前关卡：${chapter.title}\n当前步骤：${steps[Math.min(current, steps.length - 1)]}${status.completed ? "（已完成）" : ""}\n\n我这样遇到了问题：\n1. `,
  }).toString();
  return <main className="island-app">
    <header className="app-header">
      <a className="brand" href="/" aria-label="英语方块岛首页"><span className="brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path fill="#8dac60" d="m20 3 16 9-16 9L4 12Z"/><path fill="#547941" d="m4 12 16 9v17L4 29Z"/><path fill="#385a32" d="m20 21 16-9v17l-16 9Z"/><path fill="#bdcc86" d="m20 3 8 4.5-16 9L4 12Z"/></svg></span><span><strong>英语方块岛</strong><small>THE LITTLE ENGLISH ADVENTURE</small></span></a>
      <button className="chapter-label chapter-switch" onClick={() => { chapterDialog.current?.showModal(); setChapterOpen(true); }} aria-label="选择关卡" aria-haspopup="dialog"><span className="chapter-dot"/> DAY {String(level).padStart(2, "0")} <span className="chapter-divider">/</span> {chapter.title}<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5"/></svg></button>
      <nav className="app-tools" aria-label="游戏设置">
        <a className="icon-button feedback-button" href={feedbackUrl} target="_blank" rel="noopener noreferrer" title="反馈问题" aria-label="反馈问题（在新窗口打开）"><Icon name="feedback"/></a>
        <button className={status.muted ? "icon-button selected" : "icon-button"} onClick={() => command("mute")} title={status.muted ? "开启声音" : "关闭声音"} aria-label={status.muted ? "开启声音" : "关闭声音"} aria-pressed={Boolean(status.muted)}><Icon name={status.muted ? "muted" : "sound"}/></button>
        <button className="icon-button" onClick={() => setRestartOpen(true)} title="重新开始" aria-label="重新开始"><Icon name="restart"/></button>
        <button className="icon-button expand-button" onClick={() => command("fullscreen")} title="全屏游戏" aria-label="全屏游戏"><Icon name="expand"/></button>
        <span className="toolbar-divider"/><button className="help-button" aria-label="怎么玩" onClick={() => command("help")}><Icon name="help"/><span>怎么玩</span></button>
      </nav>
    </header>
    <section className="game-shell" aria-label="英语互动冒险"><IslandGame key={level} level={level} onNavigate={selectLevel} /></section>
    <footer className="journey-footer">
      <div className="journey-caption"><span className="journey-eyebrow">YOUR LITTLE ADVENTURE</span><strong>{status.completed ? `${dayNames[level]}，完成！` : "每一步，都是新发现。"}</strong></div>
      <ol className="journey-steps" aria-label="任务进度">{steps.map((s,i) => <li key={s} className={current > i ? "done" : current === i ? "active" : ""} aria-current={current === i ? "step" : undefined}><span className="step-node">{current > i ? "✓" : `0${i+1}`}</span><span>{s}</span></li>)}</ol>
      <div className="journey-note"><Icon name="leaf"/><span>在玩耍中，<br/>让英语自然发生。</span></div>
    </footer>
    <dialog ref={chapterDialog} onClose={() => setChapterOpen(false)} className="chapter-dialog" aria-labelledby="chapter-dialog-title" onClick={e => { if(e.target === e.currentTarget) { const r=e.currentTarget.getBoundingClientRect(); if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) e.currentTarget.close(); } }}>
      <button className="chapter-close" onClick={() => chapterDialog.current?.close()} aria-label="关闭关卡选择">×</button>
      <p className="chapter-eyebrow">PICK YOUR ADVENTURE</p><h2 id="chapter-dialog-title">十天，一起把小岛变成家。</h2>
      <p className="story-map-intro">相识，帮助，远行，再重逢。带着前一天的发现，继续下一段故事。<span>已完成 {completedLevels.length} / 10 段冒险</span></p>
      <div className="chapter-options">{chapterNumbers.map(n => <button className={`chapter-option ${n === level ? "current-chapter" : ""}`} key={n} data-level={n} onClick={() => selectLevel(n)}>
        <span className={`chapter-art chapter-art-${n}`} aria-hidden="true"><ChapterArtwork level={n}/></span>
        <span className="chapter-option-content"><span className="chapter-option-kicker">DAY {String(n).padStart(2, "0")} {completedLevels.includes(n) ? "· 已完成 ✓" : n >= 4 ? "· 故事续篇" : ""}</span><strong>{chapters[n].title}</strong><span>{chapters[n].description}</span></span><span className="chapter-option-arrow" aria-hidden="true">{n === level ? "当前" : "→"}</span>
      </button>)}</div><p className="chapter-dialog-note">切换关卡会从这一关的开头开始，已完成的徽章会保留。你也可以自由选择任意一关。</p><a className="co-create-link" href="https://github.com/peterzhang0528/english-island/issues/new/choose" target="_blank" rel="noopener noreferrer">下一段故事，我们一起共创 ↗</a>
    </dialog>
    {restartOpen && <div className="modal-backdrop" onClick={() => setRestartOpen(false)}><section className="restart-dialog" role="dialog" aria-modal="true" aria-labelledby="restart-title" onClick={e => e.stopPropagation()} onKeyDown={e => {if(e.key === "Escape") setRestartOpen(false); if(e.key === "Tab") { const buttons = e.currentTarget.querySelectorAll("button"); if(e.shiftKey && document.activeElement === buttons[0]) {e.preventDefault();buttons[1].focus();} else if(!e.shiftKey && document.activeElement === buttons[1]) {e.preventDefault();buttons[0].focus();} }}}><span className="dialog-icon"><Icon name="restart"/></span><h2 id="restart-title">再开始一次冒险？</h2><p>这一局的进度会重新开始，<br/>学过的英语会留在你的记忆里。</p><div><button ref={restartCancel} className="secondary-button" onClick={() => setRestartOpen(false)}>继续这一局</button><button className="primary-button" onClick={() => {command("restart");setRestartOpen(false);setStatus({step:0,muted:status.muted});}}>重新开始</button></div></section></div>}
  </main>;
}
