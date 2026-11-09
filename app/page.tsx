"use client";

import { useEffect, useRef, useState } from "react";
import IslandGame from "../components/IslandGame";

type GameStatus = { ready?: boolean; step?: number; words?: string[]; muted?: boolean; completed?: boolean; busy?: boolean };
const steps = ["推开木门", "收集原木", "制作木棍", "寻找石头", "合成石斧", "砍倒大树"];
function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    sound: <><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    muted: <><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/></>,
    restart: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></>,
    expand: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 4 1.5c-1.3.8-1.8 1-1.8 2.5m0 3h.01"/></>,
    leaf: <><path d="M20 4C9 1 1 8 7 16s17-1 13-12Z"/><path d="M4 21 16 9"/></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export default function Home() {
  const [status, setStatus] = useState<GameStatus>({ step: 0, muted: false });
  const [restartOpen, setRestartOpen] = useState(false);
  const restartCancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const listener = (e: Event) => setStatus(s => ({ ...s, ...(e as CustomEvent<GameStatus>).detail }));
    window.addEventListener("island-status", listener);
    return () => window.removeEventListener("island-status", listener);
  }, []);
  useEffect(() => { if(restartOpen) restartCancel.current?.focus(); },[restartOpen]);
  const command = (command: string) => window.dispatchEvent(new CustomEvent("island-command", { detail: { command } }));
  const current = status.step || 0;
  return <main className="island-app">
    <header className="app-header">
      <a className="brand" href="/" aria-label="英语方块岛首页"><span className="brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path fill="#8dac60" d="m20 3 16 9-16 9L4 12Z"/><path fill="#547941" d="m4 12 16 9v17L4 29Z"/><path fill="#385a32" d="m20 21 16-9v17l-16 9Z"/><path fill="#bdcc86" d="m20 3 8 4.5-16 9L4 12Z"/></svg></span><span><strong>英语方块岛</strong><small>THE LITTLE ENGLISH ADVENTURE</small></span></a>
      <div className="chapter-label"><span className="chapter-dot"/> DAY 01 <span className="chapter-divider">/</span> 第一把斧头</div>
      <nav className="app-tools" aria-label="游戏设置">
        <button className={status.muted ? "icon-button selected" : "icon-button"} onClick={() => command("mute")} title={status.muted ? "开启声音" : "关闭声音"} aria-label={status.muted ? "开启声音" : "关闭声音"} aria-pressed={Boolean(status.muted)}><Icon name={status.muted ? "muted" : "sound"}/></button>
        <button className="icon-button" onClick={() => setRestartOpen(true)} title="重新开始" aria-label="重新开始"><Icon name="restart"/></button>
        <button className="icon-button expand-button" onClick={() => command("fullscreen")} title="全屏游戏" aria-label="全屏游戏"><Icon name="expand"/></button>
        <span className="toolbar-divider"/><button className="help-button" aria-label="怎么玩" onClick={() => command("help")}><Icon name="help"/><span>怎么玩</span></button>
      </nav>
    </header>
    <section className="game-shell" aria-label="英语互动冒险"><IslandGame /></section>
    <footer className="journey-footer">
      <div className="journey-caption"><span className="journey-eyebrow">YOUR FIRST ADVENTURE</span><strong>{status.completed ? "第一天，完成！" : "每一步，都是新发现。"}</strong></div>
      <ol className="journey-steps" aria-label="任务进度">{steps.map((s,i) => <li key={s} className={current > i ? "done" : current === i ? "active" : ""} aria-current={current === i ? "step" : undefined}><span className="step-node">{current > i ? "✓" : `0${i+1}`}</span><span>{s}</span></li>)}</ol>
      <div className="journey-note"><Icon name="leaf"/><span>在玩耍中，<br/>让英语自然发生。</span></div>
    </footer>
    {restartOpen && <div className="modal-backdrop" onClick={() => setRestartOpen(false)}><section className="restart-dialog" role="dialog" aria-modal="true" aria-labelledby="restart-title" onClick={e => e.stopPropagation()} onKeyDown={e => {if(e.key === "Escape") setRestartOpen(false); if(e.key === "Tab") { const buttons = e.currentTarget.querySelectorAll("button"); if(e.shiftKey && document.activeElement === buttons[0]) {e.preventDefault();buttons[1].focus();} else if(!e.shiftKey && document.activeElement === buttons[1]) {e.preventDefault();buttons[0].focus();} }}}><span className="dialog-icon"><Icon name="restart"/></span><h2 id="restart-title">再开始一次冒险？</h2><p>这一局的进度会重新开始，<br/>学过的英语会留在你的记忆里。</p><div><button ref={restartCancel} className="secondary-button" onClick={() => setRestartOpen(false)}>继续这一局</button><button className="primary-button" onClick={() => {command("restart");setRestartOpen(false);setStatus({step:0,muted:status.muted});}}>重新开始</button></div></section></div>}
  </main>;
}
