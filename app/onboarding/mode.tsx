import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboardingStore } from '../../store/onboardingStore';
import { colors } from '../../lib/colors';

const MODES = [
  {
    id: 'custom' as const,
    icon: '✏️',
    name: 'Custom Build',
    desc: 'You design it from scratch. Your tasks, your goals, your structure.',
  },
  {
    id: 'prebuilt' as const,
    icon: '⚡',
    name: 'Pre-Built Sprint',
    desc: 'We generate a full plan based on your niche. Start in 60 seconds.',
  },
  {
    id: 'rotation' as const,
    icon: '🔄',
    name: 'Rotation Mode',
    desc: 'Set focus blocks that automatically cycle throughout your sprint.',
  },
];

export default function ModeScreen() {
  const router = useRouter();
  const { mode, setMode } = useOnboardingStore();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.step}>Step 1 of 3</Text>
          <Text style={styles.title}>How do you want{'\n'}to build?</Text>
          <Text style={styles.sub}>Choose the mode that fits how you work best</Text>
        </View>

        <View style={styles.cards}>
          {MODES.map((m) => {
            const selected = mode === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => setMode(m.id)}
                activeOpacity={0.8}
              >
                {selected && <View style={styles.check}><Text style={styles.checkMark}>✓</Text></View>}
                <Text style={styles.cardIcon}>{m.icon}</Text>
                <Text style={styles.cardName}>{m.name}</Text>
                <Text style={styles.cardDesc}>{m.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.footer}>
          <View style={styles.dots}>
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
          <TouchableOpacity
            style={[styles.btnPrimary, !mode && styles.btnDisabled]}
            onPress={() => {
              if (!mode) return;
              if (mode === 'prebuilt') {
                router.push('/onboarding/length');
              } else {
                router.push('/onboarding/plan');
              }
            }}
            disabled={!mode}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  inner: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32, gap: 28 },
  header: { gap: 8 },
  step: { fontSize: 11, fontWeight: '700', color: colors.grey600, textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 30, fontWeight: '900', color: colors.white, letterSpacing: -1, lineHeight: 36 },
  sub: { fontSize: 14, color: colors.grey600, lineHeight: 22 },
  cards: { gap: 10 },
  card: {
    backgroundColor: '#111', borderWidth: 1.5, borderColor: '#1e1e1e',
    borderRadius: 16, padding: 20, position: 'relative',
  },
  cardSelected: { borderColor: colors.white, backgroundColor: '#161616' },
  check: {
    position: 'absolute', top: 16, right: 16,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  checkMark: { fontSize: 11, fontWeight: '900', color: colors.black },
  cardIcon: { fontSize: 24, marginBottom: 10 },
  cardName: { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: 6 },
  cardDesc: { fontSize: 13, color: '#555', lineHeight: 20 },
  footer: { gap: 14 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#222' },
  dotActive: { width: 20, backgroundColor: colors.white },
  btnPrimary: {
    height: 54, backgroundColor: colors.white, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.3 },
  btnPrimaryText: { fontSize: 16, fontWeight: '700', color: colors.black },
});
