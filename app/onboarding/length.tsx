import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboardingStore } from '../../store/onboardingStore';
import { colors } from '../../lib/colors';

const LENGTHS = [
  { days: 30, label: '30 Days', sub: 'Quick Win Sprint' },
  { days: 60, label: '60 Days', sub: 'Foundation Sprint' },
  { days: 90, label: '90 Days', sub: 'Growth Sprint' },
  { days: 120, label: '120 Days', sub: 'Momentum Sprint' },
  { days: 180, label: '6 Months', sub: 'Full Build Sprint' },
];

export default function LengthScreen() {
  const router = useRouter();
  const { durationDays, setDuration } = useOnboardingStore();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.step}>Step 2 of 3</Text>
          <Text style={styles.title}>How long is{'\n'}your sprint?</Text>
          <Text style={styles.sub}>You can extend or restart at any time</Text>
        </View>

        <View style={styles.options}>
          {LENGTHS.map((l) => {
            const selected = durationDays === l.days;
            return (
              <TouchableOpacity
                key={l.days}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => setDuration(l.days)}
                activeOpacity={0.8}
              >
                <View>
                  <Text style={styles.optionLabel}>{l.label}</Text>
                  <Text style={styles.optionSub}>{l.sub}</Text>
                </View>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <Text style={styles.radioMark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.footer}>
          <View style={styles.dots}>
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
          </View>
          <TouchableOpacity
            style={[styles.btnPrimary, !durationDays && styles.btnDisabled]}
            onPress={() => durationDays && router.push('/onboarding/goal')}
            disabled={!durationDays}
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
  inner: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, gap: 28 },
  back: { marginBottom: 8 },
  backText: { fontSize: 14, fontWeight: '600', color: colors.grey600 },
  header: { gap: 8 },
  step: { fontSize: 11, fontWeight: '700', color: colors.grey600, textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 30, fontWeight: '900', color: colors.white, letterSpacing: -1, lineHeight: 36 },
  sub: { fontSize: 14, color: colors.grey600, lineHeight: 22 },
  options: { gap: 8 },
  option: {
    backgroundColor: '#111', borderWidth: 1.5, borderColor: '#1e1e1e',
    borderRadius: 14, padding: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  optionSelected: { borderColor: colors.white, backgroundColor: '#161616' },
  optionLabel: { fontSize: 16, fontWeight: '700', color: colors.white },
  optionSub: { fontSize: 12, color: '#555', marginTop: 3 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { backgroundColor: colors.white, borderColor: colors.white },
  radioMark: { fontSize: 10, fontWeight: '900', color: colors.black },
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
