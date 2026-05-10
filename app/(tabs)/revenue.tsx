import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useSprintStore } from '../../store/sprintStore';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/colors';
import { AnimatedCard } from '../../components/AnimatedCard';

const { width } = Dimensions.get('window');

interface RevenueEntry {
  id: string;
  amount: number;
  type: string;
  client_name: string | null;
  notes: string | null;
  date: string;
  created_at: string;
}

const TYPES = ['website', 'social_media', 'consulting', 'editing', 'ecommerce', 'freelance', 'other'] as const;
type RevenueType = typeof TYPES[number];

const TYPE_META: Record<RevenueType, { label: string; emoji: string; color: string }> = {
  website:      { label: 'Website',      emoji: '🌐', color: colors.clients },
  social_media: { label: 'Social Media', emoji: '📱', color: colors.content },
  consulting:   { label: 'Consulting',   emoji: '💼', color: colors.revenue },
  editing:      { label: 'Editing',      emoji: '✂️', color: colors.development },
  ecommerce:    { label: 'Ecommerce',    emoji: '🛍', color: colors.learning },
  freelance:    { label: 'Freelance',    emoji: '✍️', color: colors.habit },
  other:        { label: 'Other',        emoji: '📦', color: colors.grey600 },
};

function formatCurrency(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getWeekTotal(entries: RevenueEntry[]) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  return entries
    .filter((e) => new Date(e.date) >= weekStart)
    .reduce((s, e) => s + e.amount, 0);
}

function getMonthTotal(entries: RevenueEntry[]) {
  const now = new Date();
  return entries
    .filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + e.amount, 0);
}

function getTypeBreakdown(entries: RevenueEntry[]) {
  const totals: Partial<Record<RevenueType, number>> = {};
  entries.forEach((e) => {
    totals[e.type as RevenueType] = (totals[e.type as RevenueType] ?? 0) + e.amount;
  });
  return totals;
}

export default function RevenueScreen() {
  const { user } = useAuthStore();
  const { sprint } = useSprintStore();
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editEntry, setEditEntry] = useState<RevenueEntry | null>(null);
  const [form, setForm] = useState({ amount: '', type: 'consulting' as RevenueType, client_name: '', notes: '', date: new Date().toISOString().split('T')[0] });
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!user || !sprint) return;
    setLoading(true);
    const { data } = await supabase
      .from('revenue_entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('sprint_id', sprint.id)
      .order('date', { ascending: false });
    setEntries(data ?? []);
    setLoading(false);
  }, [user, sprint]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const sprintTotal = entries.reduce((s, e) => s + e.amount, 0);
  const revenueGoal = sprint?.revenue_goal ?? 0;
  const goalPct = revenueGoal > 0 ? Math.min(Math.round((sprintTotal / revenueGoal) * 100), 100) : 0;
  const weekTotal = getWeekTotal(entries);
  const monthTotal = getMonthTotal(entries);
  const typeBreakdown = getTypeBreakdown(entries);
  const maxBarVal = Math.max(...Object.values(typeBreakdown).map(Number), 1);

  function openAdd() {
    setEditEntry(null);
    setForm({ amount: '', type: 'consulting', client_name: '', notes: '', date: new Date().toISOString().split('T')[0] });
    setShowAdd(true);
  }

  function openEdit(entry: RevenueEntry) {
    setEditEntry(entry);
    setForm({
      amount: String(entry.amount),
      type: entry.type as RevenueType,
      client_name: entry.client_name ?? '',
      notes: entry.notes ?? '',
      date: entry.date,
    });
    setShowAdd(true);
  }

  async function saveEntry() {
    if (!user || !sprint || !form.amount) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      sprint_id: sprint.id,
      amount: parseFloat(form.amount),
      type: form.type,
      client_name: form.client_name || null,
      notes: form.notes || null,
      date: form.date,
    };

    if (editEntry) {
      const { data } = await supabase.from('revenue_entries').update(payload).eq('id', editEntry.id).select().single();
      if (data) setEntries((prev) => prev.map((e) => e.id === editEntry.id ? data : e));
    } else {
      const { data } = await supabase.from('revenue_entries').insert(payload).select().single();
      if (data) setEntries((prev) => [data, ...prev]);
    }
    setSaving(false);
    setShowAdd(false);
  }

  async function deleteEntry(id: string) {
    Alert.alert('Delete Entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('revenue_entries').delete().eq('id', id);
          setEntries((prev) => prev.filter((e) => e.id !== id));
          setShowAdd(false);
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>💰 Revenue</Text>
          <Text style={styles.subtitle}>Sprint · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Text style={styles.addBtnText}>+ Log</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.white} size="large" /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchEntries} tintColor={colors.white} />}
          contentContainerStyle={styles.listContent}
        >
          {/* Hero card */}
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Sprint Total</Text>
            <Text style={styles.heroAmount}>
              $<Text style={{ color: colors.revenue }}>{sprintTotal.toLocaleString()}</Text>
            </Text>
            {revenueGoal > 0 && (
              <Text style={styles.heroSub}>of ${revenueGoal.toLocaleString()} goal</Text>
            )}
            {revenueGoal > 0 && (
              <View style={styles.goalBarWrap}>
                <View style={styles.goalTrack}>
                  <View style={[styles.goalFill, { width: `${goalPct}%` }]} />
                </View>
                <View style={styles.goalLabels}>
                  <Text style={styles.goalLabel}>{goalPct}% of goal</Text>
                  <Text style={styles.goalLabel}>${(revenueGoal - sprintTotal).toLocaleString()} to go</Text>
                </View>
              </View>
            )}
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>${monthTotal.toLocaleString()}</Text>
              <Text style={styles.statLbl}>This Month</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>${weekTotal.toLocaleString()}</Text>
              <Text style={styles.statLbl}>This Week</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{entries.length}</Text>
              <Text style={styles.statLbl}>Transactions</Text>
            </View>
          </View>

          {/* Bar chart by type */}
          {entries.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartLabel}>Revenue by Type</Text>
              <View style={styles.bars}>
                {TYPES.map((type) => {
                  const val = typeBreakdown[type] ?? 0;
                  const pct = Math.round((val / maxBarVal) * 100);
                  const meta = TYPE_META[type];
                  return (
                    <View key={type} style={styles.barWrap}>
                      <View style={[styles.bar, { height: Math.max(pct * 0.8, val > 0 ? 4 : 0), backgroundColor: meta.color }]} />
                      <Text style={styles.barLbl}>{meta.emoji}</Text>
                    </View>
                  );
                })}
              </View>
              {/* Legend */}
              <View style={styles.legend}>
                {TYPES.filter((t) => (typeBreakdown[t] ?? 0) > 0).map((type) => {
                  const meta = TYPE_META[type];
                  return (
                    <View key={type} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
                      <Text style={styles.legendText}>{meta.label}: ${(typeBreakdown[type] ?? 0).toLocaleString()}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Entries list */}
          <Text style={styles.sectionTitle}>Recent Entries</Text>
          {entries.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💰</Text>
              <Text style={styles.emptyTitle}>No revenue logged yet</Text>
              <Text style={styles.emptySub}>Tap + Log to record your first payment</Text>
            </View>
          ) : (
            entries.map((entry, idx) => {
              const meta = TYPE_META[entry.type as RevenueType] ?? TYPE_META.other;
              return (
                <AnimatedCard key={entry.id} delay={idx * 40}>
                  <TouchableOpacity
                    style={styles.entryCard}
                    onPress={() => openEdit(entry)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.entryIcon, { backgroundColor: `${meta.color}15` }]}>
                      <Text style={styles.entryEmoji}>{meta.emoji}</Text>
                    </View>
                    <View style={styles.entryInfo}>
                      <Text style={styles.entryName}>{entry.client_name ?? meta.label}</Text>
                      <Text style={styles.entrySub}>{meta.label} · {formatDate(entry.date)}</Text>
                    </View>
                    <Text style={styles.entryAmount}>+${entry.amount.toLocaleString()}</Text>
                  </TouchableOpacity>
                </AnimatedCard>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Add / Edit Modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setShowAdd(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editEntry ? 'Edit Entry' : 'Log Revenue'}</Text>
              {editEntry && (
                <TouchableOpacity onPress={() => deleteEntry(editEntry.id)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              <View style={styles.formGap}>
                {/* Amount */}
                <View>
                  <Text style={styles.modalLabel}>Amount ($)</Text>
                  <TextInput
                    style={[styles.modalInput, { fontSize: 32, fontWeight: '900', textAlign: 'center', color: colors.revenue }]}
                    value={form.amount}
                    onChangeText={(v) => setForm((p) => ({ ...p, amount: v }))}
                    placeholder="0"
                    placeholderTextColor="#333"
                    keyboardType="numeric"
                    autoFocus
                    selectTextOnFocus
                  />
                </View>

                {/* Type */}
                <View>
                  <Text style={styles.modalLabel}>Type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.typeRow}>
                      {TYPES.map((t) => {
                        const meta = TYPE_META[t];
                        const active = form.type === t;
                        return (
                          <TouchableOpacity
                            key={t}
                            style={[styles.typeChip, active && { backgroundColor: `${meta.color}20`, borderColor: meta.color }]}
                            onPress={() => setForm((p) => ({ ...p, type: t }))}
                          >
                            <Text style={styles.typeChipEmoji}>{meta.emoji}</Text>
                            <Text style={[styles.typeChipText, active && { color: meta.color }]}>{meta.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>

                {/* Client */}
                <View>
                  <Text style={styles.modalLabel}>Client Name</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={form.client_name}
                    onChangeText={(v) => setForm((p) => ({ ...p, client_name: v }))}
                    placeholder="e.g. Acme Corp"
                    placeholderTextColor="#333"
                  />
                </View>

                {/* Date */}
                <View>
                  <Text style={styles.modalLabel}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={form.date}
                    onChangeText={(v) => setForm((p) => ({ ...p, date: v }))}
                    placeholder="2026-05-10"
                    placeholderTextColor="#333"
                  />
                </View>

                {/* Notes */}
                <View>
                  <Text style={styles.modalLabel}>Notes</Text>
                  <TextInput
                    style={[styles.modalInput, { minHeight: 70, textAlignVertical: 'top' }]}
                    value={form.notes}
                    onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))}
                    placeholder="Invoice #, project details..."
                    placeholderTextColor="#333"
                    multiline
                  />
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalSave, (!form.amount || saving) && { opacity: 0.4 }]}
              onPress={saveEntry}
              disabled={!form.amount || saving}
            >
              {saving
                ? <ActivityIndicator color={colors.black} />
                : <Text style={styles.modalSaveText}>{editEntry ? 'Save Changes' : 'Log Revenue 💰'}</Text>}
            </TouchableOpacity>
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
  listContent: { paddingHorizontal: 22, paddingBottom: 100, gap: 14 },
  heroCard: {
    backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#1e1e1e',
    borderRadius: 20, padding: 24,
  },
  heroLabel: { fontSize: 11, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
  heroAmount: { fontSize: 44, fontWeight: '900', color: colors.white, letterSpacing: -2 },
  heroSub: { fontSize: 12, color: '#444', marginTop: 4 },
  goalBarWrap: { marginTop: 16 },
  goalTrack: { height: 5, backgroundColor: '#1a1a1a', borderRadius: 3, overflow: 'hidden' },
  goalFill: { height: '100%', borderRadius: 3, backgroundColor: colors.revenue },
  goalLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  goalLabel: { fontSize: 11, color: '#444' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 14, padding: 14 },
  statVal: { fontSize: 18, fontWeight: '800', color: colors.white },
  statLbl: { fontSize: 10, color: '#444', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginTop: 3 },
  chartCard: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 16, padding: 18 },
  chartLabel: { fontSize: 11, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 8 },
  barWrap: { flex: 1, alignItems: 'center', gap: 6 },
  bar: { width: '100%', borderRadius: 4, minHeight: 0 },
  barLbl: { fontSize: 13 },
  legend: { marginTop: 14, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: '#666' },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5 },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.white },
  emptySub: { fontSize: 13, color: colors.grey600, textAlign: 'center' },
  entryCard: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  entryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  entryEmoji: { fontSize: 16 },
  entryInfo: { flex: 1 },
  entryName: { fontSize: 14, fontWeight: '600', color: colors.white },
  entrySub: { fontSize: 11, color: '#555', marginTop: 2 },
  entryAmount: { fontSize: 15, fontWeight: '800', color: colors.revenue },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 14 },
  modalHandle: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  deleteText: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  modalLabel: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  modalInput: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, fontSize: 15, color: colors.white, borderWidth: 1, borderColor: '#2a2a2a' },
  formGap: { gap: 14 },
  typeRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  typeChipEmoji: { fontSize: 14 },
  typeChipText: { fontSize: 12, fontWeight: '600', color: '#555' },
  modalSave: { height: 52, backgroundColor: colors.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: colors.black },
});
