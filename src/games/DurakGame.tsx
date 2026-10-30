import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { sfx } from '../audio/sound';
import { BetSelector, BigButton, Chip, ResultLine, haptic } from '../components/ui';
import { friendsEnabled } from '../config';
import {
  Duel,
  DurakLobbyRow,
  DurakTable,
  claimTransfers2,
  durakCancel,
  durakClaim,
  durakByDuel,
  durakCreate,
  durakDuelStart,
  durakGet,
  durakJoin,
  durakLobby,
  durakMine,
  durakMove,
  friendlyError,
  myProfile,
  profileName,
} from '../state/friends';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';
import {
  DCard,
  DeckSize,
  DurakState,
  Move,
  Seat,
  applyMove,
  botMove,
  canAttack,
  canDefend,
  isJoker,
  newGame,
  sortHand,
  turnOf,
} from './durakEngine';

const RANKS: Record<number, string> = { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' };
const BOT_DELAY = 750;
const POLL_MS = 1500;
const CLAIM_MS = 60_000;

function CardView({ card, back, glow, small }: { card?: DCard; back?: boolean; glow?: boolean; small?: boolean }) {
  const size = small ? styles.cardSmall : styles.card;
  if (!card || back) return <View style={[size, styles.cardBack]}><Text style={styles.backStar}>★</Text></View>;
  if (isJoker(card)) {
    return (
      <View style={[size, styles.cardFace, glow && styles.glow]}>
        <Text style={[styles.jokerText, { color: card.red ? '#DC2626' : '#111827' }]}>🃏</Text>
        <Text style={[styles.jokerLabel, { color: card.red ? '#DC2626' : '#111827' }]}>ДЖОКЕР</Text>
      </View>
    );
  }
  const red = card.s === '♥' || card.s === '♦';
  const color = red ? '#DC2626' : '#111827';
  // Кут з рангом і мастю, як на справжній карті: його видно, навіть коли карту накрили іншою.
  return (
    <View style={[size, styles.cardFace, glow && styles.glow]}>
      <View style={styles.corner}>
        <Text style={[styles.cornerRank, { color }]}>{RANKS[card.r] ?? card.r}</Text>
        <Text style={[styles.cornerSuit, { color }]}>{card.s}</Text>
      </View>
      <Text style={[styles.suit, small && styles.suitSmall, styles.centerSuit, { color }]}>{card.s}</Text>
    </View>
  );
}

function phaseText(s: DurakState, me: Seat, opp: string) {
  if (s.phase === 'over') return s.loser === -1 ? 'Нічия!' : s.loser === me ? 'Ти дурак 😅' : `Ти переміг! ${opp} — дурак`;
  const myTurn = turnOf(s) === me;
  if (s.phase === 'defend') return myTurn ? 'Відбивайся або бери' : `${opp} відбивається…`;
  if (s.phase === 'taking') return myTurn ? `${opp} бере. Докинь карти або «Досить»` : `Ти береш. ${opp} докидає…`;
  if (!s.table.length) return myTurn ? 'Твій хід: поклади карту' : `Ходить ${opp}…`;
  return myTurn ? 'Підкинь карту або «Бито»' : `${opp} думає, що підкинути…`;
}

/** Стіл: карти суперника, колода з козирем, бій і рука гравця. */
function Board({
  state,
  me,
  opponent,
  onMove,
  locked,
}: {
  state: DurakState;
  me: Seat;
  opponent: string;
  onMove: (m: Move) => void;
  locked?: boolean;
}) {
  const opp = (1 - me) as Seat;
  const myTurn = !locked && turnOf(state) === me;
  const hand = sortHand(state.hands[me], state.trump);
  const playable = (c: DCard) =>
    myTurn && (state.phase === 'defend' ? canDefend(state, c) : state.attacker === me && canAttack(state, c));
  const tap = (c: DCard) => {
    if (!playable(c)) return;
    haptic();
    sfx('click');
    onMove(state.phase === 'defend' ? { type: 'defend', card: c } : { type: 'attack', card: c });
  };
  const action =
    !myTurn || state.phase === 'over'
      ? null
      : state.phase === 'defend'
        ? { label: 'БЕРУ', move: { type: 'take' } as Move, color: colors.red }
        : state.phase === 'taking'
          ? { label: 'ДОСИТЬ', move: { type: 'done' } as Move, color: colors.blue }
          : state.table.length
            ? { label: 'БИТО', move: { type: 'done' } as Move, color: colors.green }
            : null;
  return (
    <View style={styles.board}>
      <View style={styles.oppRow}>
        <Text style={styles.who} numberOfLines={1}>
          {state.attacker === opp ? '⚔️ ' : '🛡 '}
          {opponent} · {state.hands[opp].length} карт
        </Text>
        <View style={styles.oppCards}>
          {state.hands[opp].slice(0, 12).map((_, i) => (
            <View key={i} style={i ? styles.overlap : undefined}>
              <CardView back small />
            </View>
          ))}
        </View>
      </View>
      <View style={styles.middle}>
        <View style={styles.deckBox}>
          {state.deck.length > 0 ? (
            <View style={styles.pile}>
              <View style={styles.trumpUnder}>
                <CardView card={state.trumpCard} small />
              </View>
              {state.deck.length > 1 && (
                <View style={styles.deckTop}>
                  <CardView back small />
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.trumpBig}>{state.trump}</Text>
          )}
          <View style={styles.trumpBadge}>
            <Text style={styles.trumpBadgeText}>КОЗИР</Text>
            <Text style={[styles.trumpBadgeSuit, (state.trump === '♥' || state.trump === '♦') && { color: '#F87171' }]}>{state.trump}</Text>
          </View>
          <Text style={styles.deckText}>{state.deck.length ? `колода ${state.deck.length}` : 'колода пуста'}</Text>
        </View>
        <View style={styles.fight}>
          {state.table.length === 0 ? (
            <Text style={styles.empty}>{state.last ?? 'Стіл порожній'}</Text>
          ) : (
            state.table.map((p, i) => (
              <View key={i} style={styles.pair}>
                <CardView card={p.a} small />
                {p.d && (
                  <View style={styles.cover}>
                    <CardView card={p.d} small />
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </View>
      <Text style={styles.status}>{phaseText(state, me, opponent)}</Text>
      <View style={styles.hand}>
        {hand.map((c, i) => (
          <Pressable key={`${c.r}${c.s}${c.red ? 'r' : ''}${i}`} onPress={() => tap(c)} testID={playable(c) ? 'durak-play' : undefined} style={[styles.handCard, !playable(c) && myTurn && styles.dim]}>
            <CardView card={c} glow={playable(c)} />
          </Pressable>
        ))}
      </View>
      {action && <BigButton label={action.label} color={action.color} onPress={() => onMove(action.move)} />}
      <Text style={styles.who}>
        {state.attacker === me ? '⚔️ Ти нападаєш' : '🛡 Ти відбиваєшся'} · відбій {state.discard}
      </Text>
    </View>
  );
}

function DeckPicker({ value, onChange }: { value: DeckSize; onChange: (d: DeckSize) => void }) {
  return (
    <View style={styles.row}>
      <Chip label="36 карт" active={value === 36} onPress={() => onChange(36)} />
      <Chip label="54 карти (з джокерами)" active={value === 54} onPress={() => onChange(54)} />
    </View>
  );
}

function OfflineDurak({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [deck, setDeck] = useState<DeckSize>(36);
  const [bet, setBet] = useState(500);
  const [stake, setStake] = useState(0);
  const [state, setStateRaw] = useState<DurakState | null>(null);
  const stateRef = useRef<DurakState | null>(null);
  const setState = (s: DurakState | null) => {
    stateRef.current = s;
    setStateRaw(s);
  };
  const [msg, setMsg] = useState<{ text: string; tone: 'win' | 'lose' | 'neutral' }>({ text: 'Обери колоду і ставку', tone: 'neutral' });

  const finish = useCallback(
    (s: DurakState, st: number) => {
      if (s.loser === -1) {
        wallet.credit(st);
        setMsg({ text: 'Нічия. Ставку повернуто', tone: 'neutral' });
      } else if (s.loser === 1) {
        wallet.win(game.id, st * 2);
        haptic('win');
        sfx('win');
        setMsg({ text: `Перемога! +${formatCoins(st * 2)}`, tone: 'win' });
      } else {
        haptic('lose');
        setMsg({ text: 'Бот виграв. Ти дурак 😅', tone: 'lose' });
      }
    },
    [wallet, game.id],
  );

  const play = (m: Move, seat: Seat) => {
    const prev = stateRef.current;
    if (!prev || turnOf(prev) !== seat) return;
    const next = applyMove(prev, seat, m);
    setState(next);
    if (next.phase === 'over') finish(next, stake);
  };

  // Хід бота з невеликою паузою.
  useEffect(() => {
    if (!state || turnOf(state) !== 1) return;
    const t = setTimeout(() => play(botMove(state, 1), 1), BOT_DELAY);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const start = () => {
    if (!wallet.bet(game.id, 'table', bet)) {
      setMsg({ text: 'Недостатньо ₴', tone: 'lose' });
      return;
    }
    setStake(bet);
    setState(newGame(deck));
    setMsg({ text: `Ставка ${formatCoins(bet)} · виграш ${formatCoins(bet * 2)}`, tone: 'neutral' });
  };

  const playing = state && state.phase !== 'over';
  return (
    <View style={styles.root}>
      {state && <Board state={state} me={0} opponent="Бот" onMove={(m) => play(m, 0)} />}
      <ResultLine text={msg.text} tone={msg.tone} />
      {playing ? (
        <BigButton
          label="ЗДАТИСЯ"
          color="#4B5563"
          onPress={() => {
            setState({ ...state, phase: 'over', loser: 0 });
            setMsg({ text: 'Ти здався. Ставка програна', tone: 'lose' });
          }}
        />
      ) : (
        <>
          <DeckPicker value={deck} onChange={setDeck} />
          <BetSelector value={bet} onChange={setBet} />
          <BigButton label={state ? 'ЩЕ РАЗ' : 'ГРАТИ З БОТОМ'} onPress={start} />
        </>
      )}
    </View>
  );
}

/** Онлайн-дурак. З duel — гра дуелі з другом за вже знятими ставками. */
export function OnlineDurak({ game, duel, onClose }: { game: GameInfo; duel?: Duel; onClose?: () => void }) {
  const wallet = useWallet();
  const [deck, setDeck] = useState<DeckSize>(36);
  const [bet, setBet] = useState(500);
  const [lobby, setLobby] = useState<DurakLobbyRow[]>([]);
  const [table, setTable] = useState<DurakTable | null>(null);
  const [oppName, setOppName] = useState('Суперник');
  const [msg, setMsg] = useState<{ text: string; tone: 'win' | 'lose' | 'neutral' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const sending = useRef(false);
  const tableRef = useRef<DurakTable | null>(null);
  tableRef.current = table;
  const me = myProfile();

  const collect = useCallback(async () => {
    for (let k = 0; k < 3; k++) {
      const { credit, total: got } = await claimTransfers2().catch(() => ({ credit: 0, total: 0 }));
      if (got > 0) {
        if (credit > 0) wallet.credit(credit);
        return got;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return 0;
  }, [wallet]);

  // Стіл дуелі: суперник, що прийняв виклик, роздає карти; той, хто викликав, чекає стіл.
  const duelId = duel?.id;
  useEffect(() => {
    if (!me || !duelId || !duel) return;
    let alive = true;
    const find = async () => {
      let t = await durakByDuel(duelId);
      if (!t && duel.opponent === me.id) {
        const s = newGame(36);
        await durakDuelStart(duelId, s, turnOf(s) ?? 0).catch(() => {});
        t = await durakByDuel(duelId);
      }
      if (alive && t) setTable(t);
      return !!t;
    };
    find().catch((e) => alive && setMsg({ text: friendlyError(e), tone: 'lose' }));
    const iv = setInterval(() => {
      if (tableRef.current) return clearInterval(iv);
      find().catch(() => {});
    }, 2000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, duelId]);

  // Повертаємось до гри, якщо вона вже йде.
  useEffect(() => {
    if (!me || duelId) return;
    durakMine()
      .then((t) => t && setTable(t))
      .catch((e) => setMsg({ text: friendlyError(e), tone: 'lose' }));
  }, [me]);

  // Лобі, поки не сидимо за столом.
  useEffect(() => {
    if (!me || table || duelId) return;
    let alive = true;
    const load = () =>
      durakLobby()
        .then((rows) => alive && setLobby(rows))
        .catch((e) => alive && setMsg({ text: friendlyError(e), tone: 'lose' }));
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [me, table, duelId]);

  // Стан столу, поки гра не закінчилась.
  const tableId = table?.id;
  const tableStatus = table?.status;
  useEffect(() => {
    if (!tableId || tableStatus === 'finished' || tableStatus === 'cancelled') return;
    let alive = true;
    const t = setInterval(() => {
      setNow(Date.now());
      if (sending.current) return;
      durakGet(tableId)
        .then((row) => {
          if (!alive || !row || sending.current) return;
          setTable((prev) => (prev && row.version < prev.version ? prev : row));
        })
        .catch(() => {});
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tableId, tableStatus]);

  const seat: Seat = table && me && table.guest === me.id ? 1 : 0;
  const oppId = table ? (seat === 0 ? table.guest : table.host) : null;

  useEffect(() => {
    if (!oppId) return;
    let alive = true;
    profileName(oppId)
      .then((n) => alive && n && setOppName(n))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [oppId]);

  // Кінець гри: забираємо виплату.
  const finishedId = table?.status === 'finished' ? table.id : null;
  useEffect(() => {
    if (!finishedId || !table) return;
    const won = table.loser !== -1 && table.loser !== seat;
    const draw = table.loser === -1;
    collect().then((got) => {
      if (won) {
        haptic('win');
        sfx('win');
        setMsg({ text: `Перемога! +${formatCoins(got || table.stake * 2)}`, tone: 'win' });
      } else if (draw) setMsg({ text: 'Нічия. Ставку повернуто', tone: 'neutral' });
      else setMsg({ text: 'Ти програв. Ти дурак 😅', tone: 'lose' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedId]);

  if (!friendsEnabled()) return <Text style={styles.note}>Онлайн-гра потребує сервера. Грай з ботом.</Text>;
  if (!me) return <Text style={styles.note}>Підключаюсь до сервера… Відкрий вкладку «Друзі», якщо це триває довго.</Text>;

  const create = async () => {
    if (busy) return;
    if (!wallet.bet(game.id, 'table', bet)) return setMsg({ text: 'Недостатньо ₴', tone: 'lose' });
    setBusy(true);
    try {
      const id = await durakCreate(bet, deck);
      setTable(await durakGet(id));
      setMsg(null);
    } catch (e) {
      wallet.credit(bet);
      setMsg({ text: friendlyError(e), tone: 'lose' });
    } finally {
      setBusy(false);
    }
  };

  const join = async (row: DurakLobbyRow) => {
    if (busy) return;
    if (!wallet.bet(game.id, 'table', row.stake)) return setMsg({ text: 'Недостатньо ₴ для цієї ставки', tone: 'lose' });
    setBusy(true);
    try {
      const s = newGame(row.deck_size);
      await durakJoin(row.id, s, turnOf(s) ?? 0);
      setOppName(row.host_name);
      setTable(await durakGet(row.id));
      setMsg(null);
    } catch (e) {
      wallet.credit(row.stake);
      setMsg({ text: friendlyError(e), tone: 'lose' });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!table) return;
    setBusy(true);
    try {
      await durakCancel(table.id);
      await collect();
      setTable(null);
      setMsg({ text: 'Стіл закрито, ставку повернуто', tone: 'neutral' });
    } catch (e) {
      setMsg({ text: friendlyError(e), tone: 'lose' });
    } finally {
      setBusy(false);
    }
  };

  const send = async (next: DurakState, loser: number | null) => {
    if (!table) return;
    sending.current = true;
    const optimistic = { ...table, state: next, version: table.version + 1, turn: turnOf(next) };
    setTable(optimistic);
    try {
      await durakMove(table.id, table.version, next, turnOf(next), loser);
      if (loser !== null) setTable({ ...optimistic, status: 'finished', loser });
    } catch (e) {
      setMsg({ text: friendlyError(e), tone: 'lose' });
      const row = await durakGet(table.id).catch(() => null);
      if (row) setTable(row);
    } finally {
      sending.current = false;
    }
  };

  const move = (m: Move) => {
    if (!table?.state || sending.current) return;
    const s = table.state as DurakState;
    if (turnOf(s) !== seat) return;
    const next = applyMove(s, seat, m);
    send(next, next.phase === 'over' ? next.loser : null);
  };

  const surrender = () => {
    if (!table?.state) return;
    const s = table.state as DurakState;
    send({ ...s, phase: 'over', loser: seat }, seat);
  };

  const claim = async () => {
    if (!table) return;
    try {
      await durakClaim(table.id);
      const row = await durakGet(table.id);
      if (row) setTable(row);
    } catch (e) {
      setMsg({ text: friendlyError(e), tone: 'lose' });
    }
  };

  if (table && table.status === 'open') {
    return (
      <View style={styles.root}>
        <View style={styles.waiting}>
          <Text style={styles.waitTitle}>⏳ Чекаємо суперника…</Text>
          <Text style={styles.note}>
            Стіл на {table.deck_size} карт, ставка {formatCoins(table.stake)}. Хто сяде першим, з тим і граєш. Покличи друга зайти в «Дурак» → «Онлайн».
          </Text>
        </View>
        {msg && <ResultLine text={msg.text} tone={msg.tone} />}
        <BigButton label="ЗАКРИТИ СТІЛ" color="#4B5563" disabled={busy} onPress={cancel} />
      </View>
    );
  }

  if (duelId && !table) {
    return (
      <View style={styles.root}>
        <View style={styles.waiting}>
          <Text style={styles.waitTitle}>🃏 Роздаємо карти…</Text>
          <Text style={styles.note}>Дуель у дурака на 36 карт. Ставки вже на столі, переможець забирає обидві.</Text>
        </View>
        {msg && <ResultLine text={msg.text} tone={msg.tone} />}
      </View>
    );
  }

  if (table && table.state) {
    const s = table.state as DurakState;
    const over = table.status !== 'playing';
    const view: DurakState = over && s.phase !== 'over' ? { ...s, phase: 'over', loser: (table.loser ?? -1) as Seat | -1 } : s;
    const theirTurn = !over && table.turn !== null && table.turn !== seat;
    const idle = now - new Date(table.updated_at).getTime();
    return (
      <View style={styles.root}>
        <Board state={view} me={seat} opponent={oppName} onMove={move} locked={over} />
        {msg && <ResultLine text={msg.text} tone={msg.tone} />}
        {theirTurn && idle > CLAIM_MS && <BigButton label="СУПЕРНИК ПРОПАВ: ЗАБРАТИ ПЕРЕМОГУ" color={colors.accent} onPress={claim} />}
        {theirTurn && idle > 20_000 && idle <= CLAIM_MS && (
          <Text style={styles.note}>Суперник думає… Через {Math.ceil((CLAIM_MS - idle) / 1000)} с можна забрати перемогу.</Text>
        )}
        {over ? (
          <BigButton
            label={onClose ? 'ГОТОВО' : 'ДО СТОЛІВ'}
            onPress={() => {
              if (onClose) return onClose();
              setTable(null);
              setMsg(null);
            }}
          />
        ) : (
          <BigButton label="ЗДАТИСЯ" color="#4B5563" onPress={surrender} />
        )}
        <Text style={styles.note}>Ставка {formatCoins(table.stake)} з кожного · переможець забирає {formatCoins(table.stake * 2)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.section}>Відкриті столи</Text>
      {lobby.length === 0 ? (
        <Text style={styles.note}>Поки ніхто не чекає. Створи свій стіл нижче.</Text>
      ) : (
        lobby.map((r) => (
          <View key={r.id} style={styles.lobbyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lobbyName} numberOfLines={1}>
                {r.host_name}
              </Text>
              <Text style={styles.note}>
                {r.deck_size} карт · ставка {formatCoins(r.stake)}
              </Text>
            </View>
            <Pressable disabled={busy} onPress={() => join(r)} style={styles.joinBtn}>
              <Text style={styles.joinText}>СІСТИ</Text>
            </Pressable>
          </View>
        ))
      )}
      {msg && <ResultLine text={msg.text} tone={msg.tone} />}
      <Text style={styles.section}>Створити стіл</Text>
      <DeckPicker value={deck} onChange={setDeck} />
      <BetSelector value={bet} onChange={setBet} />
      <BigButton label="СТВОРИТИ СТІЛ" disabled={busy} onPress={create} />
    </View>
  );
}

export function DurakGame({ game }: { game: GameInfo }) {
  const [mode, setMode] = useState<'bot' | 'online'>('bot');
  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Chip label="🤖 З ботом" active={mode === 'bot'} onPress={() => setMode('bot')} />
        <Chip label="🌐 Онлайн" active={mode === 'online'} onPress={() => setMode('online')} />
      </View>
      {mode === 'bot' ? <OfflineDurak game={game} /> : <OnlineDurak game={game} />}
      <Text style={styles.rules}>
        Підкидний дурак на двох. Підкидати можна карти тих самих значень, що вже на столі, до 6 за раз. У колоді на 54 карти є 2 джокери: джокер
        б’є будь-яку карту, а побити джокера може лише інший джокер. Хто першим скине карти, коли колода закінчилась, — виграв.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center', width: '100%' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  board: {
    width: '100%',
    backgroundColor: '#14532D',
    borderRadius: 22,
    padding: 12,
    gap: 10,
    borderWidth: 4,
    borderColor: '#A16207',
  },
  oppRow: { gap: 6 },
  oppCards: { flexDirection: 'row', paddingLeft: 2 },
  overlap: { marginLeft: -26 },
  who: { color: '#D1FAE5', fontWeight: '700', fontSize: 13 },
  middle: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 96 },
  deckBox: { width: 78, alignItems: 'center', gap: 4 },
  pile: { width: 78, height: 64 },
  trumpUnder: { position: 'absolute', left: 30, top: 3, transform: [{ rotate: '90deg' }] },
  deckTop: { position: 'absolute', left: 2, top: 3 },
  trumpBig: { color: colors.gold, fontSize: 36, fontWeight: '900' },
  deckText: { color: '#D1FAE5', fontSize: 10, textAlign: 'center' },
  fight: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 90 },
  empty: { color: '#86EFAC', fontStyle: 'italic' },
  pair: { width: 54, height: 90 },
  cover: { position: 'absolute', left: 14, top: 30 },
  corner: { position: 'absolute', left: 3, top: 2, alignItems: 'center' },
  cornerRank: { fontSize: 11, fontWeight: '900', lineHeight: 12 },
  cornerSuit: { fontSize: 11, lineHeight: 12 },
  centerSuit: { marginTop: 8 },
  trumpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  trumpBadgeText: { color: colors.gold, fontSize: 9, fontWeight: '900' },
  trumpBadgeSuit: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  status: { color: colors.gold, fontWeight: '900', textAlign: 'center', fontSize: 15 },
  hand: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center' },
  handCard: {},
  dim: { opacity: 0.45 },
  card: { width: 46, height: 66, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cardSmall: { width: 40, height: 58, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cardFace: { backgroundColor: '#FFFFFF', borderColor: '#D1D5DB' },
  cardBack: { backgroundColor: '#7C3AED', borderColor: '#C4B5FD', borderWidth: 2 },
  glow: { borderColor: colors.gold, borderWidth: 3 },
  backStar: { color: '#FDE68A', fontSize: 18 },
  rank: { fontSize: 18, fontWeight: '900' },
  rankSmall: { fontSize: 15 },
  suit: { fontSize: 24 },
  suitSmall: { fontSize: 20 },
  jokerText: { fontSize: 22 },
  jokerLabel: { fontSize: 7, fontWeight: '900' },
  note: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  rules: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  section: { color: colors.text, fontWeight: '900', fontSize: 16, alignSelf: 'flex-start' },
  lobbyRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lobbyName: { color: colors.text, fontWeight: '800' },
  joinBtn: { backgroundColor: colors.green, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  joinText: { color: '#fff', fontWeight: '900' },
  waiting: { width: '100%', backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 8, alignItems: 'center' },
  waitTitle: { color: colors.gold, fontWeight: '900', fontSize: 18 },
});
