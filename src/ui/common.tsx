import { createContext, useContext, useState } from 'react';
import type { Career } from '../game/career.ts';
import { clubColor, clubShort } from '../game/career.ts';
import type { Pro } from '../engine/league/types.ts';
import { gradeOf } from '../engine/league/rules.ts';
import { CFG } from '../engine/config.ts';
import { CrestArt } from './art.tsx';
import type { LiveMode } from './Match.tsx';

export interface GameApi {
  c: Career;
  refresh(): void;
  toast(msg: string): void;
  /** speed index into the match viewer's speeds (0 = 1×); omitted = show the finished match */
  openMatch(speed?: number): void;
  /** play the user's next match live (작전 타임·교체); speed index as above; mode: full broadcast or highlights */
  openLive(speed: number, mode?: LiveMode): void;
  openPlayer(p: Pro): void;
  openMarket(): void;
  setTab(t: Tab): void;
  busy: boolean;
  run(fn: () => void): void;
  quit(): void;
}
export type Tab = 'home' | 'roster' | 'tactics' | 'table' | 'club';

export const Game = createContext<GameApi>(null!);
export const useGame = () => useContext(Game);

export const POS_KO: Record<string, string> = { S: '세터', OH: '레프트', OP: '라이트', MB: '센터', L: '리베로' };

export function Grade({ v }: { v: number }) {
  const g = gradeOf(v);
  return <span className={`grade ${g}`}>{g}</span>;
}

export function Pos({ p }: { p: string }) {
  return <span className={`pos ${p}`} title={POS_KO[p]}>{p}</span>;
}

export function Crest({ id, size = 34 }: { id: number; size?: number }) {
  return <CrestArt color={clubColor(id)} letter={clubShort(id)[0]} size={size} />;
}

/** OVR number coloured by tier, like a trading card: 90+ purple, 80s red, 70s blue, 60s green, lower olive */
export const ovrTier = (v: number) => (v >= 90 ? 's' : v >= 80 ? 'a' : v >= 70 ? 'b' : v >= 60 ? 'c' : 'd');
export function Ovr({ v, big }: { v: number; big?: boolean }) {
  return <span className={`ovr t-${ovrTier(v)}${big ? ' big' : ''}`}>{Math.round(v)}</span>;
}

export function Stars({ n, max = 5 }: { n: number; max?: number }) {
  return <span className="stars" aria-label={`${n}/${max}`}>{'★'.repeat(n)}<i>{'★'.repeat(max - n)}</i></span>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="row between"><b style={{ fontSize: 17 }}>{title}</b><button className="btn sm ghost" onClick={onClose}>닫기</button></div>
        {children}
      </div>
    </div>
  );
}

type Level = 'up' | 'mid' | 'down';
export const senseLv = (v: number): Level => (v >= CFG.senseUpAt ? 'up' : v < CFG.senseDownBelow ? 'down' : 'mid');
export const condLv = (v: number): Level => (v >= CFG.condUpAt ? 'up' : v < CFG.condDownBelow ? 'down' : 'mid');
export const energyLv = (v: number): Level => (v >= 70 ? 'up' : v < 45 ? 'down' : 'mid');
const ARROW = { up: '▲', mid: '●', down: '▼' };

export function Gauges({ p }: { p: Pro }) {
  const g: [string, Level][] = [['감각', senseLv(p.sense)], ['컨디션', condLv(p.condition)], ['체력', energyLv(p.energy)]];
  return (
    <span className="row" style={{ gap: 6 }}>
      {g.map(([k, l]) => <span key={k} className={`gauge ${l}`} title={`${k} ${l === 'up' ? '상승' : l === 'down' ? '하락' : '평균'}`}>{k[0]}{ARROW[l]}</span>)}
    </span>
  );
}

/** 접기 (Julius 2026-10-25: 조언·작전 설명은 접어두고 누르면 펼치기) */
export function Fold({ title, hint, open: open0 = false, children }: { title: React.ReactNode; hint?: React.ReactNode; open?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(open0);
  return (
    <div className={`fold${open ? ' open' : ''}`}>
      <button className="fold-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="grow">{title}</span>{hint && <span className="tiny muted">{hint}</span>}<span className="fold-chev" aria-hidden="true">▾</span>
      </button>
      {open && <div className="fold-body">{children}</div>}
    </div>
  );
}

export const money = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}억`;

export function Icon({ name }: { name: 'home' | 'roster' | 'tactics' | 'table' | 'club' | 'back' | 'chev' | 'play' | 'ff' | 'bolt' }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === 'home' && <><rect x="3" y="3" width="8" height="10" rx="1.5" fill="currentColor" /><rect x="13" y="3" width="8" height="6" rx="1.5" fill="currentColor" /><rect x="3" y="15" width="8" height="6" rx="1.5" fill="currentColor" /><rect x="13" y="11" width="8" height="10" rx="1.5" fill="currentColor" /></>}
      {name === 'roster' && <><circle cx="12" cy="7.5" r="4.5" fill="currentColor" /><path d="M3.5 21c.8-5 4-7.5 8.5-7.5s7.7 2.5 8.5 7.5Z" fill="currentColor" /></>}
      {name === 'tactics' && <><circle cx="12" cy="6" r="3" fill="currentColor" /><circle cx="5" cy="9" r="2.6" fill="currentColor" /><circle cx="19" cy="9" r="2.6" fill="currentColor" /><path d="M6.5 20c.4-4.5 2.4-7 5.5-7s5.1 2.5 5.5 7Z" fill="currentColor" /><path d="M1 18c.3-3 1.6-5 4-5 1 0 1.8.3 2.4.9C6.4 15 5.8 16.4 5.6 18Z M23 18c-.3-3-1.6-5-4-5-1 0-1.8.3-2.4.9 1 1.1 1.6 2.5 1.8 4.1Z" fill="currentColor" /></>}
      {name === 'table' && <><rect x="3" y="12" width="4.5" height="9" rx="1" fill="currentColor" /><rect x="9.75" y="4" width="4.5" height="17" rx="1" fill="currentColor" /><rect x="16.5" y="8" width="4.5" height="13" rx="1" fill="currentColor" /></>}
      {name === 'club' && <><path d="M2 21V9l10-6 10 6v12h-7v-6H9v6Z" fill="currentColor" /></>}
      {name === 'chev' && <path {...p} d="M9 5l7 7-7 7" />}
      {name === 'play' && <path d="M7 4.5v15l12.5-7.5Z" fill="currentColor" />}
      {name === 'ff' && <path d="M3 5v14l9-7Zm9 0v14l9-7Z" fill="currentColor" />}
      {name === 'bolt' && <path d="M13 2 4 14h7l-1 8 9-12h-7Z" fill="currentColor" />}
      {name === 'back' && <path {...p} d="M15 5l-7 7 7 7" />}
    </svg>
  );
}

export function Overlay({ title, onClose, children, right, footer }: { title: string; onClose(): void; children: React.ReactNode; right?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="overlay" role="dialog" aria-label={title}>
      <div className="app">
        <div className="subbar gutter">
          <button className="icon-btn" onClick={onClose} aria-label="닫기"><Icon name="back" /></button>
          <b className="grow ov-title">{title}</b>
          {right}
        </div>
        <main className="content gutter" style={{ paddingBottom: footer ? 'calc(96px + env(safe-area-inset-bottom, 0px))' : 'calc(32px + env(safe-area-inset-bottom, 0px))' }}>{children}</main>
        {footer && <div className="footbar gutter">{footer}</div>}
      </div>
    </div>
  );
}
