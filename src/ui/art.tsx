/** Hand-made SVG art: club crests, player avatars, isometric facility buildings. All original shapes, no external assets. */
import type { Facility } from '../engine/league/types.ts';

const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

export function CrestArt({ color, letter, size }: { color: string; letter: string; size: number }) {
  return (
    <svg viewBox="0 0 40 44" width={size} height={size * 1.1} aria-hidden="true" style={{ flex: 'none', display: 'block' }}>
      <path d="M20 1 37 6v15c0 11-8 18-17 22C11 39 3 32 3 21V6Z" fill="#fff" stroke="#1b2540" strokeWidth="2" />
      <path d="M20 5 33 9v12c0 8.5-6 14-13 17.5C13 35 7 29.5 7 21V9Z" fill={color} />
      <path d="M7 24c6-3 20-3 26 0" stroke="#fff" strokeWidth="1.6" fill="none" opacity=".7" />
      <text x="20" y="22" textAnchor="middle" fontSize="15" fontWeight="900" fill="#fff" fontFamily="var(--font-body)">{letter}</text>
    </svg>
  );
}

const SKIN = ['#f6d3b3', '#efc29c', '#e2ad84', '#c98d62', '#8d5a3b'];
const HAIR = ['#2b1d16', '#3a2618', '#14110f', '#5a3a22', '#7a4b26', '#c58b3c'];

/** A small chibi player bust in the club's jersey */
export function Avatar({ id, color, num, foreign, size = 44 }: { id: string; color: string; num?: number; foreign?: boolean; size?: number }) {
  const h = hash(id);
  const skin = SKIN[foreign ? 2 + (h % 3) : h % 3];
  const hair = HAIR[foreign ? (h >> 3) % HAIR.length : (h >> 3) % 4];
  const style = (h >> 6) % 3; // 0 ponytail, 1 bob, 2 short
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" style={{ display: 'block' }}>
      {style === 0 && <ellipse cx="35" cy="18" rx="5" ry="9" fill={hair} />}
      <path d="M8 48c1-10 7-15 16-15s15 5 16 15Z" fill={color} />
      <path d="M18 33h12l-6 6Z" fill="#fff" opacity=".85" />
      {num != null && <text x="24" y="47" textAnchor="middle" fontSize="8" fontWeight="900" fill="#fff" fontFamily="var(--font-body)">{num}</text>}
      <rect x="20" y="26" width="8" height="8" rx="3" fill={skin} />
      <circle cx="24" cy="19" r="10" fill={skin} />
      {style === 1
        ? <path d="M13 21c-1-9 4-13 11-13s12 4 11 13c-2-5-5-7-11-7s-9 2-11 7Z" fill={hair} />
        : <path d="M14 18c0-7 4-10 10-10s10 3 10 10c-3-4-6-5-10-5s-7 1-10 5Z" fill={hair} />}
      <circle cx="20.5" cy="20" r="1.3" fill="#1b1b1b" /><circle cx="27.5" cy="20" r="1.3" fill="#1b1b1b" />
      <path d="M22 24.5q2 1.4 4 0" stroke="#9a4a3a" strokeWidth="1" fill="none" strokeLinecap="round" />
      <circle cx="18.5" cy="23" r="1.4" fill="#ff8f8f" opacity=".45" /><circle cx="29.5" cy="23" r="1.4" fill="#ff8f8f" opacity=".45" />
    </svg>
  );
}

// ── isometric buildings ──
const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
const iso = (x: number, y: number, z: number) => `${(60 + (x - y) * C30).toFixed(1)},${(52 + (x + y) * S30 - z).toFixed(1)}`;
const poly = (pts: [number, number, number][]) => pts.map(p => iso(...p)).join(' ');

/** box from (x,y,0) with footprint w×d and height h; colours: top, left (x face), right (y face) */
function Box({ x, y, w, d, h, z = 0, top, left, right }: { x: number; y: number; w: number; d: number; h: number; z?: number; top: string; left: string; right: string }) {
  return (
    <g>
      <polygon points={poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={left} />
      <polygon points={poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} fill={right} />
      <polygon points={poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={top} />
    </g>
  );
}

/** windows on the left (y = y+d) face */
function Windows({ x, y, d, w, z0, rows, cols, color }: { x: number; y: number; d: number; w: number; z0: number; rows: number; cols: number; color: string }) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const wx = x + 3 + k * ((w - 6) / cols), zz = z0 + 4 + r * 8;
    out.push(<polygon key={`${r}-${k}`} points={poly([[wx, y + d, zz], [wx + (w - 6) / cols - 2, y + d, zz], [wx + (w - 6) / cols - 2, y + d, zz + 5], [wx, y + d, zz + 5]])} fill={color} />);
  }
  return <>{out}</>;
}

const GROUND = <polygon points={poly([[-4, -4, 0], [48, -4, 0], [48, 48, 0], [-4, 48, 0]])} fill="#a8d672" stroke="#86b955" strokeWidth="1" />;

export function FacilityArt({ k, level }: { k: Facility; level: number }) {
  const floors = 1 + Math.min(3, Math.floor(level / 2));
  let body: React.ReactNode;
  switch (k) {
    case 'training': body = (
      <>
        <Box x={4} y={6} w={38} d={30} h={10 + floors * 5} top="#f3efe4" left="#d9cfb8" right="#c4b89c" />
        <Box x={4} y={6} w={38} d={30} h={3} z={10 + floors * 5} top="#e2574c" left="#c0453b" right="#a83a31" />
        <Windows x={4} y={6} d={30} w={38} z0={2} rows={floors} cols={4} color="#7cc3f0" />
        <circle cx={iso(23, 21, 22 + floors * 5).split(',')[0]} cy={iso(23, 21, 22 + floors * 5).split(',')[1]} r="7" fill="#ffd84d" stroke="#1d4fb8" strokeWidth="2" />
      </>
    ); break;
    case 'medical': body = (
      <>
        <Box x={8} y={8} w={30} d={28} h={14 + floors * 7} top="#f4f7fb" left="#dce4ee" right="#c3cfdc" />
        <Windows x={8} y={8} d={28} w={30} z0={2} rows={floors + 1} cols={3} color="#8fd0f5" />
        <polygon points={poly([[38, 18, 8 + floors * 7], [38, 26, 8 + floors * 7], [38, 26, 12 + floors * 7], [38, 18, 12 + floors * 7]])} fill="#e23b3b" />
        <polygon points={poly([[38, 20.5, 5 + floors * 7], [38, 23.5, 5 + floors * 7], [38, 23.5, 15 + floors * 7], [38, 20.5, 15 + floors * 7]])} fill="#e23b3b" />
      </>
    ); break;
    case 'restaurant': body = (
      <>
        <Box x={6} y={8} w={34} d={28} h={12 + floors * 4} top="#fff4e0" left="#f2d9b0" right="#ddbf8f" />
        <Box x={6} y={34} w={34} d={4} h={2} z={9 + floors * 4} top="#ff8a3d" left="#f06d1d" right="#d85d12" />
        <Windows x={6} y={8} d={28} w={34} z0={2} rows={1} cols={3} color="#ffd27a" />
        <Box x={10} y={10} w={8} d={8} h={8} z={12 + floors * 4} top="#8a8f99" left="#6c717b" right="#5a5e66" />
      </>
    ); break;
    case 'stadium': body = (
      <>
        <Box x={0} y={2} w={44} d={40} h={8 + floors * 4} top="#dfe6ef" left="#b9c4d3" right="#a1aec0" />
        <polygon points={poly([[6, 8, 8 + floors * 4], [38, 8, 8 + floors * 4], [38, 36, 8 + floors * 4], [6, 36, 8 + floors * 4]])} fill="#e8925a" />
        <polygon points={poly([[11, 13, 8.5 + floors * 4], [33, 13, 8.5 + floors * 4], [33, 31, 8.5 + floors * 4], [11, 31, 8.5 + floors * 4]])} fill="#f4b183" stroke="#fff" strokeWidth="1" />
        <line x1={iso(22, 13, 9 + floors * 4).split(',')[0]} y1={iso(22, 13, 9 + floors * 4).split(',')[1]} x2={iso(22, 31, 9 + floors * 4).split(',')[0]} y2={iso(22, 31, 9 + floors * 4).split(',')[1]} stroke="#1b2540" strokeWidth="1.6" />
        {level >= 3 && <Box x={-2} y={0} w={3} d={3} h={26 + floors * 4} top="#9aa4b4" left="#7d8696" right="#6a7282" />}
      </>
    ); break;
    case 'analysis': body = (
      <>
        <Box x={10} y={10} w={24} d={24} h={18 + floors * 9} top="#cfe7ff" left="#5b8fd9" right="#3f6fb8" />
        <Windows x={10} y={10} d={24} w={24} z0={2} rows={floors + 2} cols={3} color="#bfe2ff" />
        <Box x={19} y={19} w={2} d={2} h={10} z={18 + floors * 9} top="#ccc" left="#999" right="#888" />
        <circle cx={iso(20, 20, 30 + floors * 9).split(',')[0]} cy={iso(20, 20, 30 + floors * 9).split(',')[1]} r="2.5" fill="#ff5050" />
      </>
    ); break;
    case 'scout': body = (
      <>
        <Box x={6} y={10} w={32} d={26} h={12 + floors * 6} top="#eef6ea" left="#7fb36a" right="#5f9450" />
        <Windows x={6} y={10} d={26} w={32} z0={2} rows={floors} cols={3} color="#e6f7d8" />
        <Box x={6} y={10} w={32} d={26} h={2} z={12 + floors * 6} top="#2f6b3a" left="#255a2f" right="#1d4a26" />
        <circle cx={iso(22, 23, 24 + floors * 6).split(',')[0]} cy={iso(22, 23, 24 + floors * 6).split(',')[1]} r="6" fill="#fff" stroke="#1b2540" strokeWidth="2.4" />
        <line x1={+iso(22, 23, 24 + floors * 6).split(',')[0] + 4} y1={+iso(22, 23, 24 + floors * 6).split(',')[1] + 4} x2={+iso(22, 23, 24 + floors * 6).split(',')[0] + 10} y2={+iso(22, 23, 24 + floors * 6).split(',')[1] + 10} stroke="#1b2540" strokeWidth="3" strokeLinecap="round" />
      </>
    ); break;
    case 'bus': body = (
      <>
        <polygon points={poly([[2, 4, 0.5], [42, 4, 0.5], [42, 40, 0.5], [2, 40, 0.5]])} fill="#8b929e" />
        <Box x={8} y={14} w={30} d={12} h={11} z={1} top="#f7f7f2" left="#1d4fb8" right="#163f93" />
        <Windows x={8} y={14} d={12} w={30} z0={1} rows={1} cols={5} color="#c9ecff" />
        {floors > 2 && <Box x={8} y={28} w={30} d={10} h={10} z={1} top="#f7f7f2" left="#f2a516" right="#cf8b0d" />}
      </>
    ); break;
  }
  return (
    <svg viewBox="0 0 120 110" width="100%" height="100%" aria-hidden="true" style={{ display: 'block' }}>
      {GROUND}
      <g opacity={level === 0 ? 0.35 : 1}>{body}</g>
      {level === 0 && <text x="60" y="64" textAnchor="middle" fontSize="12" fontWeight="700" fill="#5d6578">미건설</text>}
    </svg>
  );
}

/** court-side scene for the title screen */
export function TitleScene() {
  return (
    <svg viewBox="0 0 390 300" width="100%" preserveAspectRatio="xMidYMax slice" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4b3a8f" /><stop offset=".55" stopColor="#d9708a" /><stop offset="1" stopColor="#ffb36b" /></linearGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e88a4c" /><stop offset="1" stopColor="#c86a32" /></linearGradient>
      </defs>
      <rect width="390" height="300" fill="url(#sky)" />
      <circle cx="300" cy="150" r="40" fill="#ffe08a" opacity=".85" />
      {/* arena bowl */}
      <path d="M0 170 Q195 120 390 170 V215 H0Z" fill="#3a2f6b" />
      {Array.from({ length: 26 }, (_, i) => <rect key={i} x={6 + i * 15} y={160 - Math.sin(i / 25 * Math.PI) * 22} width="9" height="5" rx="2" fill={['#ffd84d', '#ff8fb1', '#8fd3ff', '#ffffff'][i % 4]} opacity=".7" />)}
      {/* lights */}
      {[40, 350].map(x => <g key={x}><rect x={x - 2} y="60" width="4" height="120" fill="#2a2350" /><rect x={x - 14} y="52" width="28" height="12" rx="2" fill="#2a2350" /><rect x={x - 11} y="55" width="22" height="6" fill="#fff7c2" /></g>)}
      {/* court */}
      <path d="M0 215 H390 V300 H0Z" fill="url(#floor)" />
      <path d="M40 300 L95 215 H295 L350 300Z" fill="#f2a25c" stroke="#fff" strokeWidth="3" />
      <path d="M68 258 H322" stroke="#fff" strokeWidth="3" />
      {/* net */}
      <rect x="62" y="196" width="4" height="64" fill="#2a2350" /><rect x="324" y="196" width="4" height="64" fill="#2a2350" />
      <rect x="66" y="198" width="258" height="26" fill="none" stroke="#fff" strokeWidth="2" />
      {Array.from({ length: 21 }, (_, i) => <line key={i} x1={66 + i * 12.9} y1="198" x2={66 + i * 12.9} y2="224" stroke="#fff" strokeOpacity=".5" />)}
      <line x1="66" y1="211" x2="324" y2="211" stroke="#fff" strokeOpacity=".5" />
      {/* ball */}
      <g transform="translate(250 120)">
        <circle r="17" fill="#ffd84d" stroke="#1d4fb8" strokeWidth="3" />
        <path d="M-15 -6 Q0 2 15 -6 M-9 13 Q0 -2 4 -16 M9 13 Q2 0 -6 -15" stroke="#1d4fb8" strokeWidth="2.5" fill="none" />
      </g>
    </svg>
  );
}
