import { createElement, useEffect, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { sfx } from '../audio/sound';
import { celebrate, winTier } from '../components/Celebration';
import { BetSelector, BigButton, Panel, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';
import { crackTiles, portalTile, tiles } from './digArt';
import { COLS, Cell, DigRun, FPS, ORE_NAME, ORE_VALUE, Ore, PICKS, SKY_ROWS, cellHp, isOre, rollPick, simulate } from './digEngine';

const PICK_IMG = [
  require('../../assets/arcade/pick_wood.png'),
  require('../../assets/arcade/pick_stone.png'),
  require('../../assets/arcade/pick_iron.png'),
  require('../../assets/arcade/pick_diamond.png'),
];

const WEB = Platform.OS === 'web';

/** Ціна купівлі кирки × ставка (підібрано симуляцією під той самий RTP ≈ 0.88). */
const BUY_PRICE = [0, 1.15, 2.05, 8];

const ORE_COLOR: Record<Ore, string> = { copper: '#E7A57E', ruby: '#FF5A70', gold: '#F4D03F', emerald: '#36D95E', diamond: '#4FE3E3' };

// У дуелі ставка віртуальна, очки = знайдене × 1000.
export const DUEL_MINE_BET = 1000;

type Img = HTMLImageElement;
let pickImgs: Img[] | null = null;
function loadPicks() {
  if (pickImgs || typeof document === 'undefined') return pickImgs;
  pickImgs = PICK_IMG.map((m) => {
    const im = document.createElement('img');
    const o = m as string | { uri?: string; default?: string };
    im.src = typeof o === 'string' ? o : (o.uri ?? o.default ?? '');
    return im;
  });
  return pickImgs;
}

interface Label {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  big?: boolean;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
interface Flash {
  x: number;
  y: number;
  life: number;
}

const STARS: [number, number][] = [
  [0.08, 0.2], [0.2, 0.55], [0.33, 0.15], [0.46, 0.7], [0.58, 0.3], [0.7, 0.62], [0.84, 0.18], [0.93, 0.5], [0.15, 0.85], [0.64, 0.9],
];

const kop = (v: number) => (Math.round(v) / 100).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Програє прорахований заїзд на канвасі. Нічого з React тут не перемальовується, поки йде гра. */
function playRun(
  cv: HTMLCanvasElement,
  run: DigRun,
  stake: number,
  W: number,
  H: number,
  ctl: { turbo: boolean; skip: boolean; alive: boolean },
  hooks: { onEvent: (value: number) => void; onDone: (value: number) => void },
) {
  const T = tiles();
  const cracks = crackTiles();
  const portal = portalTile();
  const picks = loadPicks();
  // Піксель-арту вистачає 1.5× щільності, а малювати так помітно легше.
  const dpr = Math.min(1.5, (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio ?? 1);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const ctx = cv.getContext('2d');
  if (!ctx || !T) return () => {};
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const size = W / COLS;
  const sky = ctx.createLinearGradient(0, 0, 0, SKY_ROWS * size);
  sky.addColorStop(0, '#0E1033');
  sky.addColorStop(1, '#2A3170');
  const cells: Cell[] = run.start.cells;
  const hp = [...run.start.hp];
  const broken = new Uint8Array(cells.length);
  const fused = new Map<number, number>();
  const labels: Label[] = [];
  const sparks: Spark[] = [];
  const flashes: Flash[] = [];
  const total = run.frames.length / 3;
  let next = 0;
  let value = 0;
  let tier = run.tier;
  let pickHp = PICKS[tier].hp;
  let camY = 0;
  let playF = 0;
  let last = -1;
  let lastHit = 0;
  let raf = 0;
  let ended = false;

  const variant = (i: number, n: number) => ((i * 2654435761) >>> 0) % n;
  const cx = (i: number) => (i % COLS) + 0.5;
  const cy = (i: number) => Math.floor(i / COLS) + 0.5;
  const burst = (i: number, color: string, n = 6) => {
    for (let k = 0; k < n; k++)
      sparks.push({ x: cx(i), y: cy(i), vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 5 - 1, life: 0.45 + Math.random() * 0.35, color });
    if (sparks.length > 160) sparks.splice(0, sparks.length - 160);
  };
  const colorOf = (c: Cell) => (isOre(c) ? ORE_COLOR[c] : c === 'grass' ? '#5DBB3F' : c === 'dirt' ? '#8B5A2B' : '#8A8A92');

  const apply = (silent: boolean) => {
    const f = Math.floor(playF);
    while (next < run.events.length && run.events[next].frame <= f) {
      const e = run.events[next++];
      tier = e.tier;
      pickHp = e.pickHp;
      value += e.value;
      if (e.hp !== undefined) hp[e.cell] = e.hp;
      for (const i of e.broken) {
        broken[i] = 1;
        fused.delete(i);
        if (!silent) burst(i, colorOf(cells[i]), e.kind === 'boom' ? 4 : 6);
      }
      if (e.kind === 'fuse') fused.set(e.cell, performance.now());
      if (!silent) {
        for (const [i, v] of e.paid) {
          if (labels.length > 50) labels.shift();
          labels.push({ x: cx(i), y: cy(i), text: kop(v * stake), color: ORE_COLOR[cells[i] as Ore], life: 1.3 });
        }
        const at = Math.min(f, total - 1);
        if (e.kind === 'boom') {
          flashes.push({ x: cx(e.cell), y: cy(e.cell), life: 0.35 });
          sfx('bomb', 0.7);
          haptic('win');
        } else if (e.kind === 'vein') {
          sfx(ORE_VALUE[cells[e.cell] as Ore] >= 0.3 ? 'win' : 'coin', 0.6);
        } else if (e.kind === 'upgrade') {
          labels.push({ x: run.frames[at * 3], y: run.frames[at * 3 + 1] - 1.2, text: 'ПОКРАЩЕННЯ!', color: '#3DDC4B', life: 1.6, big: true });
          sfx('bonus', 0.8);
        } else if (e.kind === 'repair') {
          labels.push({ x: run.frames[at * 3], y: run.frames[at * 3 + 1] - 1.2, text: '+HP', color: '#FF6B6B', life: 1.2, big: true });
          sfx('cash', 0.6);
        } else if (e.kind === 'slime') sfx('pop', 0.7);
        else if (e.kind === 'fuse') sfx('lock', 0.5);
        else if (e.kind === 'break') sfx('break', 0.45);
        else if (performance.now() - lastHit > 120) {
          lastHit = performance.now();
          sfx('hit', 0.4);
        }
      }
      if (e.value) hooks.onEvent(value);
    }
  };

  const draw = (now: number, dt: number) => {
    const f = Math.min(total - 1, Math.floor(playF));
    const px = run.frames[f * 3];
    const py = run.frames[f * 3 + 1];
    const deg = run.frames[f * 3 + 2];
    const target = Math.max(0, (SKY_ROWS + py) * size - H * 0.38);
    camY = ctl.skip ? target : camY + (target - camY) * Math.min(1, dt * 7);

    ctx.fillStyle = '#18181D';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(0, -Math.round(camY));
    const skyH = SKY_ROWS * size;
    if (camY < skyH) {
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, skyH);
      ctx.fillStyle = '#FFFFFF';
      for (const [sx, sy] of STARS) ctx.fillRect(sx * W, sy * skyH * 0.8, 2, 2);
      ctx.fillStyle = '#F4F1C9';
      ctx.fillRect(size * 0.7, size * 0.5, size * 0.6, size * 0.6);
    }
    const r0 = Math.max(0, Math.floor(camY / size) - SKY_ROWS);
    const r1 = Math.min(cells.length / COLS - 1, Math.ceil((camY + H) / size) - SKY_ROWS);
    const blink = Math.floor(now / 90) % 2 === 0;
    for (let row = r0; row <= r1; row++) {
      const y = (SKY_ROWS + row) * size;
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col;
        const x = col * size;
        if (broken[i]) {
          const t = T.cave;
          ctx.drawImage(t[variant(i, t.length)], x, y, size + 0.5, size + 0.5);
          continue;
        }
        const c = cells[i];
        const t = T[c];
        ctx.drawImage(t[variant(i, t.length)], x, y, size + 0.5, size + 0.5);
        const max = cellHp(c);
        if (hp[i] < max && Number.isFinite(max)) {
          const stage = Math.min(2, Math.floor((1 - hp[i] / max) * 3));
          ctx.drawImage(cracks[stage], x, y, size, size);
        }
        if (fused.has(i) && blink) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(x, y, size, size);
        }
      }
    }
    // Портал на поверхні, з якого вилітає кирка.
    const hold = run.hold;
    if (portal && playF < hold + FPS * 0.6) {
      const a = playF < hold ? 1 : 1 - (playF - hold) / (FPS * 0.6);
      ctx.globalAlpha = Math.max(0, a);
      const ps = size * 2.2;
      const ox = run.frames[0] * size;
      const oy = (SKY_ROWS + run.frames[1]) * size;
      ctx.drawImage(portal, ox - ps / 2, oy - ps / 2, ps, ps);
      ctx.globalAlpha = 1;
    }
    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, Math.min(1, s.life * 2));
      ctx.fillStyle = s.color;
      const q = Math.max(2, size * 0.09);
      ctx.fillRect(s.x * size - q / 2, (SKY_ROWS + s.y) * size - q / 2, q, q);
    }
    for (const fl of flashes) {
      const rr = size * (2.6 - fl.life * 3);
      const fx = fl.x * size;
      const fy = (SKY_ROWS + fl.y) * size;
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, rr);
      g.addColorStop(0, `rgba(255,240,200,${Math.min(1, fl.life * 2)})`);
      g.addColorStop(1, 'rgba(255,150,50,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(fx - rr, fy - rr, rr * 2, rr * 2);
    }
    ctx.globalAlpha = 1;
    // Кирка.
    const kx = px * size;
    const ky = (SKY_ROWS + py) * size;
    const im = picks?.[tier];
    if (im && im.complete && im.naturalWidth) {
      ctx.save();
      ctx.translate(kx, ky);
      ctx.rotate((deg * Math.PI) / 180);
      const s = size * 1.3;
      ctx.drawImage(im, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const hpText = `❤ ${pickHp}/${PICKS[tier].hp}`;
    ctx.font = '900 14px system-ui, -apple-system, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(hpText, kx, ky - size * 0.85);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(hpText, kx, ky - size * 0.85);
    for (const l of labels) {
      ctx.globalAlpha = Math.max(0, Math.min(1, l.life * 1.5));
      ctx.font = l.big ? '900 18px system-ui, -apple-system, sans-serif' : '800 12px system-ui, -apple-system, sans-serif';
      const lx = l.x * size;
      const ly = (SKY_ROWS + l.y) * size;
      ctx.lineWidth = 3;
      ctx.strokeText(l.text, lx, ly);
      ctx.fillStyle = l.big ? l.color : '#FFFFFF';
      ctx.fillText(l.text, lx, ly);
      if (!l.big) {
        ctx.fillStyle = l.color;
        ctx.fillRect(lx - ctx.measureText(l.text).width / 2 - 8, ly - 3, 6, 6);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Плашка «Виграш» внизу.
    const bw = 130;
    const bh = 50;
    const bx = W / 2 - bw / 2;
    const by = H - bh - 28;
    ctx.fillStyle = 'rgba(10,10,14,0.78)';
    ctx.beginPath();
    const rad = 12;
    ctx.moveTo(bx + rad, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, rad);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, rad);
    ctx.arcTo(bx, by + bh, bx, by, rad);
    ctx.arcTo(bx, by, bx + bw, by, rad);
    ctx.fill();
    ctx.fillStyle = '#A9A9B8';
    ctx.font = '800 11px system-ui, -apple-system, sans-serif';
    ctx.fillText('ВИГРАШ', W / 2, by + 15);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 19px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${kop(value * stake)} ₴`, W / 2, by + 34);
  };

  const step = (now: number) => {
    if (!ctl.alive) return;
    // Перший кадр rAF може мати мітку часу, меншу за performance.now() на старті.
    const dt = last < 0 ? 0 : Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (ctl.skip) {
      playF = total - 1;
      apply(true);
    } else {
      playF = Math.min(total - 1, playF + dt * FPS * (ctl.turbo ? 2.5 : 1));
      apply(false);
    }
    for (let k = sparks.length - 1; k >= 0; k--) {
      const s = sparks[k];
      s.vy += 18 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) sparks.splice(k, 1);
    }
    for (let k = labels.length - 1; k >= 0; k--) {
      labels[k].life -= dt;
      labels[k].y -= dt * 0.5;
      if (labels[k].life <= 0) labels.splice(k, 1);
    }
    for (let k = flashes.length - 1; k >= 0; k--) {
      flashes[k].life -= dt;
      if (flashes[k].life <= 0) flashes.splice(k, 1);
    }
    draw(now, dt);
    if (playF >= total - 1 && next >= run.events.length && !ended) {
      ended = true;
      setTimeout(() => ctl.alive && hooks.onDone(run.value), 700);
    }
    // Після кінця ще трохи малюємо, щоб уламки й цифри догоріли.
    if (!ended || sparks.length || labels.length || flashes.length) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

export function MineGame({
  game,
  duel,
  onProgress,
  autoStart,
}: {
  game: GameInfo;
  duel?: (points: number) => void;
  onProgress?: (points: number) => void;
  autoStart?: boolean;
}) {
  const wallet = useWallet();
  const { width, height } = useWindowDimensions();
  const [bet, setBet] = useState(100);
  const [phase, setPhase] = useState<'idle' | 'run' | 'done'>('idle');
  const [turbo, setTurbo] = useState(false);
  const [summary, setSummary] = useState<{ paid: number; stake: number; won: number; depth: number; tier: number } | null>(null);
  const [message, setMessage] = useState({ text: 'Кирка падає в шахту без дна й ламає блоки, поки має HP', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cur = useRef<{ run: DigRun; stake: number; paid: number } | null>(null);
  const ctl = useRef({ turbo: false, skip: false, alive: true });

  useEffect(
    () => () => {
      ctl.current.alive = false;
    },
    [],
  );

  const finish = async (value: number) => {
    const c = cur.current;
    if (!c) return;
    const won = Math.round(value * c.stake);
    if (duel) {
      setPhase('idle');
      duel(won);
      return;
    }
    if (won > 0) {
      wallet.win(game.id, won);
      if (winTier(won, c.paid)) await celebrate({ kind: 'win', amount: won, bet: c.paid });
      else sfx('cash');
      setMessage({ text: `Заїзд завершено: +${formatCoins(won)}`, tone: 'win' });
    } else setMessage({ text: 'Кирка зламалась. Спробуй ще!', tone: 'lose' });
    if (!ctl.current.alive) return;
    setSummary({ paid: c.paid, stake: c.stake, won, depth: c.run.depth, tier: c.run.tier });
    setPhase('done');
  };

  const start = (buy?: number) => {
    const paid = buy ? Math.round(bet * BUY_PRICE[buy]) : bet;
    if (!duel && !wallet.bet(game.id, 'fast', paid)) {
      setMessage({ text: 'Недостатньо коштів', tone: 'lose' });
      return;
    }
    const tier = buy ?? rollPick();
    const run = simulate(tier);
    const stake = duel ? DUEL_MINE_BET : bet;
    cur.current = { run, stake, paid };
    ctl.current.skip = false;
    ctl.current.turbo = turbo;
    sfx('click', 0.5);
    setSummary(null);
    if (!WEB) {
      // Без канвасу (нативний застосунок) одразу показуємо підсумок.
      finish(run.value);
      return;
    }
    setPhase('run');
  };

  useEffect(() => {
    if (phase !== 'run' || !cur.current) return;
    const { run, stake } = cur.current;
    let stop = () => {};
    let wait = 0;
    // Вікно на весь екран з'являється не одразу, тож чекаємо, поки канвас буде в DOM.
    const begin = () => {
      const cv = canvasRef.current;
      if (!cv) {
        wait = requestAnimationFrame(begin);
        return;
      }
      stop = playRun(cv, run, stake, width, height, ctl.current, {
        onEvent: (v) => onProgress?.(Math.round(v * stake)),
        onDone: (v) => finish(v),
      });
    };
    begin();
    return () => {
      cancelAnimationFrame(wait);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (autoStart) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTurbo = () => {
    ctl.current.turbo = !ctl.current.turbo;
    setTurbo(ctl.current.turbo);
  };
  const closeSummary = () => {
    setSummary(null);
    setPhase('idle');
  };

  const totalWeight = PICKS.reduce((s, p) => s + p.weight, 0);

  return (
    <View style={styles.root}>
      <ResultLine text={message.text} tone={message.tone} />
      {duel ? (
        <BigButton label="ПОЧАТИ ДУЕЛЬ" onPress={() => start()} />
      ) : (
        <>
          <BetSelector value={bet} onChange={setBet} />
          <BigButton label={`⛏️ КОПАТИ · ${formatCoins(bet)}`} onPress={() => start()} />
          <View style={styles.row}>
            <Pressable onPress={toggleTurbo} style={[styles.chip, turbo && styles.chipOn]}>
              <Text style={[styles.chipText, turbo && styles.chipTextOn]}>⚡ Турбо {turbo ? 'увімк.' : 'вимк.'}</Text>
            </Pressable>
          </View>
          <Panel style={styles.gap}>
            <Text style={styles.title}>Купити кирку</Text>
            <Text style={styles.small}>Заїзд одразу почнеться з цією киркою. Виплати рахуються від ставки {formatCoins(bet)}.</Text>
            {[1, 2, 3].map((t) => (
              <Pressable key={t} onPress={() => start(t)} style={styles.buyRow}>
                <Image source={PICK_IMG[t]} style={styles.buyImg} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.buyName}>{PICKS[t].name}</Text>
                  <Text style={styles.small}>
                    ❤ {PICKS[t].hp} HP · копає ×{PICKS[t].power}
                  </Text>
                </View>
                <View style={styles.price}>
                  <Text style={styles.priceText}>{formatCoins(Math.round(bet * BUY_PRICE[t]))}</Text>
                </View>
              </Pressable>
            ))}
          </Panel>
          <Panel style={styles.gap}>
            <Text style={styles.title}>Як це працює</Text>
            <Text style={styles.small}>
              Кожен заїзд дає випадкову кирку. Вона падає в шахту без дна й ламає блоки, поки не закінчиться HP. Удар по руді розбиває
              всю жилу, і кожен її блок приносить виплату. Чим глибше, тим багатша порода.
            </Text>
            <Text style={styles.sub}>Руда за блок</Text>
            {(Object.keys(ORE_VALUE) as Ore[]).map((o) => (
              <View key={o} style={styles.oreRow}>
                <View style={[styles.oreDot, { backgroundColor: ORE_COLOR[o] }]} />
                <Text style={styles.oreName}>{ORE_NAME[o]}</Text>
                <Text style={styles.small}>×{ORE_VALUE[o]}</Text>
                <Text style={styles.oreWin}>{formatCoins(bet * ORE_VALUE[o])}</Text>
              </View>
            ))}
            <Text style={styles.sub}>Особливі блоки</Text>
            <Text style={styles.small}>🧨 Динаміт: вибухає після короткого ґнота й розбиває все навколо</Text>
            <Text style={styles.small}>🟩 Слиз: підкидає кирку вгору, і вона з розгону проламує кілька блоків підряд</Text>
            <Text style={styles.small}>⬆️ Ящик покращення: кирка стає кращою на рівень і відновлює HP</Text>
            <Text style={styles.small}>➕ Ящик ремонту: відновлює 40% HP кирки</Text>
            <Text style={styles.small}>⬛ Обсидіан: дуже міцний, але ламається від кирки й динаміту</Text>
            <Text style={styles.sub}>Стартова кирка</Text>
            {PICKS.map((p, i) => (
              <View key={p.name} style={styles.oreRow}>
                <Image source={PICK_IMG[i]} style={{ width: 22, height: 22 }} />
                <Text style={styles.oreName}>{p.name}</Text>
                <Text style={styles.small}>{p.hp} HP</Text>
                <Text style={styles.oreWin}>{((p.weight / totalWeight) * 100).toFixed(1)}%</Text>
              </View>
            ))}
          </Panel>
        </>
      )}
      <Modal visible={phase !== 'idle'} transparent={false} animationType="none" onRequestClose={() => {
        ctl.current.skip = true;
      }}>
        <View style={styles.full}>
          {WEB && createElement('canvas', { ref: canvasRef, style: { width, height, display: 'block', touchAction: 'none' } })}
          {phase === 'run' && (
            <View style={styles.topBar}>
              <Pressable onPress={toggleTurbo} style={[styles.topBtn, turbo && styles.chipOn]}>
                <Text style={[styles.topText, turbo && styles.chipTextOn]}>⚡</Text>
              </Pressable>
              <Pressable onPress={() => (ctl.current.skip = true)} style={styles.topBtn} testID="mine-skip">
                <Text style={styles.topText}>⏩</Text>
              </Pressable>
            </View>
          )}
          {phase === 'done' && summary && (
            <Pressable style={styles.sumWrap} onPress={closeSummary} testID="mine-summary">
              <View style={styles.sumCard}>
                <Text style={styles.sumTitle}>{summary.won > 0 ? `ВИГРАШ ${formatCoins(summary.won)}` : '💥 Кирка зламалась'}</Text>
                <View style={styles.sumRow}>
                  <Text style={styles.sumLabel}>Ставка</Text>
                  <Text style={styles.sumValue}>{formatCoins(summary.paid)}</Text>
                </View>
                <View style={styles.sumRow}>
                  <Text style={styles.sumLabel}>Виграш</Text>
                  <Text style={[styles.sumValue, { color: summary.won > 0 ? colors.gold : colors.muted }]}>
                    {summary.won > 0 ? `+${formatCoins(summary.won)}` : formatCoins(0)}
                  </Text>
                </View>
                <View style={styles.sumRow}>
                  <Text style={styles.sumLabel}>Множник</Text>
                  <Text style={styles.sumValue}>×{(summary.won / summary.paid).toFixed(2)}</Text>
                </View>
                <View style={styles.sumRow}>
                  <Text style={styles.sumLabel}>Кирка · глибина</Text>
                  <Text style={styles.sumValue}>
                    {PICKS[summary.tier].name.split(' ')[0]} · {summary.depth + 1} м
                  </Text>
                </View>
                <Text style={styles.sumHint}>Натисни, щоб продовжити</Text>
              </View>
            </Pressable>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  gap: { gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  chipTextOn: { color: '#1A1200' },
  title: { color: colors.gold, fontWeight: '900', fontSize: 16 },
  sub: { color: colors.gold, fontWeight: '900', fontSize: 13, marginTop: 8 },
  small: { color: colors.muted, fontSize: 13 },
  buyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  buyImg: { width: 34, height: 34 },
  buyName: { color: colors.text, fontWeight: '800' },
  price: { backgroundColor: colors.gold, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  priceText: { color: '#1A1200', fontWeight: '900' },
  oreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  oreDot: { width: 14, height: 14, borderRadius: 3 },
  oreName: { color: colors.text, fontWeight: '700', flex: 1 },
  oreWin: { color: colors.gold, fontWeight: '900', minWidth: 70, textAlign: 'right' },
  full: { flex: 1, backgroundColor: '#18181D' },
  topBar: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8 },
  topBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  topText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  sumWrap: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  sumCard: { width: '100%', maxWidth: 330, gap: 10, padding: 18, borderRadius: 18, backgroundColor: '#1A1530', borderWidth: 2, borderColor: colors.gold },
  sumTitle: { color: colors.gold, fontWeight: '900', fontSize: 21, textAlign: 'center', marginBottom: 4 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumLabel: { color: colors.muted, fontWeight: '700', fontSize: 15 },
  sumValue: { color: colors.text, fontWeight: '900', fontSize: 16 },
  sumHint: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 6 },
});
