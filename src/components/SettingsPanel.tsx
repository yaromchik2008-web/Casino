import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Settings, setSetting, useSettings } from '../audio/sound';
import { colors } from '../theme';
import { Panel } from './ui';

const ROWS: { key: keyof Settings; label: string; icon: string }[] = [
  { key: 'music', label: 'Музика', icon: '🎵' },
  { key: 'sfx', label: 'Звукові ефекти', icon: '🔊' },
  { key: 'vibration', label: 'Вібрація', icon: '📳' },
  { key: 'fastSpin', label: 'Швидкий оберт', icon: '⚡' },
  { key: 'breakReminder', label: 'Нагадування про перерву (щогодини)', icon: '⏰' },
];

export function SettingsPanel() {
  const settings = useSettings();
  return (
    <Panel style={styles.panel}>
      <Text style={styles.title}>Налаштування</Text>
      {ROWS.map((r) => {
        const on = settings[r.key];
        return (
          <Pressable key={r.key} style={styles.row} onPress={() => setSetting(r.key, !on)}>
            <Text style={styles.label}>
              {r.icon} {r.label}
            </Text>
            <View style={[styles.toggle, on && styles.toggleOn]}>
              <View style={[styles.knob, on && styles.knobOn]} />
            </View>
          </Pressable>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  label: { color: colors.text, fontSize: 14, flex: 1 },
  toggle: { width: 46, height: 26, borderRadius: 13, backgroundColor: colors.surfaceAlt, padding: 3, borderWidth: 1, borderColor: colors.border },
  toggleOn: { backgroundColor: colors.green },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' },
  knobOn: { transform: [{ translateX: 20 }] },
});
