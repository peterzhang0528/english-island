"use client";

import { useEffect, useRef, useState } from "react";
import IslandGame from "../components/IslandGame";

type Level = 1 | 2 | 3;
const chapters = {
  1: { title: "第一把斧头", subtitle: "森林小匠人", description: "收集原木和石头，亲手做一把斧头。", steps: ["推开木门", "收集原木", "制作木棍", "寻找石头", "合成石斧", "砍倒大树"] },
  2: { title: "给僵尸做蛋糕", subtitle: "小岛烘焙师", description: "去夜晚的农场找食材，在暖灯下为朋友做蛋糕。", steps: ["认识新朋友", "寻找鸡蛋", "收集牛奶", "收割小麦", "制作蛋糕", "分享蛋糕"] },
  3: { title: "自由探索小岛", subtitle: "开放小岛探险", description: "在小岛上自由走动，按任务提醒捡松果、收集木头、做鸟屋，再看看小动物。", steps: ["捡起松果", "收集木头", "搭建鸟屋", "观察动物", "邀请小鸟"] },
};
const chapterNumbers: Level[] = [1, 2, 3];
const dayNames = { 1: "第一天", 2: "第二天", 3: "第三天" };
const gameVersion = "0.3.0";
type GameStatus = { level?: Level; ready?: boolean; step?: number; words?: string[]; muted?: boolean; completed?: boolean; busy?: boolean; questFlags?: Record<string, "done" | "active" | "locked"> };
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
    if (requested === "2" || requested === "3") { const restored = Number(requested) as Level; levelRef.current = restored; setLevel(restored); }
    try {
      const stored: unknown = JSON.parse(localStorage.getItem("island-completed-levels") || "[]");
      if (Array.isArray(stored)) setCompletedLevels(stored.filter(x => chapterNumbers.includes(x)));
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
  const command = (command: string) => window.dispatchEvent(new CustomEvent("island-command", { detail: { command } }));
  const current = status.step || 0;
  const chapter = chapters[level];
  const steps = chapter.steps;
  const feedbackUrl = "https://github.com/peterzhang0528/english-island/issues/new?" + new URLSearchParams({
    template: "bug_report.yml",
    title: `[问题][${dayNames[level].replace("天", "关")}] `,
    version: `v${gameVersion} · https://english-island-zhang-1109.lulabs.chatgpt.site/?level=${level}`,
    reproduce: `当前关卡：${chapter.title}\n当前步骤：${steps[Math.min(current, steps.length - 1)]}${status.completed ? "（已完成）" : ""}\n\n我这样遇到了问题：\n1. `,
  }).toString();
  return <main className="island-app">
    <header className="app-header">
      <a className="brand" href="/" aria-label="英语方块岛首页"><span className="brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path fill="#8dac60" d="m20 3 16 9-16 9L4 12Z"/><path fill="#547941" d="m4 12 16 9v17L4 29Z"/><path fill="#385a32" d="m20 21 16-9v17l-16 9Z"/><path fill="#bdcc86" d="m20 3 8 4.5-16 9L4 12Z"/></svg></span><span><strong>英语方块岛</strong><small>THE LITTLE ENGLISH ADVENTURE</small></span></a>
      <button className="chapter-label chapter-switch" onClick={() => chapterDialog.current?.showModal()} aria-label="选择关卡" aria-haspopup="dialog"><span className="chapter-dot"/> DAY 0{level} <span className="chapter-divider">/</span> {chapter.title}<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5"/></svg></button>
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
      <ol className="journey-steps" aria-label="任务进度">{steps.map((s,i) => { const flag = level === 3 ? status.questFlags?.[["cones","logs","house","watch","invite"][i]] : undefined; const done = flag === "done" || (!flag && current > i); const active = flag ? flag !== "done" : current === i; return <li key={s} className={done ? "done" : active ? "active" : ""} aria-current={active && !done ? "step" : undefined}><span className="step-node">{done ? "✓" : `0${i+1}`}</span><span>{s}</span></li>; })}</ol>
      <div className="journey-note"><Icon name="leaf"/><span>在玩耍中，<br/>让英语自然发生。</span></div>
    </footer>
    <dialog ref={chapterDialog} className="chapter-dialog" aria-labelledby="chapter-dialog-title" onClick={e => { if(e.target === e.currentTarget) { const r=e.currentTarget.getBoundingClientRect(); if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) e.currentTarget.close(); } }}>
      <button className="chapter-close" onClick={() => chapterDialog.current?.close()} aria-label="关闭关卡选择">×</button>
      <p className="chapter-eyebrow">PICK YOUR ADVENTURE</p><h2 id="chapter-dialog-title">今天，去发现什么？</h2>
      <div className="chapter-options">{chapterNumbers.map(n => <button className={`chapter-option ${n === level ? "current-chapter" : ""}`} key={n} data-level={n} onClick={() => selectLevel(n)}>
        <span className={`chapter-art chapter-art-${n}`} aria-hidden="true">{n === 1 ? <svg viewBox="0 0 80 72"><path d="m40 8 25 14-25 14-25-14Z" fill="#a8bf79"/><path d="m15 22 25 14v28L15 50Z" fill="#739751"/><path d="m40 36 25-14v28L40 64Z" fill="#4b713f"/><path d="m40 8 12 7-25 14-12-7Z" fill="#c8d79d"/></svg> : n === 3 ? <svg viewBox="0 0 80 72"><path d="m10 48 30-16 30 16-30 17Z" fill="#d4b388"/><path d="m10 48 30 17v6L10 54Z" fill="#a67f57"/><path d="m40 65 30-17v6L40 71Z" fill="#81633e"/><path d="M40 52V29m0 14c-13 0-17-9-17-9 12-2 17 9 17 9m0-5c12 0 17-8 17-8-12-2-17 8-17 8" stroke="#64834b" strokeWidth="3" fill="#94b569"/><path d="M40 12c-13-12-23 7-9 12-14 8 1 23 9 11 8 12 23-3 9-11 14-5 4-24-9-12Z" fill="#d58a78"/><circle cx="40" cy="24" r="7" fill="#edcc70"/></svg> : <svg viewBox="0 0 80 72"><path d="M66 3a9 9 0 1 0 9 13 9 9 0 0 1-9-13Z" fill="#f5dda0"/><path d="m20 5 1.5 3.5L25 10l-3.5 1.5L20 15l-1.5-3.5L15 10l3.5-1.5Z" fill="#e8deb5"/><path d="M43 5h2v2h-2zM9 22h2v2H9z" fill="#c6d7e4"/><path d="M12 30 40 15 68 30 40 46Z" fill="#fff5df"/><path d="M12 30 40 46v20L12 50Z" fill="#d7a268"/><path d="M40 46 68 30v20L40 66Z" fill="#bf814c"/><path d="M12 30 40 46v8L12 38Z" fill="#fff7ea"/><path d="M40 46 68 30v8L40 54Z" fill="#f4e5d3"/><path d="m34 20 8-4 8 5-8 5Z" fill="#d96b50"/><path d="m26 30 6-3 6 4-6 3Z" fill="#e18465"/></svg>}</span>
        <span className="chapter-option-content"><span className="chapter-option-kicker">DAY 0{n} {completedLevels.includes(n) ? "· 已完成 ✓" : n === 3 ? "· 新冒险" : ""}</span><strong>{chapters[n].title}</strong><span>{chapters[n].description}</span></span><span className="chapter-option-arrow" aria-hidden="true">{n === level ? "当前" : "→"}</span>
      </button>)}</div><p className="chapter-dialog-note">切换关卡会从这一关的开头开始，已完成的徽章会保留。</p>
    </dialog>
    {restartOpen && <div className="modal-backdrop" onClick={() => setRestartOpen(false)}><section className="restart-dialog" role="dialog" aria-modal="true" aria-labelledby="restart-title" onClick={e => e.stopPropagation()} onKeyDown={e => {if(e.key === "Escape") setRestartOpen(false); if(e.key === "Tab") { const buttons = e.currentTarget.querySelectorAll("button"); if(e.shiftKey && document.activeElement === buttons[0]) {e.preventDefault();buttons[1].focus();} else if(!e.shiftKey && document.activeElement === buttons[1]) {e.preventDefault();buttons[0].focus();} }}}><span className="dialog-icon"><Icon name="restart"/></span><h2 id="restart-title">再开始一次冒险？</h2><p>这一局的进度会重新开始，<br/>学过的英语会留在你的记忆里。</p><div><button ref={restartCancel} className="secondary-button" onClick={() => setRestartOpen(false)}>继续这一局</button><button className="primary-button" onClick={() => {command("restart");setRestartOpen(false);setStatus({step:0,muted:status.muted});}}>重新开始</button></div></section></div>}
  </main>;
}
