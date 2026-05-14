import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { CountdownTimer } from '../../components/CountdownTimer';
import { AnimatedCard } from '../../components/AnimatedCard';
import { AnimatedProgressBar } from '../../components/AnimatedProgressBar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useSprintStore } from '../../store/sprintStore';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/colors';

interface Goal {
  id: string;
  name: string;
  category: string;
  deadline: string;
  financial_target: number | null;
  current_amount: number;
  motivation: string | null;
  is_pinned: boolean;
  status: string;
  created_at: string;
}

interface Milestone {
  id: string;
  goal_id: string;
  title: string;
  target_date: string | null;
  is_complete: boolean;
  sort_order: number;
}

const CATEGORIES = ['purchase', 'revenue', 'lifestyle', 'travel', 'health', 'business', 'other'] as const;
type GoalCategory = typeof CATEGORIES[number];

const CAT_META: Record<GoalCategory, { label: string; emoji: string; color: string }> = {
  purchase:  { label: 'Purchase',  emoji: '🛍', color: colors.fyp },
  revenue:   { label: 'Revenue',   emoji: '💰', color: colors.revenue },
  lifestyle: { label: 'Lifestyle', emoji: '✨', color: colors.content },
  travel:    { label: 'Travel',    emoji: '✈️', color: colors.clients },
  health:    { label: 'Health',    emoji: '💪', color: colors.habit },
  business:  { label: 'Business',  emoji: '🚀', color: colors.development },
  other:     { label: 'Other',     emoji: '🎯', color: colors.grey600 },
};

function daysLeft(deadline: string) {
  const diff = new Date(deadline + 'T00:00:00').getTime() - new Date().getTime();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function formatDeadline(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getProgress(goal: Goal) {
  if (!goal.financial_target || goal.financial_target === 0) return 0;
  return Math.min(Math.round((goal.current_amount / goal.financial_target) * 100), 100);
}

export default function GoalsScreen() {
  const { user } = useAuthStore();
  const { sprint } = useSprintStore();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<Record<string, Milestone[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState({
    name: '', category: 'purchase' as GoalCategory,
    deadline: '', financial_target: '', motivation: '', is_pinned: false,
  });
  const [newMilestone, setNewMilestone] = useState('');
  const [saving, setSaving] = useState(false);
  const [updateAmount, setUpdateAmount] = useState('');
  const [showUpdateAmount, setShowUpdateAmount] = useState(false);

  const fetchGoals = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .order('is_pinned', { ascending: false })
      .order('deadline');
    setGoals(data ?? []);

    // Fetch milestones for all goals
    if (data && data.length > 0) {
      const ids = data.map((g) => g.id);
      const { data: ms } = await supabase
        .from('goal_milestones')
        .select('*')
        .in('goal_id', ids)
        .order('sort_order');
      const grouped: Record<string, Milestone[]> = {};
      ms?.forEach((m) => {
        if (!grouped[m.goal_id]) grouped[m.goal_id] = [];
        grouped[m.goal_id].push(m);
      });
      setMilestones(grouped);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);


  function openAdd(goal?: Goal) {
    setEditGoal(goal ?? null);
    setForm(goal ? {
      name: goal.name, category: goal.category as GoalCategory,
      deadline: goal.deadline, financial_target: String(goal.financial_target ?? ''),
      motivation: goal.motivation ?? '', is_pinned: goal.is_pinned,
    } : { name: '', category: 'purchase', deadline: '', financial_target: '', motivation: '', is_pinned: false });
    setShowAdd(true);
  }

  async function saveGoal() {
    if (!user || !form.name || !form.deadline) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      sprint_id: sprint?.id ?? null,
      name: form.name,
      category: form.category,
      deadline: form.deadline,
      financial_target: form.financial_target ? parseFloat(form.financial_target) : null,
      motivation: form.motivation || null,
      is_pinned: form.is_pinned,
      status: 'active',
    };

    // Enforce only 1 pinned goal at a time
    if (form.is_pinned) {
      await supabase.from('goals').update({ is_pinned: false }).eq('user_id', user.id).neq('id', editGoal?.id ?? '00000000-0000-0000-0000-000000000000');
      setGoals((prev) => prev.map((g) => ({ ...g, is_pinned: false })));
    }

    if (editGoal) {
      const { data } = await supabase.from('goals').update(payload).eq('id', editGoal.id).select().single();
      if (data) setGoals((prev) => prev.map((g) => g.id === editGoal.id ? data : g));
    } else {
      const { data } = await supabase.from('goals').insert(payload).select().single();
      if (data) setGoals((prev) => [data, ...prev]);
    }
    setSaving(false);
    setShowAdd(false);
  }

  async function deleteGoal(id: string) {
    Alert.alert('Delete Goal?', 'All milestones will also be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('goals').delete().eq('id', id);
          setGoals((prev) => prev.filter((g) => g.id !== id));
          setShowAdd(false); setShowDetail(false);
        },
      },
    ]);
  }

  async function markGoalComplete(id: string) {
    await supabase.from('goals').update({ status: 'completed' }).eq('id', id);
    setGoals((prev) => prev.map((g) => g.id === id ? { ...g, status: 'completed' } : g));
    setShowDetail(false);
  }

  async function addMilestone(goalId: string) {
    if (!user || !newMilestone.trim()) return;
    const { data } = await supabase.from('goal_milestones').insert({
      goal_id: goalId, user_id: user.id, title: newMilestone.trim(),
      sort_order: (milestones[goalId]?.length ?? 0),
    }).select().single();
    if (data) {
      setMilestones((prev) => ({ ...prev, [goalId]: [...(prev[goalId] ?? []), data] }));
    }
    setNewMilestone('');
  }

  async function toggleMilestone(milestone: Milestone) {
    const updated = !milestone.is_complete;
    await supabase.from('goal_milestones').update({ is_complete: updated }).eq('id', milestone.id);
    setMilestones((prev) => ({
      ...prev,
      [milestone.goal_id]: prev[milestone.goal_id].map((m) =>
        m.id === milestone.id ? { ...m, is_complete: updated } : m
      ),
    }));
  }

  async function updateGoalAmount() {
    if (!selectedGoal) return;
    const val = parseFloat(updateAmount);
    if (isNaN(val)) return;
    await supabase.from('goals').update({ current_amount: val }).eq('id', selectedGoal.id);
    setGoals((prev) => prev.map((g) => g.id === selectedGoal.id ? { ...g, current_amount: val } : g));
    setSelectedGoal((prev) => prev ? { ...prev, current_amount: val } : null);
    setShowUpdateAmount(false);
  }

  const pinned = goals.find((g) => g.is_pinned && g.status === 'active');
  const active = goals.filter((g) => g.status === 'active' && !g.is_pinned);
  const completed = goals.filter((g) => g.status === 'completed');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>🎯 Goals</Text>
          <Text style={styles.subtitle}>{goals.filter(g => g.status === 'active').length} active · {completed.length} completed</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => openAdd()}>
          <Text style={styles.addBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.white} size="large" /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchGoals} tintColor={colors.white} />}
          contentContainerStyle={styles.listContent}
        >
          {/* Pinned hero goal */}
          {pinned && (
            <>
              <Text style={styles.sectionTitle}>Pinned Goal</Text>
              <TouchableOpacity
                style={styles.heroCard}
                onPress={() => { setSelectedGoal(pinned); setShowDetail(true); }}
                activeOpacity={0.85}
              >
                <View style={styles.heroGlow} />
                <View style={[styles.heroCatTag, { backgroundColor: `${CAT_META[pinned.category as GoalCategory].color}15` }]}>
                  <Text style={[styles.heroCatText, { color: CAT_META[pinned.category as GoalCategory].color }]}>
                    🏆 {CAT_META[pinned.category as GoalCategory].label}
                  </Text>
                </View>
                <Text style={styles.heroName}>{pinned.name}</Text>
                <Text style={styles.heroDeadline}>📅 {formatDeadline(pinned.deadline)}</Text>

                {/* Animated Countdown */}
                <View style={styles.countdownRow}>
                  <CountdownTimer
                    deadline={pinned.deadline}
                    accentColor={CAT_META[pinned.category as GoalCategory].color}
                  />
                </View>

                {/* Animated Progress */}
                {pinned.financial_target && (
                  <View style={styles.heroProgress}>
                    <View style={styles.heroProgressLabels}>
                      <Text style={styles.heroProgressLeft}>
                        ${pinned.current_amount.toLocaleString()} of ${pinned.financial_target.toLocaleString()}
                      </Text>
                      <Text style={[styles.heroProgressRight, { color: CAT_META[pinned.category as GoalCategory].color }]}>
                        {getProgress(pinned)}%
                      </Text>
                    </View>
                    <AnimatedProgressBar
                      pct={getProgress(pinned)}
                      color={CAT_META[pinned.category as GoalCategory].color}
                      height={5}
                      delay={400}
                    />
                  </View>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Active goals */}
          {active.length > 0 && <Text style={styles.sectionTitle}>All Goals</Text>}
          {active.map((goal) => {
            const meta = CAT_META[goal.category as GoalCategory] ?? CAT_META.other;
            const pct = getProgress(goal);
            const dl = daysLeft(goal.deadline);
            return (
              <TouchableOpacity
                key={goal.id}
                style={styles.goalCard}
                onPress={() => { setSelectedGoal(goal); setShowDetail(true); }}
                activeOpacity={0.8}
              >
                <View style={[styles.goalAccent, { backgroundColor: meta.color }]} />
                <View style={styles.goalCardInner}>
                  <View style={styles.goalCardTop}>
                    <View style={styles.goalCardLeft}>
                      <Text style={[styles.goalCatLabel, { color: meta.color }]}>{meta.emoji} {meta.label}</Text>
                      <Text style={styles.goalName}>{goal.name}</Text>
                      <Text style={styles.goalDeadline}>📅 {formatDeadline(goal.deadline)}</Text>
                    </View>
                    <View style={styles.goalCardRight}>
                      <Text style={[styles.daysLeft, { color: meta.color }]}>{dl}d</Text>
                      <Text style={styles.daysLbl}>left</Text>
                    </View>
                  </View>
                  <View style={styles.goalCardBottom}>
                    {goal.financial_target ? (
                      <View style={styles.goalMiniBar}>
                        <View style={styles.goalMiniLabels}>
                          <Text style={styles.goalMiniLeft}>${goal.current_amount.toLocaleString()} / ${goal.financial_target.toLocaleString()}</Text>
                          <Text style={[styles.goalMiniPct, { color: meta.color }]}>{pct}%</Text>
                        </View>
                        <AnimatedProgressBar pct={pct} color={meta.color} height={3} delay={200} />
                      </View>
                    ) : null}
                    {(milestones[goal.id]?.length ?? 0) > 0 && (
                      <Text style={styles.milestoneCount}>
                        {milestones[goal.id].filter((m) => m.is_complete).length}/{milestones[goal.id].length} milestones
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Completed */}
          {completed.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Completed</Text>
              {completed.map((goal) => {
                const meta = CAT_META[goal.category as GoalCategory] ?? CAT_META.other;
                return (
                  <View key={goal.id} style={[styles.goalCard, { opacity: 0.45 }]}>
                    <View style={[styles.goalAccent, { backgroundColor: meta.color }]} />
                    <View style={styles.goalCardInner}>
                      <Text style={[styles.goalCatLabel, { color: meta.color }]}>✅ Completed</Text>
                      <Text style={styles.goalName}>{goal.name}</Text>
                      <Text style={styles.goalDeadline}>📅 {formatDeadline(goal.deadline)}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {goals.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🎯</Text>
              <Text style={styles.emptyTitle}>No goals yet</Text>
              <Text style={styles.emptySub}>Set your first big goal and track it here</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Goal Detail Modal */}
      <Modal visible={showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setShowDetail(false)} />
          {selectedGoal && (
            <View style={styles.detailSheet}>
              <View style={styles.modalHandle} />
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 580 }}>
                <View style={styles.detailContent}>
                  {/* Header */}
                  <View style={styles.detailHeader}>
                    <View style={[styles.detailCatTag, { backgroundColor: `${CAT_META[selectedGoal.category as GoalCategory]?.color ?? colors.grey600}15` }]}>
                      <Text style={[styles.detailCatText, { color: CAT_META[selectedGoal.category as GoalCategory]?.color ?? colors.grey600 }]}>
                        {CAT_META[selectedGoal.category as GoalCategory]?.emoji} {CAT_META[selectedGoal.category as GoalCategory]?.label}
                      </Text>
                    </View>
                    <View style={styles.detailActions}>
                      <TouchableOpacity onPress={() => { setShowDetail(false); openAdd(selectedGoal); }}>
                        <Text style={styles.editText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteGoal(selectedGoal.id)}>
                        <Text style={styles.deleteText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={styles.detailName}>{selectedGoal.name}</Text>
                  <Text style={styles.detailDeadline}>📅 {formatDeadline(selectedGoal.deadline)} · {daysLeft(selectedGoal.deadline)} days left</Text>

                  {/* Financial progress */}
                  {selectedGoal.financial_target && (
                    <View style={styles.detailProgress}>
                      <View style={styles.detailProgressLabels}>
                        <Text style={styles.detailProgressLeft}>
                          ${selectedGoal.current_amount.toLocaleString()} of ${selectedGoal.financial_target.toLocaleString()}
                        </Text>
                        <Text style={[styles.detailProgressPct, { color: CAT_META[selectedGoal.category as GoalCategory]?.color }]}>
                          {getProgress(selectedGoal)}%
                        </Text>
                      </View>
                      <AnimatedProgressBar
                        pct={getProgress(selectedGoal)}
                        color={CAT_META[selectedGoal.category as GoalCategory]?.color ?? colors.grey600}
                        height={5}
                        delay={200}
                      />
                      <TouchableOpacity
                        style={styles.updateAmountBtn}
                        onPress={() => { setUpdateAmount(String(selectedGoal.current_amount)); setShowUpdateAmount(true); }}
                      >
                        <Text style={styles.updateAmountText}>+ Log Progress</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Motivation */}
                  {selectedGoal.motivation && (
                    <View style={styles.motivationCard}>
                      <Text style={styles.motivationLabel}>Why this matters</Text>
                      <Text style={styles.motivationText}>"{selectedGoal.motivation}"</Text>
                    </View>
                  )}

                  {/* Milestones */}
                  <Text style={styles.milestonesTitle}>Milestones</Text>
                  <View style={styles.milestonesCard}>
                    {(milestones[selectedGoal.id] ?? []).map((m) => (
                      <TouchableOpacity
                        key={m.id}
                        style={styles.milestoneRow}
                        onPress={() => toggleMilestone(m)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.msCheck, m.is_complete && styles.msCheckDone]}>
                          {m.is_complete && <Text style={styles.msCheckMark}>✓</Text>}
                        </View>
                        <Text style={[styles.msTitle, m.is_complete && styles.msTitleDone]}>{m.title}</Text>
                        {m.target_date && <Text style={styles.msDate}>{formatDeadline(m.target_date)}</Text>}
                      </TouchableOpacity>
                    ))}
                    <View style={styles.addMilestoneRow}>
                      <TextInput
                        style={styles.addMilestoneInput}
                        value={newMilestone}
                        onChangeText={setNewMilestone}
                        placeholder="Add milestone..."
                        placeholderTextColor="#333"
                        onSubmitEditing={() => addMilestone(selectedGoal.id)}
                        returnKeyType="done"
                      />
                      <TouchableOpacity
                        style={styles.addMilestoneBtn}
                        onPress={() => addMilestone(selectedGoal.id)}
                      >
                        <Text style={styles.addMilestoneBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Pin toggle */}
                  {selectedGoal.status === 'active' && (
                    <TouchableOpacity
                      style={[styles.pinToggleRow, selectedGoal.is_pinned && styles.pinToggleRowOn]}
                      onPress={async () => {
                        const newPinned = !selectedGoal.is_pinned;
                        if (newPinned) {
                          await supabase.from('goals').update({ is_pinned: false }).eq('user_id', user?.id ?? '').neq('id', selectedGoal.id);
                          setGoals((prev) => prev.map((g) => ({ ...g, is_pinned: g.id === selectedGoal.id ? true : false })));
                        } else {
                          await supabase.from('goals').update({ is_pinned: false }).eq('id', selectedGoal.id);
                          setGoals((prev) => prev.map((g) => g.id === selectedGoal.id ? { ...g, is_pinned: false } : g));
                        }
                        setSelectedGoal((prev) => prev ? { ...prev, is_pinned: newPinned } : null);
                      }}
                    >
                      <Text style={styles.pinToggleText}>📌 {selectedGoal.is_pinned ? 'Unpin goal' : 'Pin as main goal'}</Text>
                      <View style={[styles.toggle, selectedGoal.is_pinned && styles.toggleOn]}>
                        <View style={[styles.toggleThumb, selectedGoal.is_pinned && styles.toggleThumbOn]} />
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Complete goal */}
                  {selectedGoal.status === 'active' && (
                    <TouchableOpacity
                      style={styles.completeBtn}
                      onPress={() => markGoalComplete(selectedGoal.id)}
                    >
                      <Text style={styles.completeBtnText}>Mark as Achieved 🏆</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* Update amount modal */}
      <Modal visible={showUpdateAmount} transparent animationType="slide" onRequestClose={() => setShowUpdateAmount(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setShowUpdateAmount(false)} />
          <View style={styles.smallSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Update Progress</Text>
            <TextInput
              style={[styles.modalInput, { fontSize: 36, fontWeight: '900', textAlign: 'center', color: colors.revenue }]}
              value={updateAmount}
              onChangeText={setUpdateAmount}
              keyboardType="numeric"
              autoFocus
              selectTextOnFocus
            />
            <TouchableOpacity style={styles.modalSave} onPress={updateGoalAmount}>
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add / Edit Goal Modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setShowAdd(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editGoal ? 'Edit Goal' : 'New Goal'}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              <View style={styles.formGap}>
                <View>
                  <Text style={styles.modalLabel}>Goal Name *</Text>
                  <TextInput style={styles.modalInput} value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="e.g. Buy iPhone 15 Pro Max" placeholderTextColor="#333" autoFocus />
                </View>

                <View>
                  <Text style={styles.modalLabel}>Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.catRow}>
                      {CATEGORIES.map((cat) => {
                        const meta = CAT_META[cat];
                        const active = form.category === cat;
                        return (
                          <TouchableOpacity
                            key={cat}
                            style={[styles.catChip, active && { backgroundColor: `${meta.color}20`, borderColor: meta.color }]}
                            onPress={() => setForm((p) => ({ ...p, category: cat }))}
                          >
                            <Text style={styles.catEmoji}>{meta.emoji}</Text>
                            <Text style={[styles.catChipText, active && { color: meta.color }]}>{meta.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>

                <View>
                  <Text style={styles.modalLabel}>Deadline (YYYY-MM-DD) *</Text>
                  <TextInput style={styles.modalInput} value={form.deadline} onChangeText={(v) => setForm((p) => ({ ...p, deadline: v }))} placeholder="2026-07-10" placeholderTextColor="#333" />
                </View>

                <View>
                  <Text style={styles.modalLabel}>Financial Target ($) — optional</Text>
                  <TextInput style={styles.modalInput} value={form.financial_target} onChangeText={(v) => setForm((p) => ({ ...p, financial_target: v }))} placeholder="1200" placeholderTextColor="#333" keyboardType="numeric" />
                </View>

                <View>
                  <Text style={styles.modalLabel}>Why this matters — optional</Text>
                  <TextInput style={[styles.modalInput, { minHeight: 70, textAlignVertical: 'top' }]} value={form.motivation} onChangeText={(v) => setForm((p) => ({ ...p, motivation: v }))} placeholder="This is my reward for hitting my sprint goal..." placeholderTextColor="#333" multiline />
                </View>

                <TouchableOpacity
                  style={[styles.pinnedToggle, form.is_pinned && styles.pinnedToggleActive]}
                  onPress={() => setForm((p) => ({ ...p, is_pinned: !p.is_pinned }))}
                >
                  <Text style={styles.pinnedToggleText}>📌 Pin as main goal</Text>
                  <View style={[styles.toggle, form.is_pinned && styles.toggleOn]}>
                    <View style={[styles.toggleThumb, form.is_pinned && styles.toggleThumbOn]} />
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalSave, (!form.name || !form.deadline || saving) && { opacity: 0.4 }]}
              onPress={saveGoal}
              disabled={!form.name || !form.deadline || saving}
            >
              {saving ? <ActivityIndicator color={colors.black} /> : <Text style={styles.modalSaveText}>{editGoal ? 'Save Changes' : 'Create Goal 🎯'}</Text>}
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
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.white },
  emptySub: { fontSize: 13, color: colors.grey600, textAlign: 'center' },

  heroCard: { backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#1e1e1e', borderRadius: 22, padding: 22, overflow: 'hidden' },
  heroGlow: { position: 'absolute', top: -40, right: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(99,102,241,0.12)' },
  heroCatTag: { alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 12, borderRadius: 100, marginBottom: 12 },
  heroCatText: { fontSize: 11, fontWeight: '700' },
  heroName: { fontSize: 20, fontWeight: '900', color: colors.white, letterSpacing: -0.5, lineHeight: 26 },
  heroDeadline: { fontSize: 12, color: '#555', marginTop: 6 },
  countdownRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  countBlock: { flex: 1, backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 12, padding: 10, alignItems: 'center' },
  countNum: { fontSize: 22, fontWeight: '900', color: colors.white, letterSpacing: -1 },
  countLbl: { fontSize: 9, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
  heroProgress: { marginTop: 16 },
  heroProgressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  heroProgressLeft: { fontSize: 11, color: '#555' },
  heroProgressRight: { fontSize: 11, fontWeight: '700' },
  heroTrack: { height: 5, backgroundColor: '#1a1a1a', borderRadius: 3, overflow: 'hidden' },
  heroFill: { height: '100%', borderRadius: 3 },

  goalCard: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 16, flexDirection: 'row', overflow: 'hidden' },
  goalAccent: { width: 3 },
  goalCardInner: { flex: 1, padding: 16, gap: 10 },
  goalCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  goalCardLeft: { flex: 1, gap: 3 },
  goalCardRight: { alignItems: 'flex-end', marginLeft: 12 },
  goalCatLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  goalName: { fontSize: 15, fontWeight: '700', color: colors.white, lineHeight: 20 },
  goalDeadline: { fontSize: 11, color: '#444' },
  daysLeft: { fontSize: 16, fontWeight: '900' },
  daysLbl: { fontSize: 10, color: '#444', fontWeight: '600' },
  goalCardBottom: { gap: 8 },
  goalMiniBar: { gap: 4 },
  goalMiniLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  goalMiniLeft: { fontSize: 10, color: '#444' },
  goalMiniPct: { fontSize: 10, fontWeight: '700' },
  milestoneCount: { fontSize: 10, color: '#333', fontWeight: '600' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  detailSheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  detailContent: { gap: 16 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailCatTag: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 100 },
  detailCatText: { fontSize: 11, fontWeight: '700' },
  detailActions: { flexDirection: 'row', gap: 16 },
  editText: { fontSize: 13, fontWeight: '700', color: colors.grey400 },
  deleteText: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  detailName: { fontSize: 22, fontWeight: '900', color: colors.white, letterSpacing: -0.5, lineHeight: 28 },
  detailDeadline: { fontSize: 13, color: '#555' },
  detailProgress: { gap: 10 },
  detailProgressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  detailProgressLeft: { fontSize: 12, color: '#555' },
  detailProgressPct: { fontSize: 12, fontWeight: '700' },
  updateAmountBtn: { alignSelf: 'flex-start', paddingVertical: 7, paddingHorizontal: 14, backgroundColor: '#1a1a1a', borderRadius: 10, marginTop: 4 },
  updateAmountText: { fontSize: 12, fontWeight: '700', color: colors.white },
  motivationCard: { backgroundColor: '#0d0d0d', borderRadius: 14, padding: 16, gap: 6 },
  motivationLabel: { fontSize: 10, fontWeight: '700', color: '#333', textTransform: 'uppercase', letterSpacing: 1 },
  motivationText: { fontSize: 14, color: '#666', fontStyle: 'italic', lineHeight: 22 },
  milestonesTitle: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5 },
  milestonesCard: { backgroundColor: '#0d0d0d', borderRadius: 14, padding: 14, gap: 2 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111' },
  msCheck: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  msCheckDone: { backgroundColor: colors.revenue, borderColor: colors.revenue },
  msCheckMark: { fontSize: 10, fontWeight: '900', color: colors.black },
  msTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: '#ccc' },
  msTitleDone: { color: '#333', textDecorationLine: 'line-through' },
  msDate: { fontSize: 10, color: '#333' },
  addMilestoneRow: { flexDirection: 'row', gap: 8, paddingTop: 8 },
  addMilestoneInput: { flex: 1, backgroundColor: '#161616', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: colors.white },
  addMilestoneBtn: { width: 38, height: 38, backgroundColor: colors.white, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addMilestoneBtnText: { fontSize: 20, fontWeight: '700', color: colors.black },
  pinToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  pinToggleRowOn: { borderColor: colors.fyp, backgroundColor: 'rgba(99,102,241,0.08)' },
  pinToggleText: { fontSize: 13, fontWeight: '600', color: colors.white },
  completeBtn: { height: 50, backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: colors.revenue, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  completeBtnText: { fontSize: 14, fontWeight: '700', color: colors.revenue },

  smallSheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 16 },
  modalSheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 14 },
  modalHandle: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  modalLabel: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  modalInput: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, fontSize: 15, color: colors.white, borderWidth: 1, borderColor: '#2a2a2a' },
  formGap: { gap: 14 },
  catRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  catEmoji: { fontSize: 13 },
  catChipText: { fontSize: 12, fontWeight: '600', color: '#555' },
  pinnedToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  pinnedToggleActive: { borderColor: colors.fyp, backgroundColor: 'rgba(99,102,241,0.08)' },
  pinnedToggleText: { fontSize: 14, fontWeight: '600', color: colors.white },
  toggle: { width: 44, height: 26, backgroundColor: '#2a2a2a', borderRadius: 13, position: 'relative' },
  toggleOn: { backgroundColor: colors.fyp },
  toggleThumb: { position: 'absolute', left: 3, top: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white },
  toggleThumbOn: { left: 21 },
  modalSave: { height: 52, backgroundColor: colors.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: colors.black },
});
