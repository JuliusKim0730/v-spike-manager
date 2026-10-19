import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Career, LiveMatch } from '../game/career.ts';
import { advance, clubName, DIV_NAME, makeWorld, newCareer, phaseLabel, startLive, starterAvg, userClub, budgetOf } from '../game/career.ts';
import { CLUBS } from '../game/names.ts';
import { deleteSlot, lastSlot, loadCareer, saveCareer, slotInfo, SLOTS } from '../game/storage.ts';
import type { Pro } from '../engine/league/types.ts';
import { Crest, Game, Icon, money, Ovr, Sheet, useGame, type GameApi, type Tab } from './common.tsx';
import { TitleScene } from './art.tsx';
import { Home } from './Home.tsx';
import { Roster, PlayerSheet } from './Roster.tsx';
import { Tactics } from './Tactics.tsx';
import { Standings } from './Standings.tsx';
import { Club, Market } from './Club.tsx';
import { LiveMatchView, MatchView } from './Match.tsx';
import { Credits } from './Credits.tsx';

export function App() {
  const [career, setCareer] = useState<Career | null>(null);
  const [screen, setScreen] = useState<'title' | 'new' | 'credits'>('title');
  if (career) return <GameShell career={career} onQuit={() => { setCareer(null); setScreen('title'); }} />;
  if (screen === 'new') return <NewGame onBack={() => setScreen('title')} onStart={c => setCareer(c)} />;
  if (screen === 'credits') return <Credits onBack={() => setScreen('title')} />;
  return <Title onNew={() => setScreen('new')} onLoad={c => setCareer(c)} onCredits={() => setScreen('credits')} />;
}

// ───────────────────────── title ─────────────────────────

function Title({ onNew, onLoad, onCredits }: { onNew(): void; onLoad(c: Career): void; onCredits(): void }) {
  const [, force] = useState(0);
  const [slots, setSlots] = useState(false);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const last = lastSlot();
  const infos = SLOTS.map(slotInfo);
  const load = (i: number) => { const c = loadCareer(i); if (c) onLoad(c); };
  return (
    <div className="title-wrap">
      <div className="title-scene"><TitleScene /></div>
      <div className="title-body gutter">
        <h1 className="logo"><span className="l1">V-스파이크</span><span className="l2">배구단 매니저</span></h1>
        <p style={{ margin: 0, textAlign: 'center', fontSize: 14, textShadow: '0 1px 3px rgb(0 0 0 / .5)' }}>3부 리그에서 1부 챔피언까지.<br />선수를 키우고, 작전을 짜고, 구단을 경영하세요.</p>
        <div className="title-btns">
          <button className="tbtn cont" disabled={last === null} onClick={() => setSlots(true)}>이어하기</button>
          <button className="tbtn new" onClick={onNew}>새 게임 시작</button>
          <span className="tiny" style={{ textAlign: 'center', opacity: .85 }}>게스트 모드 · 기록은 이 브라우저에만 저장됩니다</span>
          <button className="credit-link" onClick={onCredits}>만든이 · Contact</button>
        </div>
      </div>
      {slots && (
        <Sheet title="이어하기" onClose={() => { setSlots(false); setConfirmDel(null); }}>
          {infos.map((s, i) => (
            <div key={i} className="stack" style={{ gap: 6 }}>
              <div className={`slotcard ${s ? '' : 'empty'}`}>
                <div className="grow">
                  <div className="tiny muted" style={{ fontWeight: 700 }}>슬롯 {i + 1}{i === last ? ' · 최근' : ''}</div>
                  {s ? <><b>{s.team}</b><div className="tiny muted">{s.year}시즌 · {s.phase}</div></> : <span className="small">저장된 게임 없음</span>}
                </div>
                {s && <button className="btn xs ghost" onClick={() => setConfirmDel(i)}>삭제</button>}
                {s && <button className="btn sm primary" onClick={() => load(i)}>이어하기</button>}
              </div>
              {confirmDel === i && (
                <div className="confirm">
                  슬롯 {i + 1}의 기록을 지울까요? 되돌릴 수 없습니다.
                  <div className="row"><button className="btn sm danger" onClick={() => { deleteSlot(i); setConfirmDel(null); force(x => x + 1); }}>지우기</button><button className="btn sm" onClick={() => setConfirmDel(null)}>취소</button></div>
                </div>
              )}
            </div>
          ))}
        </Sheet>
      )}
    </div>
  );
}

// ───────────────────────── new game (GDD 1.1) ─────────────────────────

function NewGame({ onBack, onStart }: { onBack(): void; onStart(c: Career): void }) {
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const preview = useMemo(() => makeWorld(seed), [seed]);
  const [div, setDiv] = useState<0 | 1 | 2>(2);
  const [team, setTeam] = useState(0);
  const [funding, setFunding] = useState(1);
  const [games, setGames] = useState<28 | 35 | 42>(35);
  const free = SLOTS.find(s => !slotInfo(s));
  const [slot, setSlot] = useState(free ?? 0);
  const clubs = preview.clubs.filter(c => c.division === div);
  return (
    <div className="app">
      <div className="subbar gutter">
        <button className="icon-btn" onClick={onBack} aria-label="뒤로"><Icon name="back" /></button>
        <b className="grow ov-title">새 커리어</b>
      </div>
      <main className="content gutter" style={{ paddingBottom: 32 }}>
        <section className="card">
          <div className="section-title">1 · 성별 리그</div>
          <div className="seg"><button aria-pressed="true">여자부</button><button disabled title="추후 추가">남자부 (준비 중)</button></div>
          <div className="section-title">2 · 리그</div>
          <div className="seg">
            {DIV_NAME.map((n, d) => <button key={d} aria-pressed={div === d} onClick={() => { setDiv(d as 0 | 1 | 2); setTeam(0); }}>{n} {['· 강팀', '· 중위권', '· 도전'][d]}</button>)}
          </div>
          <p className="small muted" style={{ margin: 0 }}>{['주전 평균 OVR 78~84, 예산 60억 안팎. 우승을 노리는 명문 구단.', '주전 평균 63~67, 예산 30억 안팎. 승격 싸움.', '주전 평균 53~57, 예산 15억 안팎. 드래프트로 키워 올라가는 언더독.'][div]}</p>
        </section>
        <section className="card">
          <div className="section-title">3 · 팀</div>
          <div className="list">
            {clubs.map((c, i) => (
              <button key={c.id} className="item" aria-pressed={team === i} onClick={() => setTeam(i)} style={team === i ? { background: 'var(--blue-soft)' } : undefined}>
                <Crest id={c.id} />
                <div className="grow">
                  <b>{clubName(c.id)}</b>
                  <div className="tiny muted">예산 {money(budgetOf(c))} · 시설 평균 {(Object.values(c.facilities).reduce((a, b) => a + b, 0) / 6).toFixed(1)}단계</div>
                </div>
                <div style={{ textAlign: 'right' }}><Ovr v={starterAvg(c)} /><div className="tiny muted">주전 OVR</div></div>
              </button>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="section-title">4 · 모기업 자금 지원</div>
          <div className="seg">{[[1.3, '강 ×1.3'], [1, '중 ×1.0'], [0.7, '약 ×0.7']].map(([v, n]) => <button key={v} aria-pressed={funding === v} onClick={() => setFunding(v as number)}>{n}</button>)}</div>
          <div className="section-title">5 · 시즌 경기 수</div>
          <div className="seg">{([28, 35, 42] as const).map(g => <button key={g} aria-pressed={games === g} onClick={() => setGames(g)}>{g}경기 ({g / 7}라운드)</button>)}</div>
          <div className="section-title">저장 슬롯</div>
          <div className="seg">{SLOTS.map(s => <button key={s} aria-pressed={slot === s} onClick={() => setSlot(s)}>슬롯 {s + 1}{slotInfo(s) ? ' (덮어씀)' : ''}</button>)}</div>
        </section>
        <button className="btn go block" onClick={() => onStart(newCareer({ slot, division: div, team, funding, games, seed }))}>
          {CLUBS[div * 8 + team].name} 감독 부임
        </button>
      </main>
    </div>
  );
}

// ───────────────────────── game shell ─────────────────────────

function GameShell({ career, onQuit }: { career: Career; onQuit(): void }) {
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

  const refresh = useCallback(() => {
    saveCareer(c, { team: clubName(c.userId), phase: phaseLabel(c) });
    setV(v => v + 1);
  }, [c]);
  const toast = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => { saveCareer(c, { team: clubName(c.userId), phase: phaseLabel(c) }); }, [c]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  const api: GameApi = {
    c, refresh, toast, busy, setTab, quit: onQuit,
    openMatch: (speed?: number) => setMatch(speed ?? 0),
    openLive: (speed: number) => { const m = startLive(c); if (m) setLive({ m, speed }); },
    openPlayer: p => setPlayer(p),
    openMarket: () => setMarket(true),
    run: fn => { setBusy(true); window.setTimeout(() => { try { fn(); } finally { setBusy(false); refresh(); } }, 30); },
  };
  const TABS: [Tab, string][] = [['roster', '선수단'], ['tactics', '팀관리'], ['home', '대시보드'], ['club', '구단운영'], ['table', '기록보기']];

  return (
    <Game.Provider value={api}>
      <div className="app">
        <main className="content gutter" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
          <ClubHead />
          {tab === 'home' && <Home />}
          {tab === 'roster' && <Roster />}
          {tab === 'tactics' && <Tactics />}
          {tab === 'table' && <Standings />}
          {tab === 'club' && <Club />}
        </main>
        <nav className="nav" aria-label="메뉴">
          <div className="nav-inner">
            {TABS.map(([t, n]) => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}><Icon name={t} />{n}</button>)}
          </div>
        </nav>
      </div>
      {match !== false && c.lastMatch && <MatchView report={c.lastMatch} speed={match === 'end' ? 0 : match} atEnd={match === 'end'} onClose={() => setMatch(false)} />}
      {live && <LiveMatchView live={live.m} speed={live.speed} onDone={() => {
        const m = advance(c, { live: live.m });
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

function ClubHead() {
  const { c } = useGame();
  const club = userClub(c);
  return (
    <header className="clubhead">
      <Crest id={c.userId} size={40} />
      <div className="grow">
        <div className="name ellipsis">{clubName(c.userId)}</div>
        <div className="power">{DIV_NAME[club.division]} · 구단 전력 {starterAvg(club).toFixed(1)}</div>
      </div>
      <span className="pill purple" data-phase>{phaseLabel(c)}</span>
    </header>
  );
}
