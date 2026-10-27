import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { sfx } from '../audio/sound';
import { formatDuration, useNow } from '../components/useNow';
import { BetSelector, BigButton, Chip, Panel } from '../components/ui';
import {
  Market,
  Match,
  SPORTS,
  Sport,
  SportPick,
  getMatch,
  liveMatches,
  liveState,
  marketLabel,
  pickWins,
  upcomingMatches,
} from '../state/sports';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';

type Tab = 'line' | 'live' | 'mine';
const MARKETS: Market[] = ['1', 'X', '2', 'over', 'under'];
const SHORT: Record<Market, string> = { '1': 'П1', X: 'X', '2': 'П2', over: 'ТБ', under: 'ТМ' };

function LeagueBadge({ m }: { m: Match }) {
  return (
    <Text style={styles.league}>
      {SPORTS[m.sport].icon} {m.league === 'ua' ? '🇺🇦 Україна' : '🌍 Світ'} · {SPORTS[m.sport].label}
    </Text>
  );
}

function Score({ m, now }: { m: Match; now: number }) {
  const st = liveState(m, now);
  const unit = m.sport === 'tennis' ? `сет ${st.minute}` : `${st.minute}'`;
  const lastEvents = st.events.filter((e) => e.kind !== 'set').slice(-3).reverse();
  return (
    <View style={styles.live}>
      <View style={styles.liveRow}>
        <Text style={styles.liveDot}>{st.finished ? '🏁' : '🔴'}</Text>
        <Text style={styles.liveTime}>{st.finished ? 'Завершено' : unit}</Text>
        <Text style={styles.score}>
          {st.home} : {st.away}
        </Text>
      </View>
      {!st.finished && (
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: `${Math.min(100, ((now - m.kickoff) / (m.end - m.kickoff)) * 100)}%` }]} />
        </View>
      )}
      {lastEvents.map((e, i) => (
        <Text key={i} style={styles.event}>
          {e.kind === 'goal' ? (m.sport === 'hockey' ? '🏒' : '⚽') : '🟨'} {e.minute}' {e.side === 'home' ? m.home : m.away}
        </Text>
      ))}
    </View>
  );
}

export function SportsScreen() {
  const wallet = useWallet();
  const now = useNow(1000);
  const [tab, setTab] = useState<Tab>('line');
  const [sport, setSport] = useState<Sport | 'all'>('all');
  const [picks, setPicks] = useState<SportPick[]>([]);
  const [stake, setStake] = useState(500);

  const filter = (list: Match[]) => (sport === 'all' ? list : list.filter((m) => m.sport === sport));
  const upcoming = filter(upcomingMatches(now));
  const live = filter(liveMatches(now));
  const validPicks = picks.filter((p) => getMatch(p.matchId).kickoff > now);
  const totalOdds = Math.round(validPicks.reduce((x, p) => x * p.odds, 1) * 100) / 100;
  const open = wallet.state.sportBets.filter((b) => b.status === 'open').length;

  const toggle = (m: Match, market: Market) => {
    const odds = m.odds[market]!;
    setPicks((prev) => {
      const same = prev.find((p) => p.matchId === m.id);
      const rest = prev.filter((p) => p.matchId !== m.id);
      if (same?.market === market) return rest;
      return [...rest, { matchId: m.id, market, odds }];
    });
  };

  const place = () => {
    if (!validPicks.length) return;
    if (wallet.placeSportBet(validPicks, stake)) {
      sfx('cash');
      wallet.notify(`Ставку прийнято: ${formatCoins(stake)} × ${totalOdds}`);
      setPicks([]);
    } else wallet.notify('Недостатньо коштів');
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.tabs}>
          <Chip label="📋 Лінія" active={tab === 'line'} onPress={() => setTab('line')} />
          <Chip label={`🔴 Live (${live.length})`} active={tab === 'live'} onPress={() => setTab('live')} />
          <Chip label={`🎫 Мої ставки${open ? ` (${open})` : ''}`} active={tab === 'mine'} onPress={() => setTab('mine')} />
        </View>
        {tab !== 'mine' && (
          <View style={styles.tabs}>
            <Chip label="Усі" active={sport === 'all'} onPress={() => setSport('all')} />
            {(Object.keys(SPORTS) as Sport[]).map((s) => (
              <Chip key={s} label={`${SPORTS[s].icon} ${SPORTS[s].label}`} active={sport === s} onPress={() => setSport(s)} />
            ))}
          </View>
        )}

        {tab === 'line' && (
          <>
            <Text style={styles.hint}>
              Матчі симульовані й тривають 4 хвилини. Матчі України мають нижчі коефіцієнти, світові вищі.
            </Text>
            {upcoming.map((m) => (
              <Panel key={m.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <LeagueBadge m={m} />
                  <Text style={styles.kickoff}>⏱ {formatDuration(m.kickoff - now).replace(/^00:/, '')}</Text>
                </View>
                <Text style={styles.teams}>
                  {m.home} — {m.away}
                </Text>
                <View style={styles.oddsRow}>
                  {MARKETS.filter((k) => m.odds[k]).map((k) => {
                    const active = picks.some((p) => p.matchId === m.id && p.market === k);
                    return (
                      <Pressable key={k} onPress={() => toggle(m, k)} style={[styles.odd, active && styles.oddActive]}>
                        <Text style={[styles.oddLabel, active && styles.oddTextActive]}>
                          {SHORT[k]}
                          {k === 'over' || k === 'under' ? ` ${m.totalLine}` : ''}
                        </Text>
                        <Text style={[styles.oddValue, active && styles.oddTextActive]}>{m.odds[k]!.toFixed(2)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Panel>
            ))}
          </>
        )}

        {tab === 'live' && (
          <>
            {live.length === 0 && <Text style={styles.hint}>Зараз немає матчів. Найближчі стартують за хвилину-дві.</Text>}
            {live.map((m) => (
              <Panel key={m.id} style={styles.card}>
                <LeagueBadge m={m} />
                <Text style={styles.teams}>
                  {m.home} — {m.away}
                </Text>
                <Score m={m} now={now} />
              </Panel>
            ))}
          </>
        )}

        {tab === 'mine' && (
          <>
            {wallet.state.sportBets.length === 0 && <Text style={styles.hint}>Ти ще не робив ставок на спорт.</Text>}
            {wallet.state.sportBets.map((b) => (
              <Panel key={b.id} style={[styles.card, b.status === 'won' && styles.won, b.status === 'lost' && styles.lost]}>
                <View style={styles.cardHead}>
                  <Text style={styles.betType}>{b.picks.length > 1 ? `Експрес ×${b.picks.length}` : 'Ординар'}</Text>
                  <Text style={styles.betStatus}>
                    {b.status === 'open' ? '⏳ Очікує' : b.status === 'won' ? `✅ +${formatCoins(b.payout)}` : '❌ Програш'}
                  </Text>
                </View>
                {b.picks.map((p) => {
                  const m = getMatch(p.matchId);
                  const st = liveState(m, now);
                  const mark = st.finished ? (pickWins(m, p.market) ? '✅' : '❌') : st.started ? '🔴' : '🕒';
                  return (
                    <Text key={p.matchId} style={styles.pickLine}>
                      {mark} {m.home} — {m.away} ({st.started ? `${st.home}:${st.away}` : 'ще не почався'}) · {marketLabel(m, p.market)} @{p.odds.toFixed(2)}
                    </Text>
                  );
                })}
                <Text style={styles.betMoney}>
                  Ставка {formatCoins(b.stake)} · кф {b.odds.toFixed(2)} · можливий виграш {formatCoins(Math.floor(b.stake * b.odds))}
                </Text>
              </Panel>
            ))}
          </>
        )}
      </ScrollView>

      {validPicks.length > 0 && tab === 'line' && (
        <View style={styles.slip}>
          <View style={styles.cardHead}>
            <Text style={styles.slipTitle}>
              🎫 Купон: {validPicks.length > 1 ? `експрес з ${validPicks.length}` : 'ординар'} · кф {totalOdds.toFixed(2)}
            </Text>
            <Pressable onPress={() => setPicks([])}>
              <Text style={styles.clear}>Очистити</Text>
            </Pressable>
          </View>
          {validPicks.map((p) => {
            const m = getMatch(p.matchId);
            return (
              <Text key={p.matchId} style={styles.pickLine} numberOfLines={1}>
                {SPORTS[m.sport].icon} {m.home} — {m.away}: {marketLabel(m, p.market)} @{p.odds.toFixed(2)}
              </Text>
            );
          })}
          <BetSelector value={stake} onChange={setStake} />
          <BigButton
            label={`ПОСТАВИТИ · виграш ${formatCoins(Math.floor(stake * totalOdds))}`}
            onPress={place}
            disabled={wallet.state.balance < stake}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 10, width: '100%', maxWidth: 560, alignSelf: 'center' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  card: { gap: 6 },
  won: { borderColor: colors.green },
  lost: { opacity: 0.7 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  league: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  kickoff: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  teams: { color: colors.text, fontSize: 16, fontWeight: '800' },
  oddsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  odd: {
    flexGrow: 1,
    minWidth: 56,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  oddActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  oddLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  oddValue: { color: colors.text, fontSize: 15, fontWeight: '900' },
  oddTextActive: { color: colors.bg },
  live: { gap: 4 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { fontSize: 12 },
  liveTime: { color: colors.red, fontWeight: '900', flex: 1 },
  score: { color: colors.text, fontSize: 24, fontWeight: '900' },
  progress: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.red },
  event: { color: colors.muted, fontSize: 12 },
  betType: { color: colors.gold, fontWeight: '900' },
  betStatus: { color: colors.text, fontWeight: '800' },
  pickLine: { color: colors.text, fontSize: 12 },
  betMoney: { color: colors.muted, fontSize: 12 },
  slip: {
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderTopColor: colors.gold,
    padding: 12,
    gap: 8,
  },
  slipTitle: { color: colors.gold, fontWeight: '900', flex: 1 },
  clear: { color: colors.muted, fontWeight: '700' },
});
