/** 신인감독모드 screens (design/ROOKIE-MODE.md). Roster, tactics and the match viewer are the career mode's. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Career, LiveMatch } from '../game/career.ts';
import { clubName, clubShort, ovr, starterAvg, userClub, AXES } from '../game/career.ts';
import {
  autoToMatch, chooseEnding, DEALS, dayKind, dealsWeekly, ECON, estimate, LAST_DAY, LEAGUE_NAME, leagueOf, MATCH_DAYS, MAX_SQUAD,
  nextMatch, oppOvr, opponentStarters, OVERSEAS_IDS, payrollWeekly, PRACTICE_GROWTH, PRO_IDS, prospects, recruit, rk, rookieAdvance, rookieLabel,
  rookieScout, rookieStartLive, SCHOOL_IDS, scheduleCheck, scoreTotal, seesPotential, squadFor, STAFF_ROLE, suggestSchedule, TIER_MIN, TIER_TEXT,
  tierOf, tryoutCheck, tryoutPlayers, USER, type League, type Prospect, type RookieFree,
} from '../game/rookie.ts';
import { saveCareer } from '../game/storage.ts';
import type { Pro } from '../engine/league/types.ts';
import type { Position } from '../engine/types.ts';
import { Crest, Game, Grade, Icon, money, Overlay, Ovr, Pos, POS_KO, useGame, type GameApi, type Tab } from './common.tsx';
import { Roster, PlayerSheet } from './Roster.tsx';
import { Tactics } from './Tactics.tsx';
import { LiveMatchView, MatchView } from './Match.tsx';

export function RookieShell({ career, onQuit }: { career: Career; onQuit(): void }) {
  const [, setV] = useState(0);
  const [tab, setTab] = useState<Tab>('home');
  const [toastMsg, setToast] = useState<string | null>(null);
  const [match, setMatch] = useState<number | 'end' | false>(false);
  const [live, setLive] = useState<{ m: LiveMatch; speed: number } | null>(null);
  const [player, setPlayer] = useState<Pro | null>(null);
  const [market, setMarket] = useState(false);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<number>();
  const c = career;
  const meta = () => ({ team: clubName(USER), phase: `신인감독 · ${rookieLabel(c)}` });
  const refresh = useCallback(() => { saveCareer(c, meta()); setV(v => v + 1); }, [c]);
  const toast = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);
  useEffect(() => { saveCareer(c, meta()); }, [c]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);
  const s = rk(c);
  const api: GameApi = {
    c, refresh, toast, busy, setTab, quit: onQuit,
    openMatch: (speed?: number) => setMatch(speed ?? 0),
    openLive: (speed: number) => { const m = rookieStartLive(c); if (m) setLive({ m, speed }); },
    openPlayer: p => setPlayer(p),
    openMarket: () => setMarket(true),
    run: fn => { setBusy(true); window.setTimeout(() => { try { fn(); } finally { setBusy(false); refresh(); } }, 30); },
  };
  const TABS: [Tab, string][] = [['roster', '선수단'], ['tactics', '팀관리'], ['home', '대시보드'], ['club', '구단운영'], ['table', '리그']];
  const locked = (t: Tab) => !s.revealed && (t === 'roster' || t === 'tactics');
  return (
    <Game.Provider value={api}>
      <div className="app">
        <main className="content gutter" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
          <Head />
          {tab === 'home' && <RookieHome />}
          {tab === 'roster' && !locked(tab) && <Roster />}
          {tab === 'tactics' && !locked(tab) && <Tactics />}
          {tab === 'table' && <Leagues />}
          {tab === 'club' && <RookieClub />}
        </main>
        <nav className="nav" aria-label="메뉴">
          <div className="nav-inner">
            {TABS.map(([t, n]) => <button key={t} disabled={locked(t)} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}><Icon name={t} />{n}</button>)}
          </div>
        </nav>
      </div>
      {match !== false && c.lastMatch && <MatchView report={c.lastMatch} speed={match === 'end' ? 0 : match} atEnd={match === 'end'} onClose={() => setMatch(false)} />}
      {live && <LiveMatchView live={live.m} speed={live.speed} onDone={() => {
        const m = rookieAdvance(c, { live: live.m });
        setLive(null);
        refresh();
        if (m) toast(m);
        setMatch('end');
      }} />}
      {market && <Market onClose={() => setMarket(false)} />}
      {player && <PlayerSheet p={player} onClose={() => setPlayer(null)} />}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Game.Provider>
  );
}

function Head() {
  const { c } = useGame();
  const s = rk(c);
  return (
    <header className="clubhead">
      <Crest id={USER} size={40} />
      <div className="grow">
        <div className="name ellipsis">{clubName(USER)}</div>
        <div className="power">신인감독모드 · {s.revealed ? `구단 전력 ${starterAvg(userClub(c)).toFixed(1)}` : '전력 미공개'}</div>
      </div>
      <span className="pill purple" data-phase>{rookieLabel(c)}</span>
    </header>
  );
}

const lastRating = (c: Career) => rk(c).weeks[rk(c).weeks.length - 1]?.rating ?? 0;

function RookieHome() {
  const { c } = useGame();
  const s = rk(c);
  const club = userClub(c);
  const pct = Math.round(100 * (s.day - 1) / (LAST_DAY - 1));
  const pts = s.games.reduce((a, g) => a + g.points, 0);
  return (
    <>
      <div className="statstrip">
        <div><span className="k">일차</span><span className="v">{s.day}/{LAST_DAY}</span></div>
        <div><span className="k">전적</span><span className="v c-red">{club.wins}승 {club.losses}패</span></div>
        <div><span className="k">시청률</span><span className="v c-purple">{lastRating(c).toFixed(1)}%</span></div>
        <div><span className="k">자금</span><span className="v c-blue">{money(club.cash)}</span></div>
      </div>
      <div className="progress"><div className="track"><i style={{ width: `${pct}%` }} /></div><span>창단 점수 {pts.toFixed(0)}</span></div>
      <Turn />
      <Road />
      {s.weeks.length > 0 && <RatingChart />}
      <section className="card">
        <h2>프로젝트 소식</h2>
        <div className="news">
          {c.news.slice(0, 10).map((n, i) => <div key={i} className={`news-item ${n.tone ?? ''}`}><div>{n.text}</div><div className="tiny muted">{n.turn}</div></div>)}
        </div>
      </section>
    </>
  );
}

/** the 7 official matches as a strip */
function Road() {
  const { c } = useGame();
  const s = rk(c);
  if (!s.schedule.length) return null;
  return (
    <div className="timeline" aria-label="공식전 일정">
      {s.schedule.map((id, i) => {
        const g = s.games[i];
        const now = MATCH_DAYS[i] === s.day || (!g && (i === 0 || s.games[i - 1]));
        return (
          <div key={i} className={`tl ${g ? 'done' : now ? 'now' : ''}`}>
            <b>{g ? `${g.setsWon[0]}:${g.setsWon[1]}` : `${MATCH_DAYS[i]}일`}</b>
            <span>{clubShort(id)}</span>
          </div>
        );
      })}
    </div>
  );
}

function RatingChart() {
  const { c } = useGame();
  const w = rk(c).weeks;
  const max = Math.max(6, ...w.map(x => x.rating));
  return (
    <section className="card">
      <div className="row between"><h2>주간 시청률</h2><span className="tiny muted">PPL 2% · 스폰서 3% · 4.5% · 메인 6%</span></div>
      <div className="rbars" role="img" aria-label={`주간 시청률 ${w.map(x => `${x.week}주 ${x.rating.toFixed(1)}%`).join(', ')}`}>
        {w.map(x => (
          <div key={x.week} className="rbar"><span className="tiny">{x.rating.toFixed(1)}</span><i style={{ height: `${(x.rating / max) * 100}%` }} /><span className="tiny muted">{x.week}주</span></div>
        ))}
      </div>
    </section>
  );
}

function TurnBox({ ico, title, desc, children }: { ico: string; title: string; desc: string; children?: React.ReactNode }) {
  return (
    <section className="turn" aria-label="이번 턴">
      <div className="turn-head">
        <span className="turn-ico" aria-hidden="true">{ico}</span>
        <div className="grow"><div className="turn-title">{title}</div><p className="turn-desc">{desc}</p></div>
      </div>
      {children}
    </section>
  );
}

function Turn() {
  const { c } = useGame();
  const k = dayKind(rk(c).day);
  if (k === 'tryout') return <Tryout />;
  if (k === 'schedule') return <SchedulePick />;
  if (k === 'match') return <MatchCard />;
  if (k === 'ending') return <EndingCard />;
  return <FreeDay />;
}

// ───────────────────────── day 1: tryout ─────────────────────────

const ORDER: Position[] = ['S', 'OH', 'OP', 'MB', 'L'];

function Tryout() {
  const { c, run, busy, toast, refresh } = useGame();
  const t = rk(c).tryout!;
  const [pos, setPos] = useState<'all' | Position>('all');
  const ps = tryoutPlayers(c);
  const list = ps.filter(p => pos === 'all' || p.position === pos)
    .sort((a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || t.stats[b.id].pts - t.stats[a.id].pts);
  const err = tryoutCheck(c);
  const count = (p: Position) => ps.filter(x => x.position === p && t.picked.includes(x.id)).length;
  const toggle = (id: string) => { t.picked = t.picked.includes(id) ? t.picked.filter(x => x !== id) : [...t.picked, id]; refresh(); };
  return (
    <TurnBox ico="📝" title="트라이아웃" desc="지원자 30명이 청백전 6경기를 치렀습니다. 능력치는 모른 채, 경기 기록과 코치 평가만 보고 10~16명을 뽑으세요. ★ = 코치진이 추린 핵심 인력 (미리 선택됨). 합격자의 능력치는 팀 확정 후 공개됩니다.">
      <div className="row wrap" style={{ gap: 6 }}>
        {ORDER.map(p => <span key={p} className="tag">{POS_KO[p]} {count(p)}</span>)}
        <span className="tag blue">합격 {t.picked.length}명</span>
      </div>
      <div className="seg light">{(['all', ...ORDER] as const).map(p => <button key={p} aria-pressed={pos === p} onClick={() => setPos(p)}>{p === 'all' ? '전체' : POS_KO[p]}</button>)}</div>
      <div className="list">
        {list.map(p => {
          const st = t.stats[p.id];
          const on = t.picked.includes(p.id);
          const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '-');
          return (
            <button key={p.id} className="item tryout" aria-pressed={on} onClick={() => toggle(p.id)} style={on ? { background: 'var(--blue-soft)' } : undefined}>
              <Pos p={p.position} />
              <div className="grow" style={{ minWidth: 0 }}>
                <b>{t.recommended.includes(p.id) && <span className="c-orange">★ </span>}{p.name}</b> <span className="tiny muted">{p.age}세 · {p.height}cm</span>
                <div className="tiny muted">{st.g}경기 · 득점 {st.pts} · 공격 {pct(st.kills, st.att)} · 리시브 정확 {pct(st.recvA, st.recv)} · 블록 {st.blocks} · 에이스 {st.aces} · 디그 {st.digs}</div>
              </div>
              <div className="stack" style={{ alignItems: 'center', gap: 2 }}>
                <span className="tiny muted">작전 수행</span><span className={`grade ${st.exec}`}>{st.exec}</span>
              </div>
              <div className="stack" style={{ alignItems: 'center', gap: 2 }}>
                <span className="tiny muted">점프</span><span className={`grade ${st.jump}`}>{st.jump}</span>
              </div>
            </button>
          );
        })}
      </div>
      {err && <p className="small c-red" style={{ margin: 0 }}>{err}</p>}
      <button className="btn go block" disabled={!!err || busy} onClick={() => run(() => { const m = rookieAdvance(c); if (m) toast(m); })}>
        {busy ? <span className="spinner" /> : '합격자 확정 · 능력치 공개'}
      </button>
    </TurnBox>
  );
}

// ───────────────────────── day 2: opponents ─────────────────────────

function fameStars(f: number) { return f >= 3.3 ? 5 : f >= 2.6 ? 4 : f >= 1.8 ? 3 : f >= 1 ? 2 : 1; }

function SchedulePick() {
  const { c, run, busy, toast, refresh } = useGame();
  const s = rk(c);
  const [lg, setLg] = useState<League>('pro');
  const ids = lg === 'pro' ? PRO_IDS : lg === 'overseas' ? OVERSEAS_IDS : SCHOOL_IDS;
  const our = starterAvg(userClub(c));
  const toggle = (id: number) => {
    s.schedule = s.schedule.includes(id) ? s.schedule.filter(x => x !== id) : s.schedule.length < 7 ? [...s.schedule, id] : s.schedule;
    refresh();
  };
  const err = scheduleCheck(c);
  return (
    <TurnBox ico="🗓️" title="공식전 상대 7팀 선정" desc={`고른 순서대로 14·21·28·35·42·49·56일차에 경기합니다. 강팀을 이길수록 점수가 크고, 유명한 팀일수록 시청률이 높아요. 우리 전력 ${our.toFixed(1)} → 1부는 ${squadFor(our)}이 나옵니다 (전력이 오르면 바뀜).`}>
      <div className="row wrap" style={{ gap: 6 }}>
        {s.schedule.map((id, i) => <button key={id} className="tag blue" onClick={() => toggle(id)}>{i + 1}. {clubShort(id)} ✕</button>)}
        {!s.schedule.length && <span className="tiny muted">아직 고른 팀이 없습니다</span>}
      </div>
      <div className="seg">{(['pro', 'overseas', 'school'] as League[]).map(l => <button key={l} aria-pressed={lg === l} onClick={() => setLg(l)}>{LEAGUE_NAME[l]}</button>)}</div>
      <div className="list">
        {ids.map(id => {
          const on = s.schedule.includes(id);
          return (
            <button key={id} className="item" aria-pressed={on} onClick={() => toggle(id)} style={on ? { background: 'var(--blue-soft)' } : undefined}>
              <Crest id={id} />
              <div className="grow"><b>{clubName(id)}</b><div className="tiny muted">화제성 {'★'.repeat(fameStars(rk(c).fame[id]))} · {lg === 'pro' ? `1군 ${starterAvg(c.world.clubs[id]).toFixed(0)} / 상대할 전력 ${oppOvr(c, id, our).toFixed(0)}` : `전력 ${oppOvr(c, id, our).toFixed(0)}`}</div></div>
              {on ? <span className="tag blue">{s.schedule.indexOf(id) + 1}차전</span> : <Ovr v={oppOvr(c, id, our)} />}
            </button>
          );
        })}
      </div>
      <button className="btn block" onClick={() => { s.schedule = suggestSchedule(c); refresh(); }}>코치 추천 일정 (쉬운 팀 → 강한 팀)</button>
      {err && <p className="small c-red" style={{ margin: 0 }}>{err}</p>}
      <button className="btn go block" disabled={!!err || busy} onClick={() => run(() => { const m = rookieAdvance(c); if (m) toast(m); })}>{busy ? <span className="spinner" /> : '일정 확정'}</button>
    </TurnBox>
  );
}

// ───────────────────────── free days ─────────────────────────

const AVG = (c: Career, f: (p: Pro) => number) => Math.round(userClub(c).roster.reduce((a, p) => a + f(p), 0) / Math.max(1, userClub(c).roster.length));

function FreeDay() {
  const g = useGame();
  const { c, run, busy, toast } = g;
  const s = rk(c);
  const next = MATCH_DAYS.find(d => d > s.day);
  const step = (free: RookieFree, league?: League) => run(() => {
    const m = rookieAdvance(c, { free, league });
    if (m) toast(m);
    if (free === 'practice') g.openMatch(2);
  });
  return (
    <TurnBox ico="🏐" title={`${s.day}일차 · 자유 일정`} desc={next ? `다음 공식전까지 ${next - s.day}일. 경기 당일 경기감각 75↑·컨디션 70↑이면 능력치 ×1.05, 체력 50↓이면 경기력이 떨어집니다.` : '공식전은 모두 끝났습니다. 63일차 기업 매칭까지 팀을 정비하세요.'}>
      <div className="grid3">
        <Kv k="경기감각" v={`${AVG(c, p => p.sense)}`} /><Kv k="컨디션" v={`${AVG(c, p => p.condition)}`} /><Kv k="체력" v={`${AVG(c, p => p.energy)}`} />
      </div>
      <div className="stack">
        <button className="choice" disabled={busy} onClick={() => step('train')}><b>훈련</b><span>능력치 성장 · 체력 ↓ · 경기감각 소폭 ↓</span></button>
        <div className="grid3">
          {(['school', 'pro', 'overseas'] as League[]).map(l => (
            <button key={l} className="choice" disabled={busy} onClick={() => step('practice', l)}>
              <b>연습경기</b><span>{l === 'school' ? '고교-대학' : l === 'pro' ? '1부' : '해외 (강한 자극)'} · 성장 ×{PRACTICE_GROWTH[l]}</span>
            </button>
          ))}
        </div>
        <button className="choice" disabled={busy} onClick={() => step('rest')}><b>휴식</b><span>체력·컨디션 회복 · 경기감각 ↓</span></button>
        {next && <button className="btn block" disabled={busy} onClick={() => run(() => toast(autoToMatch(c)))}><Icon name="ff" />공식전 전날까지 자동 진행</button>}
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>연습경기는 짧게 방송돼 주간 시청률에 조금 반영됩니다. 해외팀과의 연습은 성장·방송 효과가 크지만 체력이 많이 듭니다.</p>
    </TurnBox>
  );
}

function Kv({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'bad' }) {
  return <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px' }}><div className="tiny muted">{k}</div><div className="num" style={{ fontSize: 20, fontWeight: 700, color: tone ? `var(--${tone})` : undefined }}>{v}</div></div>;
}

// ───────────────────────── match days ─────────────────────────

function MatchCard() {
  const g = useGame();
  const { c, run, busy, toast } = g;
  const [pre, setPre] = useState(false);
  const f = nextMatch(c);
  if (!f) return null;
  const our = starterAvg(userClub(c));
  const oo = oppOvr(c, f.opp, our);
  const opp = opponentStarters(c, f.opp, f.squad);
  const scout = rookieScout(c, f.opp, f.squad);
  const quick = () => run(() => { const m = rookieAdvance(c); if (m) toast(m); });
  return (
    <section className="turn" aria-label="이번 턴">
      <div className="row between"><span className="tag purple">{f.label} · {rk(c).day}일차</span><span className="tag">{LEAGUE_NAME[leagueOf(f.opp)]}{f.squad ? ` · ${f.squad}` : ''}</span></div>
      <div className="vs-card">
        <div className="vs-team"><Crest id={USER} size={44} /><b className="us">{clubShort(USER)}</b><span className="tiny muted">전력 {our.toFixed(1)}</span></div>
        <span className="vs-mark">VS</span>
        <div className="vs-team"><Crest id={f.opp} size={44} /><b>{clubShort(f.opp)}</b><span className="tiny muted">전력 {oo.toFixed(1)} · 화제성 {'★'.repeat(fameStars(rk(c).fame[f.opp]))}</span></div>
      </div>
      <button className="btn go block" onClick={() => setPre(true)}><Icon name="play" />경기 준비</button>
      {pre && (
        <Overlay title={`${f.label} · 경기 정보`} onClose={() => setPre(false)} footer={<>
          <button className="btn blue3d" disabled={busy} onClick={() => { setPre(false); g.openLive(0); }}><Icon name="play" />직접 지휘</button>
          <button className="btn orange" disabled={busy} onClick={() => { setPre(false); g.openLive(2); }}><Icon name="bolt" />빠른 지휘</button>
          <button className="btn red" disabled={busy} onClick={() => { setPre(false); quick(); }}>결과만</button>
        </>}>
          <section className="card">
            <h2>이기면 · 지면</h2>
            <p className="small" style={{ margin: 0 }}>{oo > our ? `우리보다 ${(oo - our).toFixed(1)} 강한 상대. 이기면 큰 점수, 져도 감점이 작습니다.` : `우리보다 약한 상대. 이겨도 점수가 작고, 지면 크게 깎입니다.`} 풀세트 접전은 이기든 지든 시청률이 크게 오르고, 0:3 완패는 시청률이 떨어집니다.</p>
          </section>
          <section className="card">
            <b className="small">상대 작전 · 전력분석관 {userClub(c).facilities.analysis}/5</b>
            <div className="row wrap" style={{ gap: 6 }}>{scout.map((v, i) => <span key={i} className={`tag ${v ? 'blue' : ''}`}>{AXES[i]}: {v ?? '?'}</span>)}</div>
            <div className="row between small"><span>우리 작전{c.autoCoach ? ' · 자동 대응' : ''}</span><button className="btn xs" onClick={() => { setPre(false); g.setTab('tactics'); }}>바꾸기</button></div>
          </section>
          <section className="card">
            <div className="row" style={{ gap: 6 }}><Crest id={f.opp} size={18} /><b className="small">{clubShort(f.opp)} 예상 선발{f.squad ? ` (${f.squad})` : ''}</b></div>
            {opp.map(p => <div key={p.id} className="lu"><Pos p={p.position} /><b>{p.name}</b><Ovr v={ovr(p)} /></div>)}
          </section>
        </Overlay>
      )}
    </section>
  );
}

// ───────────────────────── day 63: ending ─────────────────────────

function EndingCard() {
  const { c, refresh, quit } = useGame();
  const e = rk(c).ending!;
  const [title, desc] = TIER_TEXT[e.tier];
  const chosen = e.choice !== null ? e.options[e.choice] : null;
  return (
    <TurnBox ico={e.tier === 'S' ? '🏆' : e.tier === 'D' ? '📦' : '🤝'} title={title} desc={desc}>
      <div className="list small">
        {e.parts.map(([k, v]) => <div key={k} className="row between"><span className="muted">{k}</span><b>{v >= 0 ? '+' : ''}{v.toFixed(1)}</b></div>)}
        <div className="row between"><b>최종 점수</b><b className="c-purple" style={{ fontSize: 18 }}>{e.total.toFixed(1)}</b></div>
      </div>
      <div className="tiny muted">기준: S {TIER_MIN.S} · A {TIER_MIN.A} · B {TIER_MIN.B} · C {TIER_MIN.C}점 이상</div>
      {e.options.length > 0 && e.choice === null && (
        <div className="stack">
          {e.options.map((o, i) => <button key={o.name} className="choice" onClick={() => { chooseEnding(c, i); refresh(); }}><b>{o.kind} · {o.name}</b><span>{o.desc}</span></button>)}
        </div>
      )}
      {chosen && <p className="tag good" style={{ whiteSpace: 'normal' }}>{clubName(USER)} × {chosen.name} ({chosen.kind}) — 다음 시즌 V-리그 8번째 구단으로!</p>}
      {(e.options.length === 0 || chosen) && <button className="btn primary block" onClick={quit}>타이틀로</button>}
    </TurnBox>
  );
}

// ───────────────────────── leagues tab ─────────────────────────

function Leagues() {
  const { c } = useGame();
  const s = rk(c);
  const our = s.revealed ? starterAvg(userClub(c)) : 55;
  return (
    <>
      {s.games.length > 0 && (
        <section className="card">
          <h2>공식전 결과</h2>
          <div className="list">
            {s.games.map(g => (
              <div key={g.no} className="item" style={{ flexWrap: 'wrap' }}>
                <span className={`wl ${g.win ? 'w' : 'l'}`}>{g.win ? 'W' : 'L'}</span>
                <div className="grow"><b>{g.no}차전 {clubShort(g.opp)}{g.squad ? ` ${g.squad}` : ''} {g.setsWon[0]}:{g.setsWon[1]}</b><div className="tiny muted">{g.parts.join(' · ')}</div></div>
                <div style={{ textAlign: 'right' }}><b>{g.points >= 0 ? '+' : ''}{g.points.toFixed(1)}</b><div className="tiny muted">시청률 {g.rating.toFixed(1)}%</div></div>
              </div>
            ))}
          </div>
        </section>
      )}
      {(['pro', 'overseas', 'school'] as League[]).map(l => (
        <section key={l} className="card flush">
          <div className="card-head"><h2>{LEAGUE_NAME[l]}</h2><span className="tiny muted">{l === 'pro' ? '1군 / 2군' : l === 'overseas' ? '강한 훈련 상대' : '영입 가능'}</span></div>
          <table>
            <thead><tr><th>팀</th><th className="n">화제성</th><th className="n" style={{ paddingRight: 14 }}>전력</th></tr></thead>
            <tbody>
              {(l === 'pro' ? PRO_IDS : l === 'overseas' ? OVERSEAS_IDS : SCHOOL_IDS).map(id => (
                <tr key={id} className={s.schedule.includes(id) ? 'me' : ''}>
                  <td><span className="row" style={{ gap: 6 }}><Crest id={id} size={20} />{clubShort(id)}{s.schedule.includes(id) && <span className="tag">{s.schedule.indexOf(id) + 1}차전</span>}</span></td>
                  <td className="n">{'★'.repeat(fameStars(s.fame[id]))}</td>
                  <td className="n" style={{ paddingRight: 14 }}>{l === 'pro' ? `${starterAvg(c.world.clubs[id]).toFixed(0)} / ${oppOvr(c, id, 0).toFixed(0)}` : oppOvr(c, id, our).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}

// ───────────────────────── club tab ─────────────────────────

function RookieClub() {
  const { c, quit, openMarket } = useGame();
  const s = rk(c);
  const club = userClub(c);
  const total = scoreTotal(c);
  return (
    <>
      <section className="card">
        <div className="row between"><h2>창단 심사 예상</h2><span className={`grade ${tierOf(total)}`}>{tierOf(total)}</span></div>
        <p className="small" style={{ margin: 0 }}>지금까지 기준 {total.toFixed(1)}점. 63일차에 경기 점수 + 평균 시청률 × 6 + 승리 × 2 + 재정으로 기업 매칭이 결정됩니다.</p>
      </section>
      <button className="menu-row" onClick={openMarket} disabled={!s.revealed}>
        <span className="ico">🛒</span>
        <span className="grow"><b>선수 영입</b> {s.revealed && <span className="tag good">영입 가능</span>}<div className="tiny muted">고교-대학리그 선수 · 무소속 선수 (최대 {MAX_SQUAD}명)</div></span>
        <span className="chev"><Icon name="chev" /></span>
      </button>
      <section className="card">
        <h2>재정 (주간)</h2>
        <div className="list small">
          <Line k="방송 출연료" v={money(ECON.baseIncome)} />
          <Line k={`시청률 수입 (${lastRating(c).toFixed(1)}% × ${ECON.perRating}억)`} v={money(lastRating(c) * ECON.perRating)} />
          <Line k="스폰서 · PPL" v={money(dealsWeekly(c))} />
          <Line k="선수 급여" v={`−${money(payrollWeekly(c))}`} />
          <Line k="운영비" v={`−${money(ECON.opsWeekly)}`} />
          <Line k="현재 자금" v={money(club.cash)} strong />
        </div>
      </section>
      <section className="card">
        <h2>스폰서 · PPL</h2>
        <div className="list small">
          {DEALS.map(d => (
            <div key={d.id} className="row between">
              <span>{s.deals.includes(d.id) ? '✅' : '🔒'} {d.kind} · {d.name}</span>
              <span className="muted">시청률 {d.at}% · 주 +{d.weekly}억</span>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>스태프</h2>
        <div className="list small">
          {s.staff.length ? s.staff.map(st => (
            <div key={st.id} className="row between"><span><span className={`grade ${st.grade}`}>{st.grade}</span> {STAFF_ROLE[st.role][0]} {st.name}</span><span className="tiny muted">{STAFF_ROLE[st.role][1]}</span></div>
          )) : <span className="muted">고용한 스태프 없음</span>}
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>신인감독모드에서는 건물을 지을 수 없습니다. 자금은 선수 영입과 구단 운영에 씁니다.</p>
      </section>
      <button className="btn block" onClick={quit}>저장하고 타이틀로</button>
    </>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className="row between"><span className={strong ? '' : 'muted'}>{k}</span>{strong ? <b>{v}</b> : <span>{v}</span>}</div>;
}

// ───────────────────────── recruiting ─────────────────────────

function Market({ onClose }: { onClose(): void }) {
  const { c, refresh, toast } = useGame();
  const [src, setSrc] = useState<'fa' | 'school'>('fa');
  const [pos, setPos] = useState<'all' | Position>('all');
  const club = userClub(c);
  const pot = seesPotential(c);
  const list = prospects(c).filter(x => (src === 'fa' ? x.from < 0 : x.from >= 0) && (pos === 'all' || x.p.position === pos))
    .sort((a, b) => estimate(c, b.p)[1] - estimate(c, a.p)[1]);
  const sign = (x: Prospect) => { const err = recruit(c, x); if (err) toast(err); else { toast(`${x.p.name} 영입! 능력치 공개 · OVR ${ovr(x.p)}`); refresh(); } };
  return (
    <Overlay title="선수 영입" onClose={onClose}>
      <section className="card">
        <div className="row between small"><span>선수단 {club.roster.length}/{MAX_SQUAD}명</span><b className="c-blue">자금 {money(club.cash)}</b></div>
        <p className="tiny muted" style={{ margin: 0 }}>능력은 스카우트 추정 범위로만 보입니다 (스카우트 등급이 높을수록 좁음). 영입하면 정확한 능력치가 공개돼요. 고교-대학 선수는 학교에 발전기금을 냅니다.</p>
      </section>
      <div className="seg"><button aria-pressed={src === 'fa'} onClick={() => setSrc('fa')}>무소속 (트라이아웃 탈락 포함)</button><button aria-pressed={src === 'school'} onClick={() => setSrc('school')}>고교-대학리그</button></div>
      <div className="seg light">{(['all', ...ORDER] as const).map(p => <button key={p} aria-pressed={pos === p} onClick={() => setPos(p)}>{p === 'all' ? '전체' : POS_KO[p]}</button>)}</div>
      <div className="list">
        {list.map(x => {
          const [lo, hi] = estimate(c, x.p);
          return (
            <div key={x.p.id} className="item">
              <Pos p={x.p.position} />
              <div className="grow" style={{ minWidth: 0 }}>
                <b>{x.p.name}</b> <span className="tiny muted">{x.p.age}세 · {x.p.height}cm{x.from >= 0 ? ` · ${clubShort(x.from)}` : ''}</span>
                <div className="tiny muted">추정 OVR {lo}~{hi}{pot ? ` · 잠재 ${x.p.potGrade}` : ''} · {x.fee > 0.1 ? `발전기금 ${x.fee.toFixed(2)}억 · ` : '계약금 0.1억 · '}연봉 {x.salary.toFixed(2)}억</div>
              </div>
              <Grade v={(lo + hi) / 2} />
              <button className="btn sm primary" onClick={() => sign(x)}>영입</button>
            </div>
          );
        })}
        {!list.length && <span className="small muted">후보가 없습니다.</span>}
      </div>
    </Overlay>
  );
}
