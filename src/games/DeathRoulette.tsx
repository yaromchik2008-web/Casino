import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { sfx } from '../audio/sound';
import { celebrate } from '../components/Celebration';
import { BetSelector, BigButton, Panel, ResultLine, haptic } from '../components/ui';
import { Duel, RouletteTable, claimTransfers2, friendlyError, myProfile, rouletteAct, rouletteClaim, rouletteGet, rouletteOpen } from '../state/friends';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

// «Смертельна рулетка»: у барабані 6 камор і 1 патрон. Монетка вирішує, у кого револьвер першим.
// Вистрілив у суперника й влучив — забираєш банк; порожньо — револьвер переходить до нього.
// «В себе»: порожньо — +10 ₴ і револьвер лишається в тебе; патрон — програв.

export const SELF_BONUS = 1000;
const CHAMBERS = 6;
const COIN_MS = 1600;
const SHOT_MS = 900;
const BOT_MS = 1300;
const POLL_MS = 1200;
const CLAIM_MS = 45_000;

type Phase = 'idle' | 'coin' | 'aim' | 'shooting' | 'over';

/** Сцена: суперник зверху, ти знизу, револьвер дивиться на того, в кого цілиться. */
function Scene({
  opponent,
  holder,
  shots,
  flash,
  dead,
}: {
  opponent: string;
  holder: 'me' | 'them' | null;
  shots: number;
  flash: 'bang' | 'click' | null;
  dead: 'me' | 'them' | null;
}) {
  // Хто тримає револьвер, той цілиться в іншого (або в себе під час пострілу «в себе»).
  const aimAt = holder === 'me' ? 'them' : holder === 'them' ? 'me' : null;
  return (
    <View style={styles.scene}>
      <View style={styles.person}>
        <Text style={[styles.silhouette, dead === 'them' && styles.dead]}>{dead === 'them' ? '💀' : '👤'}</Text>
        <Text style={styles.personName} numberOfLines={1}>
          {opponent}
        </Text>
      </View>
      <View style={styles.gunRow}>
        {aimAt === 'them' && <Text style={styles.arrow}>⬆</Text>}
        <Text style={styles.gun}>🔫</Text>
        {aimAt === 'me' && <Text style={styles.arrow}>⬇</Text>}
        {flash && <Text style={styles.flash}>{flash === 'bang' ? '💥 БАХ!' : '…клац'}</Text>}
      </View>
      {aimAt && <Text style={styles.aimText}>{aimAt === 'them' ? `цілишся в ${opponent}` : 'ціляться в тебе'}</Text>}
      <View style={styles.drum}>
        {Array.from({ length: CHAMBERS }, (_, i) => (
          <View key={i} style={[styles.chamber, i < shots && styles.chamberUsed]} />
        ))}
      </View>
      <View style={styles.person}>
        <Text style={[styles.silhouette, styles.me, dead === 'me' && styles.dead]}>{dead === 'me' ? '💀' : '🧍'}</Text>
        <Text style={styles.personName}>Ти</Text>
      </View>
    </View>
  );
}

/** Монетка WIN / LOSE: обертається і показує, хто стріляє першим. */
function Coin({ win, spinning }: { win: boolean; spinning: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!spinning) return;
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: COIN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [spinning, a]);
  const flip = a.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * 6 + (win ? 0 : 180)}deg`] });
  const lift = a.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -50, 0] });
  return (
    <Animated.View style={[styles.coin, { transform: [{ translateY: lift }, { rotateX: flip }] }]}>
      <Text style={styles.coinText}>{spinning ? (win ? 'WIN' : 'LOSE') : win ? 'WIN' : 'LOSE'}</Text>
    </Animated.View>
  );
}

/** Гра з ботом. */
export function DeathRouletteGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(5000);
  const [phase, setPhase] = useState<Phase>('idle');
  const [holder, setHolder] = useState<'me' | 'them' | null>(null);
  const [coinWin, setCoinWin] = useState(true);
  const [shots, setShots] = useState(0);
  const [flash, setFlash] = useState<'bang' | 'click' | null>(null);
  const [dead, setDead] = useState<'me' | 'them' | null>(null);
  const [bonus, setBonus] = useState(0);
  const [message, setMessage] = useState({ text: 'Став і кидай монетку', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const round = useRef({ bullet: 0, shots: 0, stake: 0 });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const start = () => {
    if (phase !== 'idle' && phase !== 'over') return;
    if (!wallet.bet(game.id, 'fast', bet)) return setMessage({ text: 'Недостатньо коштів', tone: 'lose' });
    round.current = { bullet: Math.floor(Math.random() * CHAMBERS), shots: 0, stake: bet };
    const first = Math.random() < 0.5;
    setCoinWin(first);
    setShots(0);
    setFlash(null);
    setDead(null);
    setBonus(0);
    setHolder(null);
    setPhase('coin');
    setMessage({ text: 'Монетка в повітрі…', tone: 'neutral' });
    sfx('spin', 0.5);
    later(() => {
      setHolder(first ? 'me' : 'them');
      setPhase('aim');
      sfx(first ? 'win' : 'stop');
      setMessage({ text: first ? 'WIN! Револьвер у тебе' : 'LOSE. Револьвер у бота', tone: first ? 'win' : 'lose' });
      if (!first) later(botTurn, BOT_MS);
    }, COIN_MS + 200);
  };

  const finish = (iWon: boolean) => {
    setPhase('over');
    setHolder(null);
    const pot = round.current.stake * 2;
    if (iWon) {
      wallet.credit(pot);
      wallet.track('rouletteWins');
      celebrate({ kind: 'total', title: 'ТИ ВИЖИВ!', amount: pot, emoji: '🔫' });
      setMessage({ text: `Перемога! +${formatCoins(pot)}`, tone: 'win' });
    } else setMessage({ text: `Програв ${formatCoins(round.current.stake)}`, tone: 'lose' });
  };

  // Один постріл: who — хто тримає, self — у себе.
  const pull = (who: 'me' | 'them', self: boolean) => {
    setPhase('shooting');
    setFlash(null);
    sfx('lock', 0.6);
    haptic();
    later(() => {
      const r = round.current;
      const fire = r.shots === r.bullet;
      r.shots++;
      setShots(r.shots);
      if (fire) {
        setFlash('bang');
        sfx('bomb');
        haptic('win');
        const victim = self ? who : who === 'me' ? 'them' : 'me';
        setDead(victim);
        return later(() => finish(victim === 'them'), 700);
      }
      setFlash('click');
      if (self) {
        // Порожньо в себе: +10 ₴ сміливцю, револьвер лишається.
        if (who === 'me') {
          wallet.credit(SELF_BONUS);
          setBonus((b) => b + SELF_BONUS);
          setMessage({ text: `Порожньо! +${formatCoins(SELF_BONUS)} за сміливість`, tone: 'win' });
          setPhase('aim');
        } else {
          setMessage({ text: 'Бот вистрілив у себе… порожньо', tone: 'neutral' });
          later(botTurn, BOT_MS);
        }
        return;
      }
      const next = who === 'me' ? 'them' : 'me';
      setHolder(next);
      setPhase('aim');
      if (next === 'them') {
        setMessage({ text: 'Порожньо. Тепер револьвер у бота і дивиться на тебе', tone: 'lose' });
        later(botTurn, BOT_MS);
      } else setMessage({ text: 'Бот промахнувся! Твій хід', tone: 'win' });
    }, SHOT_MS);
  };

  // Бот обирає навмання.
  const botTurn = () => {
    const self = Math.random() < 0.5;
    setMessage({ text: self ? 'Бот приставляє револьвер до себе…' : 'Бот цілиться в тебе…', tone: 'neutral' });
    later(() => pull('them', self), 700);
  };

  const myTurn = phase === 'aim' && holder === 'me';
  return (
    <View style={styles.root}>
      <Panel style={styles.table}>
        <Scene opponent="🤖 Бот" holder={holder} shots={shots} flash={flash} dead={dead} />
        {phase === 'coin' && <Coin win={coinWin} spinning />}
      </Panel>
      <ResultLine text={message.text} tone={message.tone} />
      {bonus > 0 && <Text style={styles.note}>Бонус за сміливість: +{formatCoins(bonus)}</Text>}
      {myTurn ? (
        <View style={styles.choice}>
          <BigButton label="🎯 ВИСТРІЛИТИ" color={colors.red} onPress={() => pull('me', false)} />
          <BigButton label="😰 В СЕБЕ" color="#6B21A8" onPress={() => pull('me', true)} />
        </View>
      ) : phase === 'idle' || phase === 'over' ? (
        <>
          <BetSelector value={bet} onChange={setBet} />
          <BigButton label="🪙 КИНУТИ МОНЕТКУ" onPress={start} color={colors.gold} />
        </>
      ) : null}
      <Rules />
    </View>
  );
}

function Rules() {
  return (
    <Panel style={styles.rules}>
      <Text style={styles.rulesTitle}>Правила</Text>
      <Text style={styles.rule}>Обидва ставите однаково. Монетка WIN / LOSE вирішує, у кого револьвер першим.</Text>
      <Text style={styles.rule}>🎯 Вистрілити: патрон — суперник падає, ти забираєш банк. Порожньо — револьвер у суперника, цілиться в тебе.</Text>
      <Text style={styles.rule}>😰 В себе: порожньо — +10 ₴ і револьвер лишається в тебе. Патрон — ти програв.</Text>
      <Text style={styles.rule}>У барабані 6 камор і 1 патрон, тож з кожним клацанням ризик більший.</Text>
    </Panel>
  );
}

/** Дуель з другом: стіл на сервері, монетку й постріли рахує сервер. */
export function RouletteDuel({ duel, opponentName, onClose }: { duel: Duel; opponentName: string; onClose: () => void }) {
  const wallet = useWallet();
  const me = myProfile();
  const [table, setTable] = useState<RouletteTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coinDone, setCoinDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<'bang' | 'click' | null>(null);
  const [now, setNow] = useState(Date.now());
  const prev = useRef<RouletteTable | null>(null);
  const paid = useRef(false);

  useEffect(() => {
    let stop = false;
    rouletteOpen(duel.id)
      .then((t) => {
        if (stop) return;
        setTable(t);
        sfx('spin', 0.5);
        setTimeout(() => !stop && setCoinDone(true), t.shots > 0 || t.status !== 'playing' ? 0 : COIN_MS + 200);
      })
      .catch((e) => setError(friendlyError(e)));
    const poll = setInterval(() => {
      setNow(Date.now());
      const id = prev.current?.id;
      if (id) rouletteGet(id).then((t) => !stop && t && setTable(t), () => {});
    }, POLL_MS);
    return () => {
      stop = true;
      clearInterval(poll);
    };
  }, [duel.id]);

  // Звук і спалах на кожен новий постріл, виплата в кінці.
  useEffect(() => {
    const p = prev.current;
    prev.current = table;
    if (!table || !p || table.version === p.version) return;
    if (table.last === 'shoot_fire' || table.last === 'self_fire') {
      setFlash('bang');
      sfx('bomb');
      haptic('win');
    } else if (table.last === 'shoot' || table.last === 'self') {
      setFlash('click');
      sfx('lock', 0.6);
    }
  }, [table]);

  const seat = table && me ? (table.a === me.id ? 0 : 1) : 0;
  useEffect(() => {
    if (!table || table.status !== 'finished' || paid.current) return;
    paid.current = true;
    // Виграш приходить переказом від сервера; старим версіям стану зараховуємо тут.
    claimTransfers2()
      .then((g) => g.credit > 0 && wallet.credit(g.credit))
      .catch(() => {});
    if (table.winner === seat) celebrate({ kind: 'total', title: 'ТИ ВИЖИВ!', amount: table.stake * 2, emoji: '🔫' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table?.status]);

  const act = async (self: boolean) => {
    if (!table || busy) return;
    setBusy(true);
    setFlash(null);
    sfx('lock', 0.6);
    try {
      const t = await rouletteAct(table.id, table.version, self);
      // Невелика пауза, щоб клацання відчувалось.
      await new Promise((r) => setTimeout(r, 500));
      setTable(t);
    } catch (e) {
      setError(friendlyError(e));
      rouletteGet(table.id).then((t) => t && setTable(t), () => {});
    }
    setBusy(false);
  };

  const claim = async () => {
    if (!table) return;
    try {
      setTable(await rouletteClaim(table.id));
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const playing = table?.status === 'playing';
  const myTurn = !!table && playing && coinDone && table.holder === seat;
  const holder = !table || !coinDone || !playing ? null : table.holder === seat ? 'me' : 'them';
  const dead =
    table?.status === 'finished' && table.last !== 'timeout' ? (table.winner === seat ? 'them' : 'me') : null;
  const idle = table ? now - new Date(table.updated_at).getTime() : 0;
  const myBonus = table ? (seat === 0 ? table.bonus_a : table.bonus_b) : 0;
  const text = !table
    ? 'Відкриваю стіл…'
    : !coinDone
      ? 'Монетка в повітрі…'
      : table.status === 'finished'
        ? table.winner === seat
          ? `Перемога! +${formatCoins(table.stake * 2)}${table.last === 'timeout' ? ' (суперник не встиг)' : ''}`
          : `Поразка. ${opponentName} забирає банк`
        : table.shots === 0
          ? table.coin === seat
            ? 'WIN! Револьвер у тебе'
            : `LOSE. Револьвер у ${opponentName}`
          : table.last === 'self'
            ? table.holder === seat
              ? `Порожньо! +${formatCoins(SELF_BONUS)}. Знову твій хід`
              : `${opponentName} вистрілив у себе… порожньо`
            : myTurn
              ? `${opponentName} промахнувся! Твій хід`
              : `Порожньо. Револьвер у ${opponentName}`;

  return (
    <View style={styles.flex}>
      <View style={styles.bar}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.back}>‹ Друзі</Text>
        </Pressable>
        <Text style={styles.barTitle} numberOfLines={1}>
          🔫 {opponentName} · {formatCoins(duel.stake)}
        </Text>
      </View>
      <View style={styles.content}>
        <Panel style={styles.table}>
          <Scene opponent={opponentName} holder={holder} shots={table?.shots ?? 0} flash={flash} dead={dead} />
          {table && !coinDone && <Coin win={table.coin === seat} spinning />}
        </Panel>
        <ResultLine text={error ?? text} tone={table?.status === 'finished' ? (table.winner === seat ? 'win' : 'lose') : 'neutral'} />
        {myBonus > 0 && <Text style={styles.note}>Бонус за сміливість: +{formatCoins(myBonus)}</Text>}
        {myTurn ? (
          <View style={styles.choice}>
            <BigButton label="🎯 ВИСТРІЛИТИ" color={colors.red} disabled={busy} onPress={() => act(false)} />
            <BigButton label="😰 В СЕБЕ" color="#6B21A8" disabled={busy} onPress={() => act(true)} />
          </View>
        ) : playing && coinDone && idle > CLAIM_MS ? (
          <BigButton label="⏱ СУПЕРНИК МОВЧИТЬ: ЗАБРАТИ ПЕРЕМОГУ" onPress={claim} />
        ) : table?.status === 'finished' ? (
          <BigButton label="ДО ДРУЗІВ" onPress={onClose} />
        ) : null}
        <Rules />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center', width: '100%' },
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { color: colors.gold, fontSize: 16, fontWeight: '800' },
  barTitle: { color: colors.text, fontSize: 16, fontWeight: '900', flex: 1 },
  table: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: '#1A0B0B', borderColor: '#7F1D1D', borderWidth: 2, paddingVertical: 18 },
  scene: { alignItems: 'center', gap: 10, width: '100%' },
  person: { alignItems: 'center' },
  silhouette: { fontSize: 64, opacity: 0.9 },
  me: { fontSize: 56 },
  dead: { opacity: 1 },
  personName: { color: colors.muted, fontWeight: '800', fontSize: 12, maxWidth: 200 },
  gunRow: { height: 110, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: colors.red, fontSize: 26, fontWeight: '900', lineHeight: 28 },
  aimText: { color: colors.red, fontSize: 12, fontWeight: '800' },
  gun: { fontSize: 52 },
  flash: { position: 'absolute', right: -90, color: colors.gold, fontSize: 20, fontWeight: '900' },
  drum: { flexDirection: 'row', gap: 6 },
  chamber: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#D4A72C', borderWidth: 2, borderColor: '#FDE68A' },
  chamberUsed: { backgroundColor: 'transparent', borderColor: '#52525B' },
  coin: {
    position: 'absolute',
    top: '40%',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.gold,
    borderWidth: 4,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinText: { color: '#3B2700', fontSize: 22, fontWeight: '900' },
  choice: { gap: 8, alignSelf: 'stretch' },
  half: { flex: 1 },
  note: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  rules: { alignSelf: 'stretch', gap: 4 },
  rulesTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  rule: { color: colors.muted, fontSize: 12 },
});
