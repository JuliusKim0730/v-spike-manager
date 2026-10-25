import { useEffect, useRef, useState } from 'react';
import type { FreeChoice, Career } from '../game/career.ts';
import {
  advance, AXES, canTrade, clubColor, clubShort, clubStarters, DIV_NAME, finance, nextFixture, ovr, phaseLabel, PRESETS, scoutTactic,
  seasonProgress, standings, starterAvg, userClub, userDraftPick, userInPlayoffs, userOnTheClock, clubName, recommendOn, scoutKnown, userTeam,
} from '../game/career.ts';
import { RecommendPanel, ReportCard } from './Assist.tsx';
import { Avatar } from './art.tsx';
import { Crest, Fold, Grade, Icon, Overlay, Ovr, Pos, POS_KO, money, useGame } from './common.tsx';
import type { LiveMode } from './Match.tsx';

export function Home() {
  const { c } = useGame();
  const club = userClub(c);
  const rank = standings(c, club.division).findIndex(x => x.id === c.userId) + 1;
  const [done, total] = seasonProgress(c);
  const pct = Math.round(100 * done / Math.max(1, total));
  return (
    <>
      <div className="statstrip">
        <div><span className="k">신임도</span><span className="v" style={{ color: c.trust < 30 ? 'var(--red)' : undefined }}>{c.trust}</span></div>
        <div><span className="k">시즌</span><span className="v">{c.world.year}년</span></div>
        <div><span className="k">순위</span><span className="v c-red">{rank}위</span></div>
        <div><span className="k">자금</span><span className="v c-blue">{money(club.cash)}</span></div>
      </div>
      <div className="progress"><div className="track"><i style={{ width: `${pct}%` }} /></div><span>{pct}% ({done}/{total})</span></div>
      <TurnCard />
      <ReportCard />
      <Timeline />
      {canTrade(c) && <TradeHint />}
      <Best />
      <Recent />
      <MiniTable />
      <section className="card">
        <h2>구단 소식</h2>
        <div className="news">
          {c.news.slice(0, 10).map((n, i) => (
            <div key={i} className={`news-item ${n.tone ?? ''}`}><div>{n.text}</div><div className="tiny muted">{n.turn}</div></div>
          ))}
        </div>
      </section>
    </>
  );
}

const STEPS: [string, (c: Career) => boolean, string][] = [
  ['준비', c => c.phase.k === 'prep', '시즌 준비'],
  ['훈련', c => c.phase.k === 'camp', '전지훈련'],
  ['자유1', c => c.phase.k === 'free' && c.phase.n === 1, '자유 턴'],
  ['자유2', c => c.phase.k === 'free' && c.phase.n === 2, '자유 턴'],
  ['자유3', c => c.phase.k === 'free' && c.phase.n === 3, '자유 턴'],
  ['계약', c => c.phase.k === 'sponsor', '스폰서'],
  ['전반기', c => c.phase.k === 'match' && c.day < Math.floor(c.days[0].length / 2), '정규리그'],
  ['휴식', c => c.phase.k === 'allstar', '올스타'],
  ['후반기', c => c.phase.k === 'match' && c.day >= Math.floor(c.days[0].length / 2), '정규리그'],
  ['PS', c => c.phase.k === 'playoff', '포스트시즌'],
  ['결산', c => c.phase.k === 'books', '결산'],
  ['시상', c => c.phase.k === 'awards', '시상식'],
  ['은퇴', c => c.phase.k === 'retire', '은퇴'],
  ['FA', c => c.phase.k === 'resign', '재계약'],
  ['FA', c => c.phase.k === 'fa', '외부 FA'],
  ['용병', c => c.phase.k === 'foreign', '트라이아웃'],
  ['신인', c => c.phase.k === 'draft', '드래프트'],
  ['다음', c => c.phase.k === 'next', '새 시즌'],
];

function Timeline() {
  const { c } = useGame();
  const now = STEPS.findIndex(s => s[1](c));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector('.now') as HTMLElement | null;
    if (el && ref.current) ref.current.scrollLeft = el.offsetLeft - ref.current.clientWidth / 2 + el.clientWidth / 2;
  }, [now]);
  return (
    <div className="timeline" ref={ref} aria-label="시즌 일정">
      {STEPS.map(([b, , t], i) => <div key={i} className={`tl ${i < now ? 'done' : i === now ? 'now' : ''}`}><b>{b}</b><span>{t}</span></div>)}
    </div>
  );
}

function Best() {
  const { c, openPlayer } = useGame();
  const club = userClub(c);
  const top = [...club.roster].sort((a, b) => ovr(b) - ovr(a));
  const att = top.find(p => p.position !== 'S' && p.position !== 'L');
  const def = top.find(p => p !== att);
  return (
    <div className="grid2">
      {[att, def].filter(Boolean).map((p, i) => (
        <button key={p!.id} className="best" onClick={() => openPlayer(p!)} style={{ textAlign: 'left' }}>
          <span className="ava"><Avatar id={p!.id} color={clubColor(c.userId)} foreign={p!.foreign} /></span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="lbl">BEST · {i === 0 ? '공격' : POS_KO[p!.position]}</span>
            <b className="ellipsis" style={{ display: 'block', fontSize: 14 }}>{p!.name}</b>
            <span className="tiny muted">{p!.age}세 · {p!.position}</span>
          </span>
          <Ovr v={ovr(p!)} />
        </button>
      ))}
    </div>
  );
}

function MiniTable() {
  const { c, setTab } = useGame();
  const [div, setDiv] = useState(userClub(c).division as number);
  const table = standings(c, div);
  return (
    <section className="card flush">
      <div className="card-head">
        <h2>순위</h2>
        <div className="seg" style={{ width: 168 }}>{DIV_NAME.map((n, d) => <button key={d} aria-pressed={div === d} onClick={() => setDiv(d)}>{n}</button>)}</div>
      </div>
      <table>
        <thead><tr><th className="n" style={{ width: 34 }}>순</th><th>팀</th><th className="n">승</th><th className="n">패</th><th className="n" style={{ paddingRight: 14 }}>승점</th></tr></thead>
        <tbody>
          {table.map((x, i) => (
            <tr key={x.id} className={x.id === c.userId ? 'me' : ''}>
              <td className="n">{i + 1}</td>
              <td><span className="row" style={{ gap: 6 }}><Crest id={x.id} size={20} />{clubShort(x.id)}</span></td>
              <td className="n">{x.wins}</td><td className="n">{x.losses}</td><td className="n" style={{ paddingRight: 14 }}><b>{x.points}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn ghost block" style={{ borderRadius: 0, border: 0, borderTop: '1px solid var(--line)' }} onClick={() => setTab('table')}>전체 기록 보기</button>
    </section>
  );
}

function TradeHint() {
  const { openMarket } = useGame();
  return (
    <button className="menu-row" onClick={openMarket}>
      <span className="ico">🤝</span>
      <span className="grow"><b>이적 시장 열림</b> <span className="tag good">영입 가능</span><div className="tiny muted">FA 선수 영입 · 방출은 선수단에서 언제든</div></span>
      <span className="chev"><Icon name="chev" /></span>
    </button>
  );
}

function Recent() {
  const { c, openMatch } = useGame();
  if (!c.results.length && !c.lastMatch) return null;
  const last = c.results.slice(-5);
  return (
    <section className="card">
      <div className="row between"><h2>최근 경기</h2>{c.lastMatch && <button className="btn xs" onClick={() => openMatch()}>다시 보기</button>}</div>
      <div className="row wrap" style={{ gap: 6 }}>
        {last.map((r, i) => (
          <span key={i} className="row" style={{ gap: 4 }}><span className={`wl ${r.win ? 'w' : 'l'}`}>{r.win ? 'W' : 'L'}</span><span className="tiny">{r.setsWon[0]}:{r.setsWon[1]} {clubShort(r.opp)}</span></span>
        ))}
      </div>
    </section>
  );
}

const FREE: [FreeChoice, string, string][] = [
  ['practice', '연습경기', '경기감각 ↑↑ · 컨디션 ↓ · 성장 조금'],
  ['train', '훈련', '성장 포인트 ↑ · 경기감각 ↓'],
  ['rest', '휴식', '컨디션·체력 회복 · 경기감각 ↓↓'],
];

function TurnCard() {
  const g = useGame();
  const { c, run, toast, busy } = g;
  const club = userClub(c);
  const k = c.phase.k;
  const step = (input = {}, after?: (msg: string | void) => void) => run(() => { const m = advance(c, input); if (m) toast(m); after?.(m); });
  const next = (label = '진행하기') => <button className="btn go block" disabled={busy} onClick={() => step()}>{busy ? <span className="spinner" /> : <><Icon name="play" />{label}</>}</button>;

  if (k === 'prep') return (
    <Turn title="시즌 준비" desc="기본 예산이 들어왔습니다. 선수단과 작전을 점검하고, 필요하면 시설을 짓거나 FA를 영입하세요. 다음 턴은 전지훈련입니다.">
      <FinanceMini />{next('전지훈련 떠나기')}
    </Turn>
  );
  if (k === 'camp') return <Turn title="전지훈련" desc="훈련 효과 1.6배, 경기감각이 조금 올랐습니다. 이어서 자유 턴 3번이 있습니다.">{next()}</Turn>;
  if (k === 'free') return (
    <Turn title={`자유 턴 ${c.phase.n}/3`} desc="이번 턴에 할 일을 고르세요. 개막 때 경기감각 75 이상이면 능력치 ×1.05 보너스를 받습니다.">
      <AvgGauges />
      <div className="stack">
        {FREE.map(([k2, n, d]) => (
          <button key={k2} className="choice" disabled={busy} onClick={() => step({ free: k2 }, () => { if (k2 === 'practice') g.openMatch(); })}><b>{n}</b><span>{d}</span></button>
        ))}
      </div>
    </Turn>
  );
  if (k === 'sponsor') return <Sponsor />;
  if (k === 'match' || (k === 'playoff' && userInPlayoffs(c))) return <MatchCard />;
  if (k === 'allstar') return <Turn title="올스타 휴식기" desc="시즌 절반이 지났습니다. 시즌 중 유일한 이적 창구가 열렸어요.">{next('후반기 시작')}</Turn>;
  if (k === 'playoff') return (
    <Turn title="포스트시즌" desc="우리 팀은 포스트시즌 일정이 없습니다. 다른 팀 경기를 넘기고 결산으로 갈까요?">
      <button className="btn go block" disabled={busy} onClick={() => run(() => { while (c.phase.k === 'playoff') advance(c); })}>{busy ? <span className="spinner" /> : '자동 넘김 (결산까지)'}</button>
      {next('한 경기일 진행')}
    </Turn>
  );
  if (k === 'books') {
    const s = c.seasons[c.seasons.length - 1];
    return (
      <Turn title="시즌 결산" desc={`${s.year}시즌 ${DIV_NAME[s.division]} 최종 ${s.finish}`}>
        <div className="grid2">
          <Kv k="수입" v={money(club.income)} /><Kv k="지출" v={money(club.expense)} />
          <Kv k="손익" v={money(s.balance)} tone={s.balance >= 0 ? 'good' : 'bad'} /><Kv k="신임도" v={`${c.trust}`} tone={c.trust >= 40 ? undefined : 'bad'} />
        </div>
        {(c.trust <= 0 || club.deficitStreak >= 3) && <p className="tag bad" style={{ whiteSpace: 'normal' }}>{c.trust <= 0 ? '신임도가 바닥났습니다.' : '3년 연속 적자입니다.'} 다음 턴에 구단이 결정을 내립니다.</p>}
        {next('시상식으로')}
      </Turn>
    );
  }
  if (k === 'awards') return (
    <Turn title="시상식" desc="정규리그 기록으로 뽑은 수상자입니다.">
      <div className="list">
        {c.awards.map((a, i) => (
          <div key={i} className="item"><span className="grow small muted">{a.title}</span><b>{a.name}</b>{a.club && <span className="tiny muted">{a.club}</span>}{a.value && <span className="tag">{a.value}</span>}</div>
        ))}
      </div>
      {next('은퇴 발표')}
    </Turn>
  );
  if (k === 'retire') return (
    <Turn title="은퇴" desc="모든 선수가 한 살 더 먹었고, 노쇠가 적용됐습니다.">
      {c.retiredNews.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{c.retiredNews.map(n => <li key={n}>{n}</li>)}</ul> : <p className="small muted" style={{ margin: 0 }}>우리 팀에서 은퇴하는 선수는 없습니다.</p>}
      {next('내부 FA 협상')}
    </Turn>
  );
  if (k === 'resign') return <Resign />;
  if (k === 'fa') return <Turn title="외부 FA" desc="다른 팀이 잡지 못한 선수가 시장에 나왔습니다. 이 턴이 끝나면 다른 구단들이 남은 선수를 데려갑니다."><button className="btn outline-orange block" onClick={g.openMarket}>FA 시장 열기</button>{next('외국인 트라이아웃으로')}</Turn>;
  if (k === 'foreign') return <Foreign />;
  if (k === 'draft') return <Draft />;
  if (k === 'next') {
    const s = c.seasons[c.seasons.length - 1];
    return <Turn title="다음 시즌 준비" desc={`${s.year}시즌 ${s.finish}. 다음 시즌은 ${DIV_NAME[club.division]}에서 시작합니다.`}>{next('새 시즌 시작')}</Turn>;
  }
  return (
    <Turn title="해임" desc={`${clubName(c.userId)} 구단이 감독 교체를 결정했습니다. 재취업 시스템은 다음 단계에서 붙입니다.`}>
      <button className="btn primary block" onClick={g.quit}>타이틀로</button>
    </Turn>
  );
}

const TURN_ICO: Record<string, string> = {
  prep: '📋', camp: '🏝️', free: '🏐', sponsor: '🤝', match: '🏟️', allstar: '⭐', playoff: '🏆', books: '💰', awards: '🏅',
  retire: '👋', resign: '✍️', fa: '🛒', foreign: '✈️', draft: '🎓', next: '🌅', fired: '📦',
};

function Turn({ title, desc, children }: { title: string; desc: string; children?: React.ReactNode }) {
  const { c } = useGame();
  return (
    <section className="turn" aria-label="이번 턴">
      <div className="turn-head">
        <span className="turn-ico" aria-hidden="true">{TURN_ICO[c.phase.k] ?? '🏐'}</span>
        <div className="grow"><div className="turn-title">{title}</div><p className="turn-desc">{desc}</p></div>
      </div>
      {children}
    </section>
  );
}

function Kv({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'bad' }) {
  return <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px' }}><div className="tiny muted">{k}</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: tone ? `var(--${tone})` : undefined }}>{v}</div></div>;
}

function FinanceMini() {
  const { c } = useGame();
  const f = finance(c);
  return (
    <div className="grid2">
      <Kv k="예상 수입 (스폰서)" v={money(f.sponsor)} />
      <Kv k="연봉 총액" v={money(f.pay)} />
      <Kv k="운영비·유지비" v={money(f.ops + f.maint + f.camp)} />
      <Kv k="예상 손익 (관중·굿즈 제외)" v={money(f.projected)} tone={f.projected >= 0 ? 'good' : 'bad'} />
    </div>
  );
}

function AvgGauges() {
  const { c } = useGame();
  const r = userClub(c).roster;
  const avg = (f: (p: typeof r[number]) => number) => (r.reduce((a, p) => a + f(p), 0) / r.length).toFixed(0);
  return <div className="grid3"><Kv k="경기감각" v={avg(p => p.sense)} /><Kv k="컨디션" v={avg(p => p.condition)} /><Kv k="체력" v={avg(p => p.energy)} /></div>;
}

function Sponsor() {
  const { c, run, toast, busy } = useGame();
  const go = (s: 'parent' | 'naming') => run(() => { advance(c, { sponsor: s }); toast('스폰서 계약 완료 · 비시즌 성장 반영'); });
  return (
    <Turn title="스폰서 계약" desc="이번 시즌 함께할 스폰서를 고르세요. 계약하면 비시즌 훈련 성과가 반영되고 개막전이 다가옵니다.">
      <button className="choice" disabled={busy} onClick={() => go('parent')}><b>모기업</b><span>결산 때 기본 예산의 10% 추가 지원 · 목표가 한 단계 높고 미달 시 신임도 하락 ×1.5</span></button>
      <button className="choice" disabled={busy} onClick={() => go('naming')}><b>네이밍 스폰서</b><span>추가 지원 없음 · 목표가 쉬움</span></button>
    </Turn>
  );
}

function MatchCard() {
  const { c } = useGame();
  const [pre, setPre] = useState(false);
  const f = nextFixture(c);
  if (!f) return null;
  const club = userClub(c);
  const opp = c.world.clubs[f.opp];
  return (
    <section className="turn" aria-label="이번 턴">
      <div className="row between"><span className="tag purple">{f.label}</span><span className="tag">{f.home ? '홈' : '원정'}</span></div>
      <div className="vs-card">
        <div className="vs-team"><Crest id={c.userId} size={44} /><b className="us">{clubShort(c.userId)}</b><span className="tiny muted">{club.wins}승 {club.losses}패 · 전력 {starterAvg(club).toFixed(1)}</span></div>
        <span className="vs-mark">VS</span>
        <div className="vs-team"><Crest id={f.opp} size={44} /><b>{clubShort(f.opp)}</b><span className="tiny muted">{opp.wins}승 {opp.losses}패 · 전력 {starterAvg(opp).toFixed(1)}</span></div>
      </div>
      <button className="btn go block" onClick={() => setPre(true)}><Icon name="play" />진행하기</button>
      {pre && <PreMatch onClose={() => setPre(false)} />}
    </section>
  );
}

function coachTip(c: Career, scout: (string | null)[]): string {
  const [dist, tempo, serve, block] = scout;
  if (serve === '강서브') return '상대는 강서브 팀입니다. 3인 리시브로 버티면 범실을 기다릴 수 있어요.';
  if (serve?.startsWith('목적타')) return '상대가 목적타로 약한 리시버를 노립니다. 리시브 좋은 선수를 선발에 두세요.';
  if (dist === '라이트 집중' || dist === '레프트 중심') return `상대 공격이 ${dist === '라이트 집중' ? '라이트' : '레프트'}에 몰립니다. 에이스 마크 블로킹이 잘 먹혀요.`;
  if (dist === '중앙 활용') return '상대가 중앙 속공을 자주 씁니다. 예측 블로킹을 고려하세요.';
  if (tempo === '빠른 공') return '상대는 빠른 공 위주입니다. 강서브로 리시브를 흔들면 단순해집니다.';
  if (block === '에이스 마크') return '상대가 우리 에이스를 집중 마크합니다. 고른 배분이 낫습니다.';
  return scout.every(x => x == null) ? '전력분석실이 낮아 상대 작전을 읽지 못했습니다. 안정형으로 시작해 보세요.' : '뚜렷한 약점이 안 보입니다. 서브로 리시브부터 흔들어 보세요.';
}

function PreMatch({ onClose }: { onClose(): void }) {
  const g = useGame();
  const { c, run, toast, busy } = g;
  const f = nextFixture(c)!;
  const club = userClub(c);
  const opp = c.world.clubs[f.opp];
  const table = standings(c, club.division);
  const rank = (id: number) => table.findIndex(x => x.id === id) + 1;
  const scout = scoutTactic(c, f.opp);
  const preset = c.preset !== 'custom' ? PRESETS[c.preset].name : '직접 설정';
  const h2h = c.results.filter(r => r.opp === f.opp);
  const play = () => run(() => {
    const m = advance(c);
    onClose();
    if (m) toast(m);
  });
  const direct = (speed: number, mode: LiveMode = 'full') => { onClose(); g.openLive(speed, mode); };
  const [home, away] = f.home ? [c.userId, f.opp] : [f.opp, c.userId];
  return (
    <Overlay title={`${f.label} · 경기 정보`} onClose={onClose} footer={<>
      <button className="btn blue3d" disabled={busy} onClick={() => direct(0)}><Icon name="play" />풀 중계</button>
      <button className="btn orange" disabled={busy} onClick={() => direct(0, 'highlight')}><Icon name="bolt" />하이라이트</button>
      <button className="btn red" disabled={busy} onClick={() => play()}>{busy ? <span className="spinner" /> : '자동 진행'}</button>
    </>}>
      <section className="card">
        <div className="vs-card">
          {[c.userId, f.opp].map((id, k) => (
            <div key={id} className="vs-team" style={{ order: k * 2 }}>
              <Crest id={id} size={46} /><b className={id === c.userId ? 'us' : ''}>{clubName(id)}</b>
              <span className="tiny muted">전력 {starterAvg(c.world.clubs[id]).toFixed(1)} · {rank(id)}위 ({c.world.clubs[id].wins}승 {c.world.clubs[id].losses}패)</span>
            </div>
          ))}
          <span className="vs-mark" style={{ order: 1 }}>VS</span>
        </div>
        <div className="small" style={{ fontWeight: 700 }}>올 시즌 상대 전적 {h2h.filter(r => r.win).length}승 {h2h.filter(r => !r.win).length}패</div>
        <div className="row between small">
          <span className="muted">최근 5경기</span>
          <span className="row" style={{ gap: 4 }}>{c.results.slice(-5).map((r, i) => <span key={i} className={`wl ${r.win ? 'w' : 'l'}`}>{r.win ? 'W' : 'L'}</span>)}{!c.results.length && <span className="tiny muted">기록 없음</span>}</span>
        </div>
      </section>
      <section className="card">
        <div className="row between"><b className="small">상대 작전 · 전력분석실 {club.facilities.analysis}단계</b></div>
        <div className="row wrap" style={{ gap: 6 }}>{scout.map((v, i) => <span key={i} className={`tag ${v ? 'blue' : ''}`}>{AXES[i]}: {v ?? '?'}</span>)}</div>
        <div className="row between small"><span>우리 작전 <b>{preset}</b>{c.autoCoach ? ' · 자동 대응' : ''}</span><button className="btn xs" onClick={() => { onClose(); g.setTab('tactics'); }}>바꾸기</button></div>
        {recommendOn(c) && <Fold title="수석코치 한마디"><span className="small">{coachTip(c, scout)}</span></Fold>}
      </section>
      <RecommendPanel me={userTeam(c).starters} them={clubStarters(c, f.opp)} known={scoutKnown(c, f.opp)} ourOvr={starterAvg(club)} oppOvr={starterAvg(opp)} onEdit={() => { onClose(); g.setTab('tactics'); }} />
      <div className="lineups">
        {[away, home].map(id => (
          <section key={id} className="card">
            <div className="row" style={{ gap: 6 }}><span className={`side-lbl ${id === home ? 'home' : 'away'}`}>{id === home ? 'HOME' : 'AWAY'}</span><Crest id={id} size={18} /><b className="small ellipsis">{clubShort(id)}</b></div>
            {clubStarters(c, id).map(p => <div key={p.id} className="lu"><Pos p={p.position} /><b>{p.name}</b><Ovr v={ovr(p)} /></div>)}
          </section>
        ))}
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>풀 중계 = 모든 랠리를 보며 상대 작전 변화를 확인하고 언제든 작전 지시. 하이라이트 = 주요 장면만 보고 작전 타임·테크니컬 타임아웃·세트 사이에만 작전 변경. 자동 진행 = 수석 코치에게 맡기고 결과만 봅니다. 상대 라인업은 예상 선발입니다.</p>
    </Overlay>
  );
}

function Resign() {
  const { c, refresh, run, busy, toast } = useGame();
  const club = userClub(c);
  const total = c.expiring.filter(e => e.keep).reduce((a, e) => a + e.ask, 0);
  return (
    <Turn title="내부 FA · 재계약" desc={c.expiring.length ? '계약이 끝난 선수들입니다. 잡을 선수를 고르고 계약 기간을 정하세요. 1·2위 팀 선수는 30% 더 요구합니다.' : '올해 계약이 끝나는 선수가 없습니다.'}>
      <div className="list">
        {c.expiring.map(e => {
          const p = club.roster.find(q => q.id === e.id)!;
          if (!p) return null;
          return (
            <div key={e.id} className="item" style={{ flexWrap: 'wrap' }}>
              <Pos p={p.position} />
              <div className="grow"><b>{p.name}</b><div className="tiny muted">{p.age}세 · 현재 {p.salary.toFixed(2)}억 → 요구 <b>{e.ask.toFixed(2)}억</b></div></div>
              <Ovr v={ovr(p)} />
              <div className="row" style={{ width: '100%', gap: 6 }}>
                <div className="seg grow">{[1, 2, 3].map(y => <button key={y} aria-pressed={e.keep && e.years === y} onClick={() => { e.keep = true; e.years = y; refresh(); }}>{y}년</button>)}<button aria-pressed={!e.keep} onClick={() => { e.keep = false; refresh(); }}>보내기</button></div>
              </div>
            </div>
          );
        })}
      </div>
      {c.expiring.length > 0 && <div className="small">재계약 연봉 합계 <b className="num" style={{ fontSize: 17 }}>{total.toFixed(2)}억</b></div>}
      <button className="btn go block" disabled={busy} onClick={() => run(() => { advance(c); toast('재계약 확정 · 외부 FA 시장 개장'); })}>확정하고 외부 FA로</button>
    </Turn>
  );
}

function Foreign() {
  const { c, refresh, run, busy } = useGame();
  const f = finance(c);
  return (
    <Turn title="외국인 트라이아웃" desc={`1년 계약 아포짓(OP) 후보 3명입니다. 용병은 사치재예요. 지금 예상 손익은 ${money(f.projected)}입니다.`}>
      <div className="stack">
        {c.foreignOptions.map((p, i) => (
          <button key={p.id} className="choice" aria-pressed={c.foreignPick === i} onClick={() => { c.foreignPick = i; refresh(); }}>
            <div className="row" style={{ width: '100%' }}><Grade v={ovr(p)} /><b className="grow">{p.name}</b><Ovr v={ovr(p)} /></div>
            <span>{p.age}세 · {p.height}cm · 스파이크 {Math.round(p.tech.spike)} · 연봉 {p.salary}억</span>
          </button>
        ))}
        <button className="choice" aria-pressed={c.foreignPick === -1} onClick={() => { c.foreignPick = -1; refresh(); }}><b>용병 없이 시즌 치르기</b><span>연봉을 아끼고 국내 선수로 버팁니다</span></button>
      </div>
      <button className="btn go block" disabled={busy} onClick={() => run(() => advance(c))}>확정하고 드래프트로</button>
    </Turn>
  );
}

function Draft() {
  const { c, run, busy, toast, refresh } = useGame();
  const [pos, setPos] = useState<string>('all');
  const d = c.draft;
  const onClock = userOnTheClock(c);
  const mine = d?.picks.filter(p => p.club === c.userId) ?? [];
  const pool = (d?.pool ?? []).filter(p => pos === 'all' || p.position === pos)
    .sort((a, b) => (b.potPhys + b.potTech) - (a.potPhys + a.potTech)).slice(0, 25);
  return (
    <Turn title="신인 드래프트" desc={onClock ? `${d!.round + 1}라운드, 우리 차례입니다. 3부 하위 팀부터 지명합니다. 잠재 등급은 스카우트 추정치입니다.` : '드래프트가 끝났습니다.'}>
      {mine.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{mine.map(m => <span key={m.id} className="tag good">{m.round}R {m.name}</span>)}</div>}
      {onClock && (
        <>
          <div className="seg">{['all', 'S', 'OH', 'OP', 'MB', 'L'].map(p => <button key={p} aria-pressed={pos === p} onClick={() => setPos(p)}>{p === 'all' ? '전체' : p}</button>)}</div>
          <div className="list">
            {pool.map(p => (
              <div key={p.id} className="item">
                <Pos p={p.position} />
                <div className="grow"><b>{p.name}</b><div className="tiny muted">{p.age}세 · {p.height}cm · 현재 OVR {ovr(p)}</div></div>
                <div className="stack" style={{ alignItems: 'center', gap: 0 }}><span className="tiny muted">잠재</span><Grade v={(p.potPhys + p.potTech) / 2} /></div>
                <button className="btn sm primary" disabled={busy} onClick={() => { userDraftPick(c, p); toast(`${p.name} 지명`); refresh(); }}>지명</button>
              </div>
            ))}
          </div>
          <button className="btn block" onClick={() => { userDraftPick(c, null); refresh(); }}>남은 지명권 포기</button>
        </>
      )}
      {!onClock && <button className="btn go block" disabled={busy} onClick={() => run(() => advance(c))}>드래프트 마치기</button>}
    </Turn>
  );
}
