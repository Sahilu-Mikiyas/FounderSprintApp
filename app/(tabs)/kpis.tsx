import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useSprintStore } from '../../store/sprintStore';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/colors';
import { AnimatedCard } from '../../components/AnimatedCard';
import { AnimatedProgressBar } from '../../components/AnimatedProgressBar';

interface KPI {
  id: string;
  week_number: number;
  category: string;
  name: string;
  target: number;
  current_value: number;
  unit: string;
}

const CATEGORIES = ['revenue', 'clients', 'content', 'development', 'learning', 'habit'] as const;
type Category = typeof CATEGORIES[number];

const CAT_COLORS: Record<Category, string> = {
  revenue: colors.revenue,
  clients: colors.clients,
  content: colors.content,
  development: colors.development,
  learning: colors.learning,
  habit: colors.habit,
};

const CAT_LABELS: Record<Category, string> = {
  revenue: 'Revenue',
  clients: 'Clients',
  content: 'Content',
  development: 'Development',
  learning: 'Learning',
  habit: 'Habit',
};

function getScoreColor(pct: number) {
  if (pct >= 80) return { bg: 'rgba(34,197,94,0.12)', text: colors.revenue, emoji: '🟢' };
  if (pct >= 50) return { bg: 'rgba(234,179,8,0.12)', text: colors.learning, emoji: '🟡' };
  return { bg: 'rgba(239,68,68,0.12)', text: '#EF4444', emoji: '🔴' };
}

function getCurrentWeek(startDate: string): number {
  const start = new Date(startDate).getTime();
  const now = new Date().getTime();
  return Math.max(1, Math.floor((now - start) / (7 * 86400000)) + 1);
}

export default function KpisScreen() {
  const { user } = useAuthStore();
  const { sprint } = useSprintStore();
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [totalWeeks, setTotalWeeks] = useState(8);
  const [showAdd, setShowAdd] = useState(false);
  const [showUpdate, setShowUpdate] = useState<KPI | null>(null);
  const [updateVal, setUpdateVal] = useState('');
  const [newKpi, setNewKpi] = useState({ name: '', category: 'revenue' as Category, target: '', unit: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sprint) {
      const weeks = Math.ceil(sprint.duration_days / 7);
      setTotalWeeks(weeks);
      setSelectedWeek(getCurrentWeek(sprint.start_date));
    }
  }, [sprint]);

  const fetchKpis = useCallback(async () => {
    if (!user || !sprint) return;
    setLoading(true);
    const { data } = await supabase
      .from('kpis')
      .select('*')
      .eq('user_id', user.id)
      .eq('sprint_id', sprint.id)
      .eq('week_number', selectedWeek)
      .order('category');
    setKpis(data ?? []);
    setLoading(false);
  }, [user, sprint, selectedWeek]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);

  async function addKpi() {
    if (!user || !sprint || !newKpi.name || !newKpi.target) return;
    setSaving(true);
    const { data, error } = await supabase.from('kpis').insert({
      user_id: user.id,
      sprint_id: sprint.id,
      week_number: selectedWeek,
      category: newKpi.category,
      name: newKpi.name,
      target: parseFloat(newKpi.target),
      current_value: 0,
      unit: newKpi.unit,
    }).select().single();
    if (!error && data) setKpis((prev) => [...prev, data]);
    setSaving(false);
    setShowAdd(false);
    setNewKpi({ name: '', category: 'revenue', target: '', unit: '' });
  }

  async function updateKpi() {
    if (!showUpdate) return;
    const val = parseFloat(updateVal);
    if (isNaN(val)) return;
    setSaving(true);
    await supabase.from('kpis').update({ current_value: val }).eq('id', showUpdate.id);
    setKpis((prev) => prev.map((k) => k.id === showUpdate.id ? { ...k, current_value: val } : k));
    setSaving(false);
    setShowUpdate(null);
  }

  async function deleteKpi(id: string) {
    Alert.alert('Delete KPI?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('kpis').delete().eq('id', id);
          setKpis((prev) => prev.filter((k) => k.id !== id));
        }
      },
    ]);
  }

  const weekTabs = Array.from({ length: Math.min(totalWeeks, 26) }, (_, i) => i + 1);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>📊 KPI Tracker</Text>
          <Text style={styles.subtitle}>Week {selectedWeek} · Sprint Day {sprint ? Math.max(1, Math.floor((new Date().getTime() - new Date(sprint.start_date).getTime()) / 86400000) + 1) : '—'}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Week selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.weekScroll} contentContainerStyle={styles.weekRow}>
        {weekTabs.map((w) => (
          <TouchableOpacity
            key={w}
            style={[styles.weekChip, selectedWeek === w && styles.weekChipActive]}
            onPress={() => setSelectedWeek(w)}
          >
            <Text style={[styles.weekChipText, selectedWeek === w && styles.weekChipTextActive]}>W{w}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.white} /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchKpis} tintColor={colors.white} />}
          contentContainerStyle={styles.listContent}
        >
          {kpis.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📊</Text>
              <Text style={styles.emptyTitle}>No KPIs for Week {selectedWeek}</Text>
              <Text style={styles.emptySub}>Tap + Add to set your weekly targets</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Week {selectedWeek} KPIs</Text>
              {kpis.map((kpi, idx) => {
                const pct = kpi.target > 0 ? Math.min(Math.round((kpi.current_value / kpi.target) * 100), 100) : 0;
                const col = CAT_COLORS[kpi.category as Category] ?? colors.grey600;
                return (
                  <AnimatedCard key={kpi.id} delay={idx * 60}>
                    <TouchableOpacity
                      style={styles.kpiCard}
                      onPress={() => { setShowUpdate(kpi); setUpdateVal(String(kpi.current_value)); }}
                      onLongPress={() => deleteKpi(kpi.id)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.kpiTop}>
                        <View>
                          <View style={styles.kpiCat}>
                            <View style={[styles.kpiDot, { backgroundColor: col }]} />
                            <Text style={[styles.kpiCatName, { color: col }]}>
                              {CAT_LABELS[kpi.category as Category] ?? kpi.category}
                            </Text>
                          </View>
                          <Text style={styles.kpiName}>{kpi.name}</Text>
                        </View>
                        <Text style={[styles.kpiPct, { color: col }]}>{pct}%</Text>
                      </View>
                      <AnimatedProgressBar pct={pct} color={col} height={4} delay={idx * 60 + 200} />
                      <View style={styles.kpiNums}>
                        <Text style={styles.kpiCurrent}>
                          {kpi.unit}{kpi.current_value.toLocaleString()} {kpi.unit ? '' : 'current'}
                        </Text>
                        <Text style={styles.kpiGoal}>
                          Goal: {kpi.unit}{kpi.target.toLocaleString()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </AnimatedCard>
                );
              })}

              {/* Scoreboard */}
              <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Weekly Scoreboard</Text>
              <View style={styles.scoreboard}>
                {kpis.map((kpi) => {
                  const pct = kpi.target > 0 ? Math.min(Math.round((kpi.current_value / kpi.target) * 100), 100) : 0;
                  const col = CAT_COLORS[kpi.category as Category] ?? colors.grey600;
                  const score = getScoreColor(pct);
                  return (
                    <View key={kpi.id} style={styles.scoreRow}>
                      <View style={styles.scoreCat}>
                        <View style={[styles.scoreDot, { backgroundColor: col }]} />
                        <Text style={styles.scoreName}>{kpi.name}</Text>
                      </View>
                      <View style={[styles.scoreBadge, { backgroundColor: score.bg }]}>
                        <Text style={[styles.scoreBadgeText, { color: score.text }]}>
                          {score.emoji} {pct}%
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Add KPI Modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setShowAdd(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add KPI — Week {selectedWeek}</Text>

            <Text style={styles.modalLabel}>KPI Name</Text>
            <TextInput
              style={styles.modalInput}
              value={newKpi.name}
              onChangeText={(v) => setNewKpi((p) => ({ ...p, name: v }))}
              placeholder="e.g. New Leads Contacted"
              placeholderTextColor="#333"
              autoFocus
            />

            <Text style={styles.modalLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.catRow}>
                {CATEGORIES.map((cat) => {
                  const active = newKpi.category === cat;
                  const col = CAT_COLORS[cat];
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.catChip, active && { backgroundColor: `${col}20`, borderColor: col }]}
                      onPress={() => setNewKpi((p) => ({ ...p, category: cat }))}
                    >
                      <Text style={[styles.catChipText, active && { color: col }]}>
                        {CAT_LABELS[cat]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.modalRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>Target</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newKpi.target}
                  onChangeText={(v) => setNewKpi((p) => ({ ...p, target: v }))}
                  placeholder="10"
                  placeholderTextColor="#333"
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalLabel}>Unit (optional)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newKpi.unit}
                  onChangeText={(v) => setNewKpi((p) => ({ ...p, unit: v }))}
                  placeholder="$, posts..."
                  placeholderTextColor="#333"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.modalSave, (!newKpi.name || !newKpi.target || saving) && { opacity: 0.4 }]}
              onPress={addKpi}
              disabled={!newKpi.name || !newKpi.target || saving}
            >
              {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.modalSaveText}>Add KPI</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Update value modal */}
      <Modal visible={!!showUpdate} transparent animationType="slide" onRequestClose={() => setShowUpdate(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setShowUpdate(null)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            {showUpdate && (
              <>
                <Text style={styles.modalTitle}>Update Progress</Text>
                <Text style={styles.modalSubtitle}>{showUpdate.name}</Text>
                <Text style={styles.modalLabel}>Current Value</Text>
                <TextInput
                  style={[styles.modalInput, { fontSize: 28, fontWeight: '800', textAlign: 'center' }]}
                  value={updateVal}
                  onChangeText={setUpdateVal}
                  keyboardType="numeric"
                  autoFocus
                  selectTextOnFocus
                />
                <Text style={styles.modalHint}>Goal: {showUpdate.unit}{showUpdate.target.toLocaleString()}</Text>
                <TouchableOpacity
                  style={[styles.modalSave, saving && { opacity: 0.6 }]}
                  onPress={updateKpi}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.modalSaveText}>Update</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: '#444', marginTop: 3 },
  addBtn: { backgroundColor: colors.white, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  addBtnText: { fontSize: 13, fontWeight: '700', color: colors.black },
  weekScroll: { maxHeight: 44 },
  weekRow: { paddingHorizontal: 22, gap: 6, alignItems: 'center' },
  weekChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e' },
  weekChipActive: { backgroundColor: colors.white },
  weekChipText: { fontSize: 12, fontWeight: '600', color: '#444' },
  weekChipTextActive: { color: colors.black },
  listContent: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 100, gap: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.white },
  emptySub: { fontSize: 13, color: colors.grey600, textAlign: 'center' },
  kpiCard: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 16, padding: 16 },
  kpiTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  kpiCat: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  kpiDot: { width: 8, height: 8, borderRadius: 4 },
  kpiCatName: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  kpiName: { fontSize: 14, fontWeight: '700', color: colors.white },
  kpiPct: { fontSize: 14, fontWeight: '700' },
  kpiTrack: { height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden', marginBottom: 10 },
  kpiFill: { height: '100%', borderRadius: 2 },
  kpiBarWrap: { marginBottom: 10 },
  kpiNums: { flexDirection: 'row', justifyContent: 'space-between' },
  kpiCurrent: { fontSize: 11, color: '#555' },
  kpiGoal: { fontSize: 11, color: '#333' },
  scoreboard: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 16, padding: 16, gap: 2 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#151515' },
  scoreCat: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  scoreDot: { width: 7, height: 7, borderRadius: 4 },
  scoreName: { fontSize: 13, fontWeight: '600', color: '#ccc' },
  scoreBadge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 8 },
  scoreBadgeText: { fontSize: 11, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 14 },
  modalHandle: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  modalSubtitle: { fontSize: 14, color: colors.grey600, marginTop: -8 },
  modalLabel: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1 },
  modalInput: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, fontSize: 15, color: colors.white, borderWidth: 1, borderColor: '#2a2a2a' },
  modalHint: { fontSize: 13, color: '#444', textAlign: 'center', marginTop: -6 },
  modalRow: { flexDirection: 'row', gap: 12 },
  catRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  catChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  catChipText: { fontSize: 12, fontWeight: '600', color: '#555' },
  modalSave: { height: 52, backgroundColor: colors.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: colors.black },
});
