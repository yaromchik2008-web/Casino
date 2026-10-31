import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { playMusic, sfx } from '../audio/sound';
import { Reel } from '../components/Reel';
import { BigButton, Chip, Panel, ResultLine, haptic, parseMoney } from '../components/ui';
import { useNow } from '../components/useNow';
import { GameInfo, findGame } from '../games/catalog';
import { MineGame } from '../games/MineGame';
import { OnlineDurak } from '../games/DurakGame';
import { RouletteDuel } from '../games/DeathRoulette';
import { Grid, evaluateGrid, randomSymbol, spinGrid } from '../games/slotEngine';
import {
  Duel,
  Profile,
  cancelDuel,
  claimTransfers2,
  createDuel,
  friendlyError,
  myProfile,
  respondDuel,
  sendMessage,
  submitDuelScore,
  listDuels,
} from '../state/friends';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';

// Ігри для дуелі: обидва грають однаковий раунд без ставок, рахують очки.
export const DUEL_GAMES: { id: string; rounds: string }[] = [
  { id: 'golden-karas', rounds: '5 обертів' },
  { id: 'durak', rounds: 'Одна партія на 36 карт' },
  { id: 'number', rounds: 'Одне число від 1 до 99' },
  { id: 'roulette', rounds: 'Револьвер з одним патроном' },
];
const ROULETTE_DUEL = 'roulette';
// «Число» не є грою в лобі, тому має свою назву.
const NUMBER_DUEL = 'number';
// Слоти в дуелі: 5 обертів, шахта: один заїзд.
const DUEL_SPINS = 5;
const DUEL_SPIN_BET = 100;
const STAKES = [1000, 5000, 10000, 50000];
const STARTED_KEY = 'freecasino:duel-started';
export const INVITE_MS = 60_000;
export const ROUND_MS = 60_000;

function gameTitle(id: string) {
  if (id === NUMBER_DUEL) return '🎲 Число 1–99';
  if (id === ROULETTE_DUEL) return '🔫 Смертельна рулетка';
  const g = findGame(id);
  return g ? `${g.emoji} ${g.title}` : id;
}

export function DuelSetup({ friend, onDone }: { friend: Profile; onDone: (error?: string) => void }) {
  const wallet = useWallet();
  const [game, setGame] = useState(DUEL_GAMES[0].id);
  const [stake, setStake] = useState(STAKES[1]);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const amount = custom ? parseMoney(custom) : stake;

  const send = async () => {
    if (!amount || amount < 100 || amount > 1000000) return onDone('Ставка від 1 до 10 000 ₴');
    if (!wallet.spend(amount)) return onDone('Недостатньо коштів');
    setBusy(true);
    try {
      await createDuel(friend.id, game, amount);
      await sendMessage(friend.id, `⚔️ Викликаю на дуель: ${gameTitle(game)}, ставка ${formatCoins(amount)}. Прийми у вкладці «Друзі»!`);
      sfx('bonus');
      wallet.notify(`Виклик надіслано. Ставку ${formatCoins(amount)} знято`);
      onDone();
    } catch (e) {
      wallet.credit(amount);
      onDone(friendlyError(e));
    }
    setBusy(false);
  };

  return (
    <Panel style={styles.setup}>
      <Text style={styles.title}>⚔️ Дуель з {friend.name}</Text>
      <Text style={styles.muted}>Обидва ставите однаково. Хто набере більше очок, забирає все. Нічия повертає обом ставку.</Text>
      <Text style={styles.muted}>
        {game === ROULETTE_DUEL
          ? 'Смертельна рулетка: револьвер з одним патроном, стріляєте по черзі один в одного. Хто влучив, той забирає банк.'
          : game === 'durak' ? 'Дурак: граєте партію одне проти одного, хто не дурак, той виграв.' : game === NUMBER_DUEL ? 'Число: у кожного один кидок від 1 до 99, у кого більше, той виграв.' : 'Карась: по 5 обертів, хто набере більше очок.'}
      </Text>
      <View style={styles.wrap}>
        {DUEL_GAMES.map((g) => (
          <Chip key={g.id} label={gameTitle(g.id)} active={game === g.id} onPress={() => setGame(g.id)} />
        ))}
      </View>
      <View style={styles.wrap}>
        {STAKES.map((s) => (
          <Chip key={s} label={formatCoins(s)} active={!custom && stake === s} onPress={() => (setStake(s), setCustom(''))} />
        ))}
        <TextInput
          value={custom}
          onChangeText={setCustom}
          keyboardType="decimal-pad"
          placeholder="Своя, ₴"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
      </View>
      <BigButton
        label={amount ? `КИНУТИ ВИКЛИК · ${formatCoins(amount)}` : 'КИНУТИ ВИКЛИК'}
        disabled={busy || !amount}
        onPress={send}
      />
    </Panel>
  );
}

function myScore(d: Duel, uid: string) {
  return d.challenger === uid ? d.challenger_score : d.opponent_score;
}
function theirScore(d: Duel, uid: string) {
  return d.challenger === uid ? d.opponent_score : d.challenger_score;
}

/** Список дуелей на головній вкладці «Друзі». */
export function DuelList({
  duels,
  friends,
  onPlay,
  onChanged,
  onError,
}: {
  duels: Duel[];
  friends: Profile[];
  onPlay: (d: Duel) => void;
  onChanged: () => void;
  onError: (e: string) => void;
}) {
  const wallet = useWallet();
  const me = myProfile();
  const [busy, setBusy] = useState<number | null>(null);
  useNow(1000);
  if (!me) return null;
  // Лише остання дуель, плюс відкриті виклики, на які ще треба відповісти чи зіграти.
  const needsMe = (d: Duel) =>
    (d.status === 'pending' && d.opponent === me.id) || (d.status === 'accepted' && myScore(d, me.id) == null);
  const visible = duels.filter((d, i) => i === 0 || needsMe(d));
  if (!visible.length) return null;
  const nameOf = (id: string) => friends.find((f) => f.id === id)?.name ?? 'Друг';

  const act = async (d: Duel, fn: () => Promise<void>) => {
    setBusy(d.id);
    try {
      await fn();
      onChanged();
    } catch (e) {
      onError(e instanceof Error && e.message.startsWith('Недостатньо') ? e.message : friendlyError(e));
    }
    setBusy(null);
  };

  const accept = (d: Duel) =>
    act(d, async () => {
      if (!wallet.spend(d.stake)) throw new Error('Недостатньо коштів');
      try {
        await respondDuel(d.id, true);
      } catch (e) {
        wallet.credit(d.stake);
        throw e;
      }
      sfx('bonus');
      onPlay({ ...d, status: 'accepted' });
    });

  const refundNow = async () => {
    const got = await claimTransfers2();
    if (got.credit > 0) wallet.credit(got.credit);
  };

  return (
    <>
      <Text style={styles.title}>⚔️ Дуелі</Text>
      {visible.map((d) => {
        const mineChallenge = d.challenger === me.id;
        const other = nameOf(mineChallenge ? d.opponent : d.challenger);
        const mine = myScore(d, me.id);
        const theirs = theirScore(d, me.id);
        let line = '';
        let controls: ReactNode = null;
        const left = Math.max(0, Math.ceil((new Date(d.created_at).getTime() + INVITE_MS - Date.now()) / 1000));
        if (d.status === 'pending' && mineChallenge) {
          line = `Чекаємо, поки ${other} прийме · ${left} с. Гра почнеться одразу`;
          controls = <Chip label="Скасувати" disabled={busy === d.id} onPress={() => act(d, async () => (await cancelDuel(d.id), await refundNow()))} />;
        } else if (d.status === 'pending') {
          line = `${other} викликає тебе! Залишилось ${left} с`;
          controls = (
            <View style={styles.row}>
              <Chip label={`Прийняти · ${formatCoins(d.stake)}`} active disabled={busy === d.id} onPress={() => accept(d)} />
              <Chip label="Відхилити" disabled={busy === d.id} onPress={() => act(d, () => respondDuel(d.id, false))} />
            </View>
          );
        } else if (d.status === 'accepted' && mine == null) {
          line =
            d.game === 'durak'
              ? `Партія в дурака з ${other}. Заходь за стіл!`
              : d.game === ROULETTE_DUEL
                ? `Рулетка з ${other}. Заходь, револьвер чекає!`
              : theirs == null
                ? `${other} теж ще не грав`
                : `${other} уже зіграв. Твоя черга!`;
          controls = <Chip label="▶ ГРАТИ" active onPress={() => onPlay(d)} />;
        } else if (d.status === 'accepted') {
          line = `Твій результат ${mine} очок. Чекаємо, поки зіграє ${other}`;
        } else if (d.status === 'finished') {
          line =
            d.winner === me.id
              ? `🏆 Перемога ${mine} : ${theirs}. Виграш ${formatCoins(d.stake * 2)}`
              : d.winner
                ? `Поразка ${mine} : ${theirs}. ${other} забирає банк`
                : `Нічия ${mine} : ${theirs}. Ставки повернуто`;
        } else {
          line = d.status === 'declined' ? `${other} відмовився. Ставку повернуто` : 'Виклик скасовано або час вийшов. Ставку повернуто';
        }
        return (
          <Panel key={d.id} style={styles.duel}>
            <Text style={styles.duelHead}>
              {gameTitle(d.game)} · {mineChallenge ? `ти → ${other}` : `${other} → ти`} · {formatCoins(d.stake)}
            </Text>
            <Text style={[styles.muted, d.status === 'finished' && d.winner === me.id && styles.win]}>{line}</Text>
            {controls}
          </Panel>
        );
      })}
    </>
  );
}

/** Повноекранний раунд дуелі. Результат відправляється одразу після раунду. */
export function DuelPlay({ duel, opponentName, onClose }: { duel: Duel; opponentName: string; onClose: () => void }) {
  const game = findGame(duel.game);
  if (duel.game === ROULETTE_DUEL) return <RouletteDuel duel={duel} opponentName={opponentName} onClose={onClose} />;
  if (duel.game === 'durak' && game) return <DurakDuel duel={duel} game={game} opponentName={opponentName} onClose={onClose} />;
  return <ScoreDuelPlay duel={duel} opponentName={opponentName} onClose={onClose} game={game} />;
}

/** Дуель у дурака: жива партія за столом, без таймера на хвилину. */
function DurakDuel({ duel, game, opponentName, onClose }: { duel: Duel; game: GameInfo; opponentName: string; onClose: () => void }) {
  useEffect(() => {
    playMusic(game.music);
    return () => playMusic('lobby');
  }, [game.music]);
  return (
    <View style={styles.flex}>
      <View style={styles.bar}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.back}>‹ Друзі</Text>
        </Pressable>
        <Text style={styles.barTitle} numberOfLines={1}>
          🃏 {opponentName} · {formatCoins(duel.stake)}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <OnlineDurak game={game} duel={duel} onClose={onClose} />
      </ScrollView>
    </View>
  );
}

function ScoreDuelPlay({ duel, opponentName, onClose, game }: { duel: Duel; opponentName: string; onClose: () => void; game?: GameInfo }) {
  const isNumber = duel.game === NUMBER_DUEL;
  const [score, setScore] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const sent = useRef(false);
  const progress = useRef(0);
  const [deadline] = useState(() => Date.now() + ROUND_MS);
  const [left, setLeft] = useState(ROUND_MS / 1000);

  // Хвилина на раунд: коли час вийшов, зараховуємо те, що встиг набрати.
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) {
        clearInterval(t);
        finish(progress.current);
      }
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (game) playMusic(game.music);
    if (isNumber) return;
    // Якщо раунд уже починали і вийшли, повторної спроби немає: зараховуємо 0.
    AsyncStorage.getItem(STARTED_KEY).then((raw) => {
      if (raw && raw.split(',').includes(String(duel.id))) {
        setBlocked(true);
        finish(0);
      } else AsyncStorage.setItem(STARTED_KEY, [raw, duel.id].filter(Boolean).join(',').split(',').slice(-30).join(','));
    });
    return () => playMusic('lobby');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = async (points: number) => {
    if (sent.current) return;
    sent.current = true;
    setScore(points);
    setStatus('Відправляю результат…');
    try {
      await submitDuelScore(duel.id, points);
      setStatus(`Результат зараховано. Чекаємо, поки зіграє ${opponentName}…`);
      setWaiting(true);
    } catch (e) {
      setStatus(friendlyError(e));
    }
  };

  // Після свого ходу стежимо за дуеллю, поки суперник не зіграє, і одразу показуємо підсумок.
  const [waiting, setWaiting] = useState(false);
  const [outcome, setOutcome] = useState<{ kind: 'win' | 'lose' | 'draw'; mine: number; theirs: number } | null>(null);
  useEffect(() => {
    if (!waiting) return;
    let stop = false;
    const check = async () => {
      try {
        const d = (await listDuels()).find((x) => x.id === duel.id);
        const me = myProfile();
        if (stop || !d || !me || d.status !== 'finished') return;
        const iAmChallenger = d.challenger === me.id;
        const mine = Number((iAmChallenger ? d.challenger_score : d.opponent_score) ?? 0);
        const theirs = Number((iAmChallenger ? d.opponent_score : d.challenger_score) ?? 0);
        const kind = d.winner === me.id ? 'win' : d.winner ? 'lose' : 'draw';
        setOutcome({ kind, mine, theirs });
        setWaiting(false);
        if (kind === 'win') {
          sfx('bigwin');
          haptic('win');
        } else sfx(kind === 'lose' ? 'lose' : 'click');
      } catch {
        // Спробуємо ще раз.
      }
    };
    check();
    const t = setInterval(check, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  // Вихід посеред раунду зараховує 0, щоб не перегравати до вдалої спроби.
  const leave = () => {
    if (!sent.current && (game || isNumber)) submitDuelScore(duel.id, 0).catch(() => {});
    sent.current = true;
    onClose();
  };

  return (
    <View style={styles.flex}>
      <View style={styles.bar}>
        <Pressable onPress={leave} hitSlop={10}>
          <Text style={styles.back}>‹ Друзі</Text>
        </Pressable>
        <Text style={styles.barTitle} numberOfLines={1}>
          ⚔️ {opponentName} · {formatCoins(duel.stake)}
        </Text>
        {score == null && <Text style={[styles.timer, left <= 10 && styles.timerHot]}>⏱ {left} с</Text>}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {score != null ? (
          <Panel style={styles.result}>
            {outcome ? (
              <>
                <Text style={styles.big}>{outcome.kind === 'win' ? '🏆' : outcome.kind === 'lose' ? '😵' : '🤝'}</Text>
                <Text style={[styles.title, { color: outcome.kind === 'win' ? colors.green : outcome.kind === 'lose' ? colors.red : colors.text }]}>
                  {outcome.kind === 'win' ? 'ТИ ВИГРАВ!' : outcome.kind === 'lose' ? 'ТИ ПРОГРАВ' : 'НІЧИЯ'}
                </Text>
                <Text style={styles.title}>
                  Ти {outcome.mine} : {outcome.theirs} {opponentName}
                </Text>
                <Text style={styles.mutedCenter}>
                  {outcome.kind === 'win'
                    ? `Виграш ${formatCoins(duel.stake * 2)} уже на балансі`
                    : outcome.kind === 'lose'
                      ? `${opponentName} забирає банк ${formatCoins(duel.stake * 2)}`
                      : 'Ставки повернуто обом'}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.big}>{blocked ? '⏹️' : '🏁'}</Text>
                <Text style={styles.title}>{blocked ? 'Раунд було перервано' : `Твій результат: ${score} очок`}</Text>
                {status && <Text style={styles.mutedCenter}>{status}</Text>}
              </>
            )}
            <BigButton label="ДО ДРУЗІВ" onPress={onClose} />
          </Panel>
        ) : isNumber ? (
          <NumberDuel onDone={finish} />
        ) : !game ? (
          <Text style={styles.mutedCenter}>Цієї гри вже немає. Онови застосунок</Text>
        ) : game.kind === 'dig' ? (
          <>
            <Text style={styles.mutedCenter}>Один заїзд: рулетка дає кирку, і вона падає в шахту сама. Хто знайде більше, той виграв.</Text>
            <MineGame game={game} duel={finish} onProgress={(p) => (progress.current = p)} autoStart />
          </>
        ) : (
          <>
            <Text style={styles.mutedCenter}>Є хвилина. Вийдеш раніше — буде 0 очок.</Text>
            <SlotDuel game={game} spins={DUEL_SPINS} onDone={finish} onProgress={(p) => (progress.current = p)} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Один кидок числа від 1 до 99. */
function NumberDuel({ onDone }: { onDone: (points: number) => void }) {
  const [value, setValue] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const roll = () => {
    if (rolling || value !== null) return;
    setRolling(true);
    sfx('spin', 0.5);
    const final = 1 + Math.floor(Math.random() * 99);
    let k = 0;
    const t = setInterval(() => {
      k++;
      setValue(1 + Math.floor(Math.random() * 99));
      if (k >= 18) {
        clearInterval(t);
        setValue(final);
        setRolling(false);
        sfx(final >= 70 ? 'bigwin' : 'win');
        haptic('win');
        setTimeout(() => onDone(final), 900);
      }
    }, 80);
  };
  return (
    <View style={styles.slot}>
      <Text style={styles.mutedCenter}>Один кидок. У кого число більше, той забирає банк.</Text>
      <Panel style={styles.numberBox}>
        <Text style={styles.number}>{value ?? '?'}</Text>
      </Panel>
      <BigButton label={value === null ? 'КИНУТИ ЧИСЛО' : rolling ? '…' : `ТВОЄ ЧИСЛО: ${value}`} onPress={roll} disabled={rolling || value !== null} />
    </View>
  );
}

function SlotDuel({
  game,
  spins,
  onDone,
  onProgress,
}: {
  game: GameInfo;
  spins: number;
  onDone: (points: number) => void;
  onProgress: (points: number) => void;
}) {
  const config = game.slot!;
  const { width } = useWindowDimensions();
  const [grid, setGrid] = useState<Grid>(() => spinGrid(config));
  const [spinning, setSpinning] = useState(false);
  const [left, setLeft] = useState(spins);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState({ text: `${spins} обертів. Набери більше очок!`, tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const size = Math.min(80, Math.floor((Math.min(width, 480) - 56 - config.reels * 6) / config.reels));

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const spin = () => {
    if (spinning || left <= 0) return;
    // У дуелі шанси підкручені: порожній оберт перекидається до 3 разів, тож очки бувають майже завжди.
    let result = spinGrid(config);
    let win = evaluateGrid(config, result, DUEL_SPIN_BET).win;
    for (let k = 0; k < 3 && win === 0; k++) {
      result = spinGrid(config);
      win = evaluateGrid(config, result, DUEL_SPIN_BET).win;
    }
    setGrid(result);
    setSpinning(true);
    sfx('spin', 0.5);
    timer.current = setTimeout(() => {
      setSpinning(false);
      const next = total + win;
      setTotal(next);
      onProgress(next);
      setLeft(left - 1);
      if (win > 0) {
        sfx('win');
        haptic('win');
        setMessage({ text: `+${win} очок`, tone: 'win' });
      } else {
        sfx('stop', 0.5);
        setMessage({ text: 'Мимо', tone: 'neutral' });
      }
      if (left - 1 <= 0) setTimeout(() => onDone(next), 700);
    }, 650);
  };

  return (
    <View style={styles.slot}>
      <Panel style={styles.score}>
        <Text style={styles.scoreText}>Очки: {total}</Text>
        <Text style={styles.muted}>Залишилось обертів: {left}</Text>
      </Panel>
      <View style={[styles.machine, { borderColor: game.colors[0] }]}>
        {grid.map((column, i) => (
          <Reel
            key={i}
            items={column}
            spinning={spinning}
            size={size}
            randomItem={() => randomSymbol(config)}
            cellStyle={game.art ? styles.artCell : undefined}
            render={(s) =>
              game.art?.[s.id] ? (
                <Image source={game.art[s.id]} style={{ width: size - 6, height: size - 6, borderRadius: 9 }} />
              ) : (
                <Text style={{ fontSize: size * 0.55 }}>{s.emoji}</Text>
              )
            }
          />
        ))}
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      <BigButton label={left > 0 ? 'КРУТИТИ' : 'ГОТОВО'} onPress={spin} disabled={spinning || left <= 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  setup: { gap: 10, marginHorizontal: 12, marginBottom: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 12 },
  mutedCenter: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  win: { color: colors.gold, fontWeight: '800' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  input: {
    minWidth: 0,
    width: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    color: colors.text,
    fontSize: 14,
    backgroundColor: colors.bg,
  },
  duel: { gap: 6 },
  duelHead: { color: colors.text, fontWeight: '800', fontSize: 14 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.gold, fontSize: 16, fontWeight: '800' },
  timer: { color: colors.gold, fontWeight: '900', fontSize: 16 },
  timerHot: { color: colors.red },
  barTitle: { color: colors.text, fontSize: 16, fontWeight: '900', flex: 1 },
  result: { alignItems: 'center', gap: 10 },
  big: { fontSize: 48 },
  numberBox: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 28 },
  number: { color: colors.gold, fontSize: 96, fontWeight: '900' },
  slot: { gap: 14, alignItems: 'center' },
  score: { alignItems: 'center', alignSelf: 'stretch' },
  scoreText: { color: colors.gold, fontSize: 24, fontWeight: '900' },
  machine: {
    flexDirection: 'row',
    gap: 6,
    padding: 10,
    borderRadius: 18,
    borderWidth: 3,
    backgroundColor: '#14102A',
  },
  artCell: { backgroundColor: '#FFF6E0', borderRadius: 12, overflow: 'hidden' },
});
