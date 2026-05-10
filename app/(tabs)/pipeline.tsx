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

interface Lead {
  id: string;
  name: string;
  business: string | null;
  service_type: string | null;
  value: number;
  status: string;
  follow_up_date: string | null;
  notes: string | null;
  created_at: string;
}

const STATUSES = ['new', 'contacted', 'interested', 'negotiating', 'closed', 'lost'] as const;
type LeadStatus = typeof STATUSES[number];

const STATUS_STYLES: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  new:         { label: 'New Lead',    color: colors.clients,     bg: 'rgba(59,130,246,0.12)' },
  contacted:   { label: 'Contacted',   color: colors.content,     bg: 'rgba(168,85,247,0.12)' },
  interested:  { label: 'Interested',  color: colors.learning,    bg: 'rgba(234,179,8,0.12)'  },
  negotiating: { label: 'Negotiating', color: colors.development, bg: 'rgba(249,115,22,0.12)' },
  closed:      { label: 'Closed ✓',   color: colors.revenue,     bg: 'rgba(34,197,94,0.12)'  },
  lost:        { label: 'Lost',        color: '#555',             bg: 'rgba(80,80,80,0.12)'   },
};

const FILTER_STATUSES = ['all', ...STATUSES] as const;

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function isFollowUpToday(date: string | null) {
  if (!date) return false;
  return date === new Date().toISOString().split('T')[0];
}

const EMPTY_LEAD = { name: '', business: '', service_type: '', value: '', status: 'new' as LeadStatus, follow_up_date: '', notes: '' };

export default function PipelineScreen() {
  const { user } = useAuthStore();
  const { sprint } = useSprintStore();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<typeof FILTER_STATUSES[number]>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [form, setForm] = useState(EMPTY_LEAD);
  const [saving, setSaving] = useState(false);

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setLeads(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const filtered = filter === 'all' ? leads : leads.filter((l) => l.status === filter);
  const followUpToday = leads.filter((l) => isFollowUpToday(l.follow_up_date));

  // Stats
  const totalValue = leads.filter((l) => l.status !== 'lost').reduce((s, l) => s + l.value, 0);
  const closedCount = leads.filter((l) => l.status === 'closed').length;
  const activeCount = leads.filter((l) => !['closed', 'lost'].includes(l.status)).length;

  function openEdit(lead: Lead) {
    setEditLead(lead);
    setForm({
      name: lead.name,
      business: lead.business ?? '',
      service_type: lead.service_type ?? '',
      value: String(lead.value),
      status: lead.status as LeadStatus,
      follow_up_date: lead.follow_up_date ?? '',
      notes: lead.notes ?? '',
    });
    setShowAdd(true);
  }

  function openAdd() {
    setEditLead(null);
    setForm(EMPTY_LEAD);
    setShowAdd(true);
  }

  async function saveLead() {
    if (!user || !form.name) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      sprint_id: sprint?.id ?? null,
      name: form.name,
      business: form.business || null,
      service_type: form.service_type || null,
      value: parseFloat(form.value) || 0,
      status: form.status,
      follow_up_date: form.follow_up_date || null,
      notes: form.notes || null,
    };

    if (editLead) {
      const { data } = await supabase.from('leads').update(payload).eq('id', editLead.id).select().single();
      if (data) setLeads((prev) => prev.map((l) => l.id === editLead.id ? data : l));
    } else {
      const { data } = await supabase.from('leads').insert(payload).select().single();
      if (data) setLeads((prev) => [data, ...prev]);
    }
    setSaving(false);
    setShowAdd(false);
  }

  async function deleteLead(id: string) {
    Alert.alert('Delete Lead?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('leads').delete().eq('id', id);
          setLeads((prev) => prev.filter((l) => l.id !== id));
          setShowAdd(false);
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>🔥 Pipeline</Text>
          <Text style={styles.subtitle}>{activeCount} active leads</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Text style={styles.addBtnText}>+ Lead</Text>
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statVal, { color: colors.revenue }]}>${totalValue.toLocaleString()}</Text>
          <Text style={styles.statLbl}>Pipeline Value</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{activeCount}</Text>
          <Text style={styles.statLbl}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statVal, { color: colors.revenue }]}>{closedCount}</Text>
          <Text style={styles.statLbl}>Closed</Text>
        </View>
      </View>

      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {FILTER_STATUSES.map((s) => {
          const active = filter === s;
          const style = s !== 'all' ? STATUS_STYLES[s] : null;
          return (
            <TouchableOpacity
              key={s}
              style={[styles.chip, active && (style ? { backgroundColor: style.bg, borderColor: style.color } : styles.chipActive)]}
              onPress={() => setFilter(s)}
            >
              <Text style={[styles.chipText, active && (style ? { color: style.color } : styles.chipTextActive)]}>
                {s === 'all' ? 'All' : STATUS_STYLES[s].label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.white} /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLeads} tintColor={colors.white} />}
          contentContainerStyle={styles.listContent}
        >
          {/* Follow up today */}
          {followUpToday.length > 0 && filter === 'all' && (
            <>
              <Text style={styles.sectionTitle}>Follow Up Today 🔔</Text>
              {followUpToday.map((lead) => <LeadCard key={lead.id} lead={lead} onPress={() => openEdit(lead)} urgent />)}
            </>
          )}

          {/* Lead list */}
          {filter !== 'all' || followUpToday.length > 0 ? (
            <Text style={styles.sectionTitle}>{filter === 'all' ? 'All Leads' : STATUS_STYLES[filter as LeadStatus].label}</Text>
          ) : null}

          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔥</Text>
              <Text style={styles.emptyTitle}>No leads yet</Text>
              <Text style={styles.emptySub}>Tap + Lead to add your first prospect</Text>
            </View>
          ) : (
            filtered.map((lead, idx) => (
              <AnimatedCard key={lead.id} delay={idx * 50}>
                <LeadCard lead={lead} onPress={() => openEdit(lead)} />
              </AnimatedCard>
            ))
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
              <Text style={styles.modalTitle}>{editLead ? 'Edit Lead' : 'New Lead'}</Text>
              {editLead && (
                <TouchableOpacity onPress={() => deleteLead(editLead.id)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              <View style={styles.formGap}>
                <Field label="Name *" value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="John Smith" />
                <Field label="Business" value={form.business} onChangeText={(v) => setForm((p) => ({ ...p, business: v }))} placeholder="Acme Corp" />
                <Field label="Service Type" value={form.service_type} onChangeText={(v) => setForm((p) => ({ ...p, service_type: v }))} placeholder="Website, Consulting..." />
                <Field label="Value ($)" value={form.value} onChangeText={(v) => setForm((p) => ({ ...p, value: v }))} placeholder="1200" keyboardType="numeric" />
                <Field label="Follow-up Date (YYYY-MM-DD)" value={form.follow_up_date} onChangeText={(v) => setForm((p) => ({ ...p, follow_up_date: v }))} placeholder="2026-05-20" />

                <Text style={styles.modalLabel}>Status</Text>
                <View style={styles.statusGrid}>
                  {STATUSES.map((s) => {
                    const st = STATUS_STYLES[s];
                    const active = form.status === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[styles.statusBtn, active && { backgroundColor: st.bg, borderColor: st.color }]}
                        onPress={() => setForm((p) => ({ ...p, status: s }))}
                      >
                        <Text style={[styles.statusBtnText, active && { color: st.color }]}>{st.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Field label="Notes" value={form.notes} onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))} placeholder="Any context..." multiline />
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalSave, (!form.name || saving) && { opacity: 0.4 }]}
              onPress={saveLead}
              disabled={!form.name || saving}
            >
              {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.modalSaveText}>{editLead ? 'Save Changes' : 'Add Lead'}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function LeadCard({ lead, onPress, urgent }: { lead: Lead; onPress: () => void; urgent?: boolean }) {
  const st = STATUS_STYLES[lead.status as LeadStatus] ?? STATUS_STYLES.new;
  return (
    <TouchableOpacity
      style={[styles.leadCard, urgent && styles.leadCardUrgent]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.avatar, { backgroundColor: `${st.color}15` }]}>
        <Text style={[styles.avatarText, { color: st.color }]}>{getInitials(lead.name)}</Text>
      </View>
      <View style={styles.leadInfo}>
        <Text style={styles.leadName}>{lead.name}</Text>
        <Text style={styles.leadBiz}>{lead.business ?? ''}{lead.service_type ? ` · ${lead.service_type}` : ''}</Text>
      </View>
      <View style={styles.leadRight}>
        <Text style={[styles.leadVal, { color: colors.revenue }]}>${lead.value.toLocaleString()}</Text>
        <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
          <Text style={[styles.statusBadgeText, { color: st.color }]}>{st.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: import('react-native').KeyboardTypeOptions; multiline?: boolean;
}) {
  return (
    <View>
      <Text style={styles.modalLabel}>{label}</Text>
      <TextInput
        style={[styles.modalInput, multiline && { minHeight: 80, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#333"
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
      />
    </View>
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
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 22, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 14, padding: 14 },
  statVal: { fontSize: 17, fontWeight: '800', color: colors.white },
  statLbl: { fontSize: 10, color: '#444', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginTop: 3 },
  filterScroll: { maxHeight: 44 },
  filterRow: { paddingHorizontal: 22, gap: 6, alignItems: 'center' },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e' },
  chipActive: { backgroundColor: colors.white, borderColor: colors.white },
  chipText: { fontSize: 12, fontWeight: '600', color: '#444' },
  chipTextActive: { color: colors.black },
  listContent: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 100, gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.white },
  emptySub: { fontSize: 13, color: colors.grey600, textAlign: 'center' },
  leadCard: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  leadCardUrgent: { borderColor: '#2a1a1a', backgroundColor: '#110808' },
  avatar: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 14, fontWeight: '800' },
  leadInfo: { flex: 1 },
  leadName: { fontSize: 14, fontWeight: '700', color: colors.white },
  leadBiz: { fontSize: 12, color: '#555', marginTop: 2 },
  leadRight: { alignItems: 'flex-end', gap: 5 },
  leadVal: { fontSize: 13, fontWeight: '700' },
  statusBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
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
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  statusBtnText: { fontSize: 12, fontWeight: '600', color: '#555' },
  modalSave: { height: 52, backgroundColor: colors.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: colors.black },
});
