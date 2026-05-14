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
  website:      { label: 'Website',      emoji: '🌐', color: '#3B82F6' },
  social_media: { label: 'Social Media', emoji: '📱', color: '#EC4899' },
  consulting:   { label: 'Consulting',   emoji: '💼', color: '#F59E0B' },
  editing:      { label: 'Editing',      emoji: '✂️', color: '#14B8A6' },
  ecommerce:    { label: 'Ecommerce',    emoji: '🛍', color: '#8B5CF6' },
  freelance:    { label: 'Freelance',    emoji: '✍️', color: colors.revenue },
  other:        { label: 'Other',        emoji: '📦', color: '#64748B' },
};

function fmt(n: number) {
  return `$${n.toLocaleString()}`;
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getWeekTotal(entries: RevenueEntry[]) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  return entries.filter((e) => new Date(e.date + 'T00:00:00') >= weekStart).reduce((s, e) => s + e.amount, 0);
}

function getMonthTotal(entries: RevenueEntry[]) {
  const now = new Date();
  return entries
    .filter((e) => {
      const d = new Date(e.date + 'T00:00:00');
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + e.amount, 0);
}

function getTypeBreakdown(entries: RevenueEntry[]): Partial<Record<RevenueType, number>> {
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
  const [form, setForm] = useState({
    amount: '',
    type: 'consulting' as RevenueType,
    client_name: '',
    notes: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!user || !sprint) { setLoading(false); return; }
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
  const remaining = Math.max(0, revenueGoal - sprintTotal);
  const weekTotal = getWeekTotal(entries);
  const monthTotal = getMonthTotal(entries);
  const typeBreakdown = getTypeBreakdown(entries);
  const maxTypeVal = Math.max(...Object.values(typeBreakdown).map(Number), 1);
  const activeTypes = TYPES.filter((t) => (typeBreakdown[t] ?? 0) > 0);

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
      if (data) setEntries((prev) => [data, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
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

  if (!sprint) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>💰</Text>
          <Text style={styles.emptyTitle}>No active sprint</Text>
          <Text style={styles.emptySub}>Start a sprint to track your revenue</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>💰 Revenue</Text>
          <Text style={styles.subtitle}>{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
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
          {/* ── Hero card ── */}
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Sprint Revenue</Text>
            <Text style={styles.heroAmount}>
              $<Text style={{ color: colors.revenue }}>{sprintTotal.toLocaleString()}</Text>
            </Text>
            {revenueGoal > 0 && (
              <>
                <Text style={styles.heroSub}>of {fmt(revenueGoal)} goal</Text>
                <View style={styles.heroBarWrap}>
                  <AnimatedProgressBar
                    pct={goalPct}
                    color={goalPct >= 100 ? colors.revenue : sprintTotal / revenueGoal >= 0.5 ? colors.revenue : '#F97316'}
                    height={6}
                    delay={300}
                  />
                </View>
                <View style={styles.heroMeta}>
                  <Text style={styles.heroMetaText}>{goalPct}% of goal</Text>
                  {remaining > 0 && (
                    <Text style={styles.heroMetaText}>{fmt(remaining)} to go</Text>
                  )}
                  {remaining === 0 && (
                    <Text style={[styles.heroMetaText, { color: colors.revenue }]}>🎉 Goal reached!</Text>
                  )}
                </View>
              </>
            )}
          </View>

          {/* ── Stats row ── */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{fmt(monthTotal)}</Text>
              <Text style={styles.statLbl}>This Month</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{fmt(weekTotal)}</Text>
              <Text style={styles.statLbl}>This Week</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{entries.length}</Text>
              <Text style={styles.statLbl}>Transactions</Text>
            </View>
          </View>

          {/* ── Type breakdown (horizontal bars) ── */}
          {activeTypes.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Revenue by Type</Text>
              <View style={styles.chartRows}>
                {activeTypes.map((type, i) => {
                  const meta = TYPE_META[type];
                  const val = typeBreakdown[type] ?? 0;
                  const pct = Math.round((val / maxTypeVal) * 100);
                  return (
                    <View key={type} style={styles.chartRow}>
                      <Text style={styles.chartEmoji}>{meta.emoji}</Text>
                      <View style={styles.chartBarWrap}>
                        <AnimatedProgressBar pct={pct} color={meta.color} height={6} delay={i * 80 + 200} />
                      </View>
                      <Text style={[styles.chartVal, { color: meta.color }]}>{fmt(val)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Entries list ── */}
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
                    onLongPress={() => deleteEntry(entry.id)}
                    delayLongPress={450}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.entryIcon, { backgroundColor: `${meta.color}15` }]}>
                      <Text style={styles.entryEmoji}>{meta.emoji}</Text>
                    </View>
                    <View style={styles.entryInfo}>
                      <Text style={styles.entryName}>{entry.client_name || meta.label}</Text>
                      <Text style={styles.entrySub}>{meta.label} · {fmtDate(entry.date)}</Text>
                      {entry.notes ? (
                        <Text style={styles.entryNotes} numberOfLines={1}>{entry.notes}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.entryAmount}>+{fmt(entry.amount)}</Text>
                  </TouchableOpacity>
                </AnimatedCard>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setShowAdd(false)} activeOpacity={1} />
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
                    placeholder={new Date().toISOString().split('T')[0]}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  header: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: '#444', marginTop: 3 },
  addBtn: { backgroundColor: colors.white, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  addBtnText: { fontSize: 13, fontWeight: '700', color: colors.black },
  listContent: { paddingHorizontal: 22, paddingBottom: 100, gap: 14 },

  heroCard: { backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#1e1e1e', borderRadius: 20, padding: 24 },
  heroLabel: { fontSize: 11, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
  heroAmount: { fontSize: 44, fontWeight: '900', color: colors.white, letterSpacing: -2 },
  heroSub: { fontSize: 12, color: '#444', marginTop: 4, marginBottom: 14 },
  heroBarWrap: { marginBottom: 8 },
  heroMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  heroMetaText: { fontSize: 11, color: '#444', fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 14, padding: 14 },
  statVal: { fontSize: 16, fontWeight: '800', color: colors.white },
  statLbl: { fontSize: 10, color: '#444', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginTop: 3 },

  chartCard: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 16, padding: 18, gap: 14 },
  chartTitle: { fontSize: 11, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  chartRows: { gap: 12 },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chartEmoji: { fontSize: 14, width: 20, textAlign: 'center' },
  chartBarWrap: { flex: 1 },
  chartVal: { fontSize: 12, fontWeight: '700', width: 68, textAlign: 'right' },

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
  entryNotes: { fontSize: 11, color: '#3a3a3a', marginTop: 2, fontStyle: 'italic' },
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
