import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { sfx } from '../audio/sound';
import { celebrate, winTier } from '../components/Celebration';
import { Ctx, FONT, GameCanvas, WEB, label, roundRect } from '../components/canvasKit';
import { BetSelector, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';
import { Flight, MAX_MULT, Pick, PlaneMode, SPEED, fly, pathY } from './planeEngine';

// «Потужноліт»: увесь політ малюється на одному канвасі. Камера їде за літаком,
// гори, айсберги й хвилі зсуваються з різною швидкістю (паралакс).

type Fx = { kind: 'text' | 'boom' | 'splash' | 'pop' | 'smoke'; x: number; y: number; at: number; text?: string; color?: string };

interface Run {
  f: Flight | null;
  x: number; // позиція літака на шляху
  boost: number;
  mult: number;
  next: number; // індекс наступного підбору серед hit
  hits: Pick[];
  taken: Set<Pick>;
  fx: Fx[];
  endAt: number; // коли літак сів або впав
  stake: number;
  shake: number;
  smokeAt: number;
}

const FREE: Run = { f: null, x: 40, boost: 1, mult: 1, next: 0, hits: [], taken: new Set(), fx: [], endAt: 0, stake: 0, shake: 0, smokeAt: 0 };

// Детерміновані «шуми» для гір, айсбергів і хмар.
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function PlaneGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const { width } = useWindowDimensions();
  const [bet, setBet] = useState(100);
  const [mode, setMode] = useState<PlaneMode>('normal');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ m: number; ok: boolean }[]>([]);
  const [message, setMessage] = useState({ text: 'Тисни «ВЗЛІТ»: літак сам збирає бонуси', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const run = useRef<Run>({ ...FREE, taken: new Set(), fx: [] });
  const kick = useRef<() => void>(() => {});
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const W = Math.min(width - 32, 480);
  const H = Math.round(W * 0.92);

  const finish = async (r: Run) => {
    const f = r.f!;
    const won = f.landed ? Math.floor(r.stake * r.mult) : 0;
    setHistory((h) => [{ m: r.mult, ok: f.landed }, ...h].slice(0, 12));
    if (f.landed) {
      wallet.win(game.id, won);
      sfx('win');
      haptic('win');
      setMessage({ text: `Посадка на ×${r.mult.toFixed(2)}: +${formatCoins(won)}`, tone: 'win' });
      if (winTier(won, r.stake)) await celebrate({ kind: 'win', amount: won, bet: r.stake });
    } else {
      sfx('lose');
      haptic('lose');
      setMessage({ text: 'Літак упав у море. Ставка згоріла', tone: 'lose' });
    }
    if (alive.current) setBusy(false);
  };

  const takeOff = () => {
    if (busy) return;
    if (!wallet.bet(game.id, 'fast', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    const f = fly(mode);
    const hits = f.picks.filter((p) => p.hit).sort((a, b) => a.x - b.x);
    run.current = { f, x: 0, boost: 1, mult: 1, next: 0, hits, taken: new Set(), fx: [], endAt: 0, stake: bet, shake: 0, smokeAt: 0 };
    setBusy(true);
    setMessage({ text: 'У польоті…', tone: 'neutral' });
    sfx('whistle', 0.5);
    if (!WEB) {
      // Без канваса просто показуємо підсумок.
      run.current.mult = f.mult;
      setTimeout(() => finish(run.current), 1200);
      return;
    }
    kick.current();
  };

  const boost = () => {
    const r = run.current;
    if (r.f && !r.endAt && r.boost === 1) {
      r.boost = 2.6;
      haptic();
    }
  };

  const draw = (ctx: Ctx, now: number, dt: number) => {
    const r = run.current;
    const f = r.f;
    const topY = H * 0.24;
    const seaY = H * 0.8;
    const toY = (y: number) => seaY - y * (seaY - topY);
    let more = !!f && (!r.endAt || now - r.endAt < 2600);

    // Рух літака і підбори.
    if (f && !r.endAt) {
      r.x = Math.min(f.endX, r.x + SPEED[f.mode] * r.boost * dt);
      while (r.next < r.hits.length && r.x >= r.hits[r.next].x) {
        const p = r.hits[r.next++];
        r.taken.add(p);
        r.mult = p.after;
        const y = pathY(f, p.x);
        if (p.kind === 'rocket') {
          r.fx.push({ kind: 'boom', x: p.x, y, at: now });
          r.fx.push({ kind: 'text', x: p.x, y, at: now, text: '÷2', color: '#FF5A5A' });
          r.shake = now;
          sfx('bomb', 0.7);
          haptic('lose');
        } else {
          r.fx.push({ kind: 'pop', x: p.x, y, at: now, color: p.kind === 'mul' ? '#C084FC' : '#FFD54A' });
          r.fx.push({ kind: 'text', x: p.x, y, at: now, text: p.kind === 'mul' ? `×${p.v}` : `+${p.v}`, color: p.kind === 'mul' ? '#E9D5FF' : '#FFE58A' });
          sfx(p.kind === 'mul' ? 'bonus' : 'coin', 0.6);
          haptic();
        }
      }
      // Мотор заглух: за літаком тягнеться дим.
      if (!f.landed && r.x > f.endX - 260 && now - r.smokeAt > 45) {
        r.smokeAt = now;
        r.fx.push({ kind: 'smoke', x: r.x - 12, y: pathY(f, r.x), at: now });
      }
      if (r.x >= f.endX) {
        r.endAt = now;
        if (!f.landed) {
          r.fx.push({ kind: 'splash', x: f.endX, y: 0, at: now });
          r.shake = now;
        }
        more = true;
        setTimeout(() => finish(r), 450);
      }
    }
    // Після посадки літак ще трохи котиться палубою.
    const roll = f?.landed && r.endAt ? 70 * Math.min(1, (now - r.endAt) / 700) * (2 - Math.min(1, (now - r.endAt) / 700)) : 0;
    const px = r.x + roll;
    const camX = px - W * 0.3;
    const shakeT = now - r.shake;
    const sh = r.shake && shakeT < 350 ? (1 - shakeT / 350) * 6 : 0;
    ctx.save();
    if (sh) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

    // Небо.
    const sky = ctx.createLinearGradient(0, 0, 0, seaY);
    sky.addColorStop(0, '#5E6B7A');
    sky.addColorStop(0.55, '#AEB8C2');
    sky.addColorStop(1, '#E3E7EA');
    ctx.fillStyle = sky;
    ctx.fillRect(-10, -10, W + 20, seaY + 10);
    // Сонце в тумані.
    const sunX = W * 0.68 - (camX * 0.02) % (W * 0.3);
    const sunY = seaY - H * 0.2;
    const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, H * 0.32);
    sun.addColorStop(0, 'rgba(255,250,225,1)');
    sun.addColorStop(0.08, 'rgba(255,246,210,0.95)');
    sun.addColorStop(0.3, 'rgba(255,240,200,0.35)');
    sun.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, seaY);
    // Хмари.
    for (let i = -1; i < 6; i++) {
      const par = 0.15;
      const seg = W * 0.6;
      const base = Math.floor((camX * par) / seg) + i;
      const cx = base * seg - camX * par + hash(base) * seg * 0.5;
      const cy = H * (0.08 + hash(base + 7) * 0.25);
      const cw = W * (0.25 + hash(base + 3) * 0.2);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw / 2, cw / 7, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + cw * 0.18, cy - cw * 0.06, cw / 3.5, cw / 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Далекі гори.
    const ridge = (par: number, amp: number, base: number, color: string, k: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, seaY);
      for (let sx = 0; sx <= W + 8; sx += 8) {
        const wx = (sx + camX * par) / (W * 0.25);
        const i = Math.floor(wx);
        const t = wx - i;
        const s = (1 - Math.cos(Math.PI * t)) / 2;
        const h = hash(i * k) * (1 - s) + hash((i + 1) * k) * s;
        ctx.lineTo(sx, seaY - base - h * amp);
      }
      ctx.lineTo(W, seaY);
      ctx.closePath();
      ctx.fill();
    };
    ridge(0.05, H * 0.12, H * 0.02, 'rgba(120,132,146,0.55)', 1.7);
    ridge(0.12, H * 0.08, H * 0.0, 'rgba(96,108,122,0.7)', 3.1);
    // Туман над горизонтом.
    const fog = ctx.createLinearGradient(0, seaY - H * 0.08, 0, seaY + 4);
    fog.addColorStop(0, 'rgba(230,234,238,0)');
    fog.addColorStop(1, 'rgba(230,234,238,0.85)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, seaY - H * 0.08, W, H * 0.08 + 4);
    // Айсберги на горизонті.
    for (let i = -1; i < 5; i++) {
      const par = 0.35;
      const seg = W * 0.55;
      const b = Math.floor((camX * par) / seg) + i;
      if (hash(b + 11) < 0.35) continue;
      const ix = b * seg - camX * par + hash(b + 5) * seg * 0.6;
      const iw = W * (0.08 + hash(b + 2) * 0.12);
      const ih = iw * (0.35 + hash(b + 9) * 0.35);
      ctx.fillStyle = '#F4F7FA';
      ctx.beginPath();
      ctx.moveTo(ix - iw / 2, seaY + 1);
      ctx.lineTo(ix - iw * 0.2, seaY - ih * 0.7);
      ctx.lineTo(ix, seaY - ih);
      ctx.lineTo(ix + iw * 0.25, seaY - ih * 0.55);
      ctx.lineTo(ix + iw / 2, seaY + 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(150,170,190,0.45)';
      ctx.beginPath();
      ctx.moveTo(ix, seaY - ih);
      ctx.lineTo(ix + iw * 0.25, seaY - ih * 0.55);
      ctx.lineTo(ix + iw / 2, seaY + 1);
      ctx.lineTo(ix + iw * 0.05, seaY + 1);
      ctx.closePath();
      ctx.fill();
    }
    // Море.
    const sea = ctx.createLinearGradient(0, seaY, 0, H);
    sea.addColorStop(0, '#8C9BA7');
    sea.addColorStop(0.25, '#5B6C79');
    sea.addColorStop(1, '#2C3943');
    ctx.fillStyle = sea;
    ctx.fillRect(-10, seaY, W + 20, H - seaY + 10);
    // Відблиск сонця на воді.
    const glint = ctx.createRadialGradient(sunX, seaY + 8, 0, sunX, seaY + 8, W * 0.3);
    glint.addColorStop(0, 'rgba(255,248,220,0.45)');
    glint.addColorStop(1, 'rgba(255,248,220,0)');
    ctx.fillStyle = glint;
    ctx.fillRect(0, seaY, W, H * 0.12);
    // Хвилі: чим ближче, тим ширші й швидші.
    ctx.strokeStyle = 'rgba(235,242,248,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let row = 0; row < 7; row++) {
      const yy = seaY + 6 + row * row * ((H - seaY) / 40) + row * 3;
      const par = 0.5 + row * 0.12;
      const gap = 26 + row * 14;
      const off = (camX * par + now * 0.01 * (row + 1)) % gap;
      for (let sx = -off + ((row * 13) % gap); sx < W; sx += gap) {
        ctx.moveTo(sx, yy);
        ctx.lineTo(sx + 6 + row * 3, yy);
      }
    }
    ctx.stroke();

    const toS = (wx: number) => wx - camX;
    // Корабель старту і корабель посадки.
    drawShip(ctx, toS(-30), seaY, W * 0.42, toY(0.1), true);
    if (f) drawShip(ctx, toS(f.shipX + 25), seaY, W * 0.48, toY(0.1), false);

    // Бонуси й ракети.
    if (f) {
      for (const p of f.picks) {
        if (r.taken.has(p)) continue;
        const rx = p.kind === 'rocket' ? p.x + Math.max(0, p.x - r.x) * 0.9 : p.x;
        const sx = toS(rx);
        if (sx < -40 || sx > W + 40) continue;
        const sy = toY(p.y) + (p.kind === 'rocket' ? 0 : Math.sin(now / 300 + p.x) * 3);
        if (p.kind === 'rocket') drawRocket(ctx, sx, sy, W * 0.11, now);
        else drawCoin(ctx, sx, sy, W * 0.045, p.kind === 'mul', p.kind === 'mul' ? `×${p.v}` : `+${p.v}`);
      }
    }

    // Літак.
    const crashed = f && !f.landed && r.endAt;
    if (!crashed) {
      const y = f ? pathY(f, Math.min(px, f.endX)) : 0.1;
      const dy = f && !r.endAt ? pathY(f, px + 6) - y : 0;
      const ang = Math.atan2(-dy * (seaY - topY), 6);
      drawPlane(ctx, toS(px), toY(y) - W * 0.02, W * 0.15, ang, now, !!f && !r.endAt);
    }

    // Ефекти.
    r.fx = r.fx.filter((e) => now - e.at < 1100);
    for (const e of r.fx) {
      const t = (now - e.at) / 1100;
      const sx = toS(e.x);
      const sy = toY(e.y) - W * 0.02;
      if (e.kind === 'smoke') {
        ctx.globalAlpha = 0.55 * (1 - t);
        ctx.fillStyle = t < 0.15 ? '#FF9F1C' : '#4B5563';
        ctx.beginPath();
        ctx.arc(sx, sy - t * 18, 5 + t * 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'text') {
        ctx.globalAlpha = 1 - t;
        label(ctx, e.text!, sx, sy - 20 - t * 50, W * 0.07 * (1 + 0.3 * (1 - t)), e.color);
        ctx.globalAlpha = 1;
      } else if (e.kind === 'pop') {
        ctx.strokeStyle = e.color!;
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, sy, 8 + t * 40, 0, Math.PI * 2);
        ctx.stroke();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          ctx.fillStyle = e.color!;
          ctx.fillRect(sx + Math.cos(a) * t * 46 - 2, sy + Math.sin(a) * t * 46 - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
      } else if (e.kind === 'boom') {
        const rr = 10 + t * 38;
        ctx.globalAlpha = Math.max(0, 1 - t * 1.1);
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr);
        g.addColorStop(0, '#FFF7C2');
        g.addColorStop(0.35, '#FF9F1C');
        g.addColorStop(0.7, 'rgba(120,60,40,0.8)');
        g.addColorStop(1, 'rgba(60,60,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (e.kind === 'splash') {
        const sy0 = seaY + 2;
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillStyle = '#F2F6FA';
        for (let k = 0; k < 14; k++) {
          const a = Math.PI * (0.15 + (k / 13) * 0.7);
          const v = 60 + hash(k) * 70;
          const xx = sx - Math.cos(a) * v * t;
          const yy = sy0 - Math.sin(a) * v * t * 1.4 + 120 * t * t;
          ctx.beginPath();
          ctx.arc(xx, yy, 3 + hash(k + 3) * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = '#F2F6FA';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(sx, sy0 + 4, 10 + t * 60, 3 + t * 8, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();

    // Панель зверху: висота, дистанція, множник.
    const y = f ? Math.max(0, pathY(f, Math.min(px, f.endX))) : 0;
    const pw = W * 0.74;
    const pxl = (W - pw) / 2;
    ctx.fillStyle = 'rgba(30,36,46,0.72)';
    roundRect(ctx, pxl, 10, pw, H * 0.14, 14);
    ctx.fill();
    const cols = [
      ['ВИСОТА', `${Math.round(y * 100)}`, '#FFFFFF'],
      ['ДИСТАНЦІЯ', `${Math.round(Math.max(0, r.x) / 2)}`, '#FFFFFF'],
      ['МНОЖНИК', `×${r.mult.toFixed(2)}`, '#FFD54A'],
    ];
    cols.forEach(([t, v, c], i) => {
      const cx = pxl + (pw / 3) * (i + 0.5);
      label(ctx, t, cx, 10 + H * 0.04, Math.max(8, W * 0.024), 'rgba(255,255,255,0.6)', 800, '');
      label(ctx, v, cx, 10 + H * 0.095, W * 0.05, c, 900, '');
    });
    // Підсумок посадки або падіння.
    if (f && r.endAt) {
      const t = Math.min(1, (now - r.endAt) / 300);
      const bw = W * 0.62;
      const bh = H * 0.15;
      const bx = (W - bw) / 2;
      const by = H * 0.52 - bh / 2;
      ctx.globalAlpha = t;
      ctx.fillStyle = f.landed ? 'rgba(22,101,52,0.9)' : 'rgba(127,29,29,0.9)';
      roundRect(ctx, bx, by, bw, bh, 14);
      ctx.fill();
      label(ctx, f.landed ? `Посадка ×${r.mult.toFixed(2)}` : 'Упав у море', W / 2, by + bh * 0.38, W * 0.058, '#FFFFFF', 900, '');
      label(ctx, f.landed ? 'Літак сів на корабель' : 'Ставка згоріла', W / 2, by + bh * 0.72, W * 0.034, 'rgba(255,255,255,0.8)', 700, '');
      ctx.globalAlpha = 1;
    } else if (f && r.boost === 1) {
      ctx.fillStyle = 'rgba(30,36,46,0.55)';
      roundRect(ctx, W * 0.17, H - H * 0.085, W * 0.66, H * 0.06, 10);
      ctx.fill();
      label(ctx, 'Натисни на екран, щоб прискорити', W / 2, H - H * 0.055, W * 0.032, 'rgba(255,255,255,0.85)', 700, '');
    }
    return more;
  };

  return (
    <View style={styles.root}>
      <Pressable onPress={boost} style={[styles.screen, { width: W, height: H }]}>
        {WEB ? (
          <GameCanvas width={W} height={H} draw={draw} dprMax={2} onKick={(k) => (kick.current = k)} />
        ) : (
          <View style={[styles.native, { width: W, height: H }]}>
            <Text style={styles.nativeText}>✈️ ×{run.current.mult.toFixed(2)}</Text>
          </View>
        )}
      </Pressable>
      <View style={styles.history}>
        {history.map((h, i) => (
          <View key={i} style={[styles.hItem, { backgroundColor: h.ok ? '#14532D' : '#3F1D1D' }]}>
            <Text style={[styles.hText, { color: h.ok ? '#86EFAC' : '#FCA5A5' }]}>{h.ok ? `×${h.m.toFixed(2)}` : '🌊'}</Text>
          </View>
        ))}
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      <View style={styles.modes}>
        {(['normal', 'fast'] as PlaneMode[]).map((m) => (
          <Pressable key={m} disabled={busy} onPress={() => setMode(m)} style={[styles.mode, mode === m && styles.modeOn, busy && styles.dim]}>
            <Text style={[styles.modeText, mode === m && styles.modeTextOn]}>{m === 'normal' ? 'Звичайний' : 'Швидкий'}</Text>
          </Pressable>
        ))}
      </View>
      <BetSelector value={bet} onChange={setBet} disabled={busy} />
      <Pressable onPress={takeOff} disabled={busy} style={({ pressed }) => [styles.goWrap, pressed && { transform: [{ scale: 0.97 }] }]}>
        <LinearGradient colors={busy ? ['#8A6A1F', '#5C4612'] : ['#FFE27A', '#E9A70E']} style={styles.go}>
          <Text style={[styles.goText, busy && { color: '#F5E6B8' }]}>{busy ? 'У ПОЛЬОТІ…' : 'ВЗЛІТ'}</Text>
        </LinearGradient>
      </Pressable>
      <View style={styles.rules}>
        <Text style={styles.rulesTitle}>Як грати</Text>
        <Text style={styles.rule}>✈️ Літак сам вирішує, куди летіти: керувати не треба.</Text>
        <Text style={styles.rule}>🟡 +1…+4 додаються до множника, 🟣 ×2…×4 множать його.</Text>
        <Text style={styles.rule}>🚀 Ракета ділить множник навпіл.</Text>
        <Text style={styles.rule}>🚢 Сів на корабель: ставка × множник (до ×{MAX_MULT}). 🌊 Упав у море: ставка згоряє.</Text>
        <Text style={styles.rule}>⚡ Швидкий режим: коротший політ, менше бонусів, частіше посадка.</Text>
      </View>
    </View>
  );
}

function drawShip(ctx: Ctx, x: number, seaY: number, w: number, deckY: number, carrier: boolean) {
  if (x < -w || x > ctx.canvas.width + w) return;
  const hull = seaY - deckY;
  // Корпус.
  const g = ctx.createLinearGradient(0, deckY, 0, seaY + 6);
  g.addColorStop(0, '#5D6873');
  g.addColorStop(1, '#2F3841');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, deckY);
  ctx.lineTo(x + w / 2 + w * 0.06, deckY);
  ctx.lineTo(x + w / 2 - w * 0.04, seaY + 6);
  ctx.lineTo(x - w / 2 + w * 0.05, seaY + 6);
  ctx.closePath();
  ctx.fill();
  // Палуба.
  ctx.fillStyle = '#3B444D';
  ctx.fillRect(x - w / 2, deckY - 3, w + w * 0.06, 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.45, deckY - 1);
  ctx.lineTo(x + w * 0.5, deckY - 1);
  ctx.stroke();
  ctx.setLineDash([]);
  // Надбудова.
  const tx = carrier ? x + w * 0.28 : x - w * 0.36;
  ctx.fillStyle = '#4A545E';
  ctx.fillRect(tx, deckY - hull * 1.6, w * 0.09, hull * 1.6);
  ctx.fillRect(tx - w * 0.01, deckY - hull * 2.1, w * 0.06, hull * 0.5);
  ctx.fillStyle = '#9FB4C4';
  ctx.fillRect(tx + w * 0.01, deckY - hull * 1.35, w * 0.07, hull * 0.25);
  // Прапорець.
  ctx.strokeStyle = '#2B3138';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tx + w * 0.02, deckY - hull * 2.1);
  ctx.lineTo(tx + w * 0.02, deckY - hull * 2.8);
  ctx.stroke();
  ctx.fillStyle = carrier ? '#FFD54A' : '#22C55E';
  ctx.fillRect(tx + w * 0.02, deckY - hull * 2.8, w * 0.05, hull * 0.35);
  // Піна біля борту.
  ctx.fillStyle = 'rgba(240,246,250,0.6)';
  ctx.fillRect(x - w / 2 + w * 0.04, seaY + 4, w * 0.95, 2);
}

function drawRocket(ctx: Ctx, x: number, y: number, len: number, now: number) {
  ctx.save();
  ctx.translate(x, y);
  // Летить ліворуч, назустріч літаку.
  const fl = len * (0.35 + 0.15 * Math.sin(now / 40));
  const fire = ctx.createLinearGradient(len / 2, 0, len / 2 + fl, 0);
  fire.addColorStop(0, '#FFF3B0');
  fire.addColorStop(0.4, '#FF9F1C');
  fire.addColorStop(1, 'rgba(255,80,30,0)');
  ctx.fillStyle = fire;
  ctx.beginPath();
  ctx.moveTo(len / 2, -len * 0.07);
  ctx.lineTo(len / 2 + fl, 0);
  ctx.lineTo(len / 2, len * 0.07);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#B91C1C';
  ctx.beginPath();
  ctx.moveTo(len / 2, -len * 0.16);
  ctx.lineTo(len / 2 - len * 0.14, 0);
  ctx.lineTo(len / 2, len * 0.16);
  ctx.closePath();
  ctx.fill();
  const body = ctx.createLinearGradient(0, -len * 0.08, 0, len * 0.08);
  body.addColorStop(0, '#F1F5F9');
  body.addColorStop(1, '#94A3B8');
  ctx.fillStyle = body;
  roundRect(ctx, -len / 2 + len * 0.12, -len * 0.08, len * 0.86, len * 0.16, len * 0.08);
  ctx.fill();
  ctx.fillStyle = '#DC2626';
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(-len / 2 + len * 0.16, -len * 0.08);
  ctx.lineTo(-len / 2 + len * 0.16, len * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-len * 0.05, -len * 0.08, len * 0.06, len * 0.16);
  ctx.restore();
}

function drawCoin(ctx: Ctx, x: number, y: number, r: number, mul: boolean, text: string) {
  ctx.save();
  ctx.shadowColor = mul ? 'rgba(192,132,252,0.9)' : 'rgba(255,213,74,0.9)';
  ctx.shadowBlur = 12;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, mul ? '#F3E8FF' : '#FFF7C2');
  g.addColorStop(0.5, mul ? '#A855F7' : '#FACC15');
  g.addColorStop(1, mul ? '#6B21A8' : '#B45309');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = mul ? '#581C87' : '#92400E';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `900 ${r * 0.9}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = mul ? '#FFFFFF' : '#5A2E00';
  ctx.fillText(text, x, y + 1);
}

function drawPlane(ctx: Ctx, x: number, y: number, s: number, ang: number, now: number, flying: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  // Тінь-шлейф у польоті.
  if (flying) {
    const tr = ctx.createLinearGradient(-s * 1.6, 0, -s * 0.4, 0);
    tr.addColorStop(0, 'rgba(255,255,255,0)');
    tr.addColorStop(1, 'rgba(255,255,255,0.55)');
    ctx.strokeStyle = tr;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s * 1.6, -s * 0.02);
    ctx.lineTo(-s * 0.4, -s * 0.02);
    ctx.moveTo(-s * 1.3, s * 0.12);
    ctx.lineTo(-s * 0.2, s * 0.12);
    ctx.stroke();
  }
  // Хвіст.
  ctx.fillStyle = '#C81E1E';
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, -s * 0.02);
  ctx.lineTo(-s * 0.52, -s * 0.3);
  ctx.lineTo(-s * 0.36, -s * 0.3);
  ctx.lineTo(-s * 0.2, -s * 0.04);
  ctx.closePath();
  ctx.fill();
  // Дальнє крило.
  ctx.fillStyle = '#9AA6B2';
  ctx.beginPath();
  ctx.moveTo(-s * 0.02, -s * 0.02);
  ctx.lineTo(-s * 0.16, -s * 0.2);
  ctx.lineTo(-s * 0.06, -s * 0.2);
  ctx.lineTo(s * 0.12, -s * 0.02);
  ctx.closePath();
  ctx.fill();
  // Фюзеляж.
  const body = ctx.createLinearGradient(0, -s * 0.12, 0, s * 0.12);
  body.addColorStop(0, '#FFFFFF');
  body.addColorStop(0.6, '#DDE3E9');
  body.addColorStop(1, '#94A3B8');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, -s * 0.03);
  ctx.quadraticCurveTo(-s * 0.1, -s * 0.14, s * 0.32, -s * 0.09);
  ctx.quadraticCurveTo(s * 0.46, -s * 0.06, s * 0.47, 0);
  ctx.quadraticCurveTo(s * 0.46, s * 0.07, s * 0.3, s * 0.09);
  ctx.quadraticCurveTo(-s * 0.1, s * 0.1, -s * 0.5, s * 0.01);
  ctx.closePath();
  ctx.fill();
  // Смуга.
  ctx.fillStyle = '#C81E1E';
  ctx.fillRect(-s * 0.3, -s * 0.005, s * 0.62, s * 0.03);
  // Кабіна.
  ctx.fillStyle = '#1E3A5F';
  ctx.beginPath();
  ctx.moveTo(s * 0.12, -s * 0.1);
  ctx.quadraticCurveTo(s * 0.22, -s * 0.2, s * 0.32, -s * 0.09);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(s * 0.18, -s * 0.14, s * 0.04, s * 0.02);
  // Ближнє крило.
  ctx.fillStyle = '#E5E9EE';
  ctx.beginPath();
  ctx.moveTo(-s * 0.04, s * 0.03);
  ctx.lineTo(-s * 0.2, s * 0.26);
  ctx.lineTo(-s * 0.06, s * 0.26);
  ctx.lineTo(s * 0.16, s * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8391A0';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Пропелер: розмитий диск, що обертається.
  ctx.fillStyle = '#3B4450';
  ctx.beginPath();
  ctx.arc(s * 0.48, 0, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
  const blade = Math.abs(Math.sin(now / 25));
  ctx.fillStyle = flying ? 'rgba(60,70,80,0.35)' : 'rgba(60,70,80,0.9)';
  ctx.beginPath();
  ctx.ellipse(s * 0.49, 0, s * 0.02, s * (flying ? 0.2 : 0.18) * (flying ? 1 : blade * 0.3 + 0.7), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center' },
  screen: { borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: '#2A3340', backgroundColor: '#AEB8C2' },
  native: { alignItems: 'center', justifyContent: 'center' },
  nativeText: { color: '#FFFFFF', fontSize: 40, fontWeight: '900' },
  history: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', minHeight: 24 },
  hItem: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  hText: { fontWeight: '900', fontSize: 12 },
  modes: { flexDirection: 'row', width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderRadius: 14, padding: 4, gap: 4 },
  mode: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  modeOn: { backgroundColor: '#3A2F0B', borderColor: '#E9A70E' },
  modeText: { color: colors.muted, fontWeight: '800' },
  modeTextOn: { color: '#FFE27A' },
  dim: { opacity: 0.6 },
  goWrap: { width: '100%', maxWidth: 480 },
  go: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  goText: { color: '#3A2500', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  rules: { width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 4 },
  rulesTitle: { color: colors.text, fontWeight: '900', fontSize: 15, marginBottom: 2 },
  rule: { color: colors.muted, fontSize: 13 },
});
