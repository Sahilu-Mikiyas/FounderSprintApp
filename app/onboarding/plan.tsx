import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboardingStore, PREBUILT_DAY_TYPES } from '../../store/onboardingStore';
import { colors } from '../../lib/colors';

const ALL_BLOCKS = [
  { id: 'deep_work', emoji: '🎯', label: 'Deep Work', desc: 'Long focus sessions on your core product or service' },
  { id: 'outreach', emoji: '📨', label: 'Outreach & Sales', desc: 'Client prospecting, DMs, calls & follow-ups' },
  { id: 'content', emoji: '🎬', label: 'Content Creation', desc: 'Videos, posts, newsletters & social media' },
  { id: 'review', emoji: '📊', label: 'Review & Planning', desc: 'Weekly analysis, KPIs & next-week prep' },
  { id: 'learning', emoji: '📚', label: 'Learning', desc: 'Courses, books & skill development' },
  { id: 'admin', emoji: '🗂️', label: 'Admin & Ops', desc: 'Invoices, emails & business housekeeping' },
];

export default function PlanScreen() {
  const router = useRouter();
  const { mode, setDayTypes } = useOnboardingStore();

  // Rotation starts with prebuilt blocks selected; custom starts empty
  const initialSelected = mode === 'rotation'
    ? [...new Set(PREBUILT_DAY_TYPES)]
    : [];

  const [selected, setSelected] = useState<string[]>(initialSelected);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleContinue = () => {
    // Build a rotation pattern: repeat deep_work more if selected, others once
    const types: string[] = [];
    if (selected.includes('deep_work')) {
      types.push('deep_work', 'deep_work');
    }
    selected.filter((s) => s !== 'deep_work').forEach((s) => types.push(s));
    if (selected.includes('deep_work')) {
      types.push('deep_work');
    }
    // Fallback if nothing selected
    setDayTypes(types.length > 0 ? types : PREBUILT_DAY_TYPES);
    router.push('/onboarding/length');
  };

  const isRotation = mode === 'rotation';
  const title = isRotation
    ? 'Customise your\nrotation blocks'
    : 'Choose your\nfocus blocks';
  const sub = isRotation
    ? 'These are the prebuilt blocks. Deselect any you don\'t want and keep the rest.'
    : 'Pick the types of work days you want in your sprint plan.';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.step}>Step 2 of 4</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{sub}</Text>
        </View>

        <View style={styles.blocks}>
          {ALL_BLOCKS.map((b) => {
            const on = selected.includes(b.id);
            return (
              <TouchableOpacity
                key={b.id}
                style={[styles.block, on && styles.blockOn]}
                onPress={() => toggle(b.id)}
                activeOpacity={0.8}
              >
                <View style={styles.blockLeft}>
                  <Text style={styles.blockEmoji}>{b.emoji}</Text>
                  <View>
                    <Text style={styles.blockLabel}>{b.label}</Text>
                    <Text style={styles.blockDesc}>{b.desc}</Text>
                  </View>
                </View>
                <View style={[styles.check, on && styles.checkOn]}>
                  {on && <Text style={styles.checkMark}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {selected.length === 0 && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>Select at least one focus block to continue</Text>
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.dots}>
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
          <TouchableOpacity
            style={[styles.btn, selected.length === 0 && styles.btnDisabled]}
            onPress={handleContinue}
            disabled={selected.length === 0}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  inner: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, gap: 24 },
  back: { marginBottom: 8 },
  backText: { fontSize: 14, fontWeight: '600', color: colors.grey600 },
  header: { gap: 8 },
  step: { fontSize: 11, fontWeight: '700', color: colors.grey600, textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: '900', color: colors.white, letterSpacing: -1, lineHeight: 34 },
  sub: { fontSize: 13, color: colors.grey600, lineHeight: 20 },
  blocks: { gap: 8 },
  block: {
    backgroundColor: '#111', borderWidth: 1.5, borderColor: '#1e1e1e',
    borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  blockOn: { borderColor: colors.white, backgroundColor: '#161616' },
  blockLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  blockEmoji: { fontSize: 22 },
  blockLabel: { fontSize: 15, fontWeight: '700', color: colors.white, marginBottom: 2 },
  blockDesc: { fontSize: 12, color: '#555', lineHeight: 17, maxWidth: 220 },
  check: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  checkOn: { backgroundColor: colors.white, borderColor: colors.white },
  checkMark: { fontSize: 11, fontWeight: '900', color: colors.black },
  hint: { alignItems: 'center' },
  hintText: { fontSize: 12, color: '#444', textAlign: 'center' },
  footer: { gap: 14 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#222' },
  dotActive: { width: 20, backgroundColor: colors.white },
  btn: {
    height: 54, backgroundColor: colors.white, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.3 },
  btnText: { fontSize: 16, fontWeight: '700', color: colors.black },
});
