import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { CountdownTimer } from '../../components/CountdownTimer';
import { AnimatedProgressBar } from '../../components/AnimatedProgressBar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useSprintStore } from '../../store/sprintStore';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/colors';
import { scheduleGoalReminder } from '../../lib/notifications';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  parent_goal_id: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = ['revenue', 'lifestyle', 'purchase', 'travel', 'health', 'business', 'other'] as const;
type GoalCategory = typeof CATEGORIES[number];

const CAT_META: Record<GoalCategory, { label: string; emoji: string; color: string }> = {
  revenue:   { label: 'Revenue',   emoji: '💰', color: colors.revenue },
  lifestyle: { label: 'Lifestyle', emoji: '🏠', color: colors.clients },
  purchase:  { label: 'Purchase',  emoji: '📱', color: colors.fyp },
  travel:    { label: 'Travel',    emoji: '✈️', color: '#06B6D4' },
  health:    { label: 'Health',    emoji: '❤️', color: colors.habit },
  business:  { label: 'Business',  emoji: '💼', color: colors.development },
  other:     { label: 'Other',     emoji: '🎯', color: colors.grey600 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysLeft(deadline: string) {
  const diff = new Date(deadline + 'T00:00:00').getTime() - new Date().getTime();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function fmtDeadline(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function catMeta(cat: string) {
  return CAT_META[cat as GoalCategory] ?? CAT_META.other;
}

function subBudget(subs: Goal[]) {
  return subs.reduce((s, g) => s + (g.financial_target ?? 0), 0);
}

function subSaved(subs: Goal[]) {
  return subs.reduce((s, g) => s + (g.current_amount ?? 0), 0);
}

function parentProgress(goal: Goal, subs: Goal[]) {
  if (subs.length > 0) {
    const budget = subBudget(subs);
    if (!budget) return 0;
    return Math.min(Math.round((subSaved(subs) / budget) * 100), 100);
  }
  if (!goal.financial_target) return 0;
  return Math.min(Math.round((goal.current_amount / goal.financial_target) * 100), 100);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const { user } = useAuthStore();
  const { sprint } = useSprintStore();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState<string | null>(null);

  // detail
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // add/edit parent
  const [showAdd, setShowAdd] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState({
    name: '', category: 'lifestyle' as GoalCategory,
    deadline: '', motivation: '', is_pinned: false,
  });
  const [formSubs, setFormSubs] = useState<{ name: string; budget: string; deadline: string }[]>([]);
  const [showSubForm, setShowSubForm] = useState(false);
  const [subDraft, setSubDraft] = useState({ name: '', budget: '', deadline: '' });
  const [saving, setSaving] = useState(false);

  // add sub-goal from detail
  const [showAddSub, setShowAddSub] = useState(false);
  const [newSubForm, setNewSubForm] = useState({ name: '', budget: '', deadline: '' });
  const [savingSub, setSavingSub] = useState(false);

  // log saving
  const [logTarget, setLogTarget] = useState<Goal | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [logAmount, setLogAmount] = useState('');

  // ─── Fetch ─────────────────────────────────────────────────────────────────

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
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  // ─── Derived ───────────────────────────────────────────────────────────────

  const parentGoals = goals.filter((g) => !g.parent_goal_id);
  const subsOf = (id: string) => goals.filter((g) => g.parent_goal_id === id);

  const filteredParents = catFilter
    ? parentGoals.filter((g) => g.category === catFilter)
    : parentGoals;

  const activeParents = filteredParents.filter((g) => g.status === 'active');
  const completedParents = filteredParents.filter((g) => g.status === 'completed');
  const pinned = activeParents.find((g) => g.is_pinned) ?? null;
  const unpinned = activeParents.filter((g) => !g.is_pinned);

  // Group unpinned by category
  const byCategory: Record<string, Goal[]> = {};
  unpinned.forEach((g) => {
    if (!byCategory[g.category]) byCategory[g.category] = [];
    byCategory[g.category].push(g);
  });
  const categoryGroups = Object.entries(byCategory);

  // ─── Save parent goal ──────────────────────────────────────────────────────

  function openAdd(goal?: Goal) {
    setEditGoal(goal ?? null);
    setForm(goal ? {
      name: goal.name, category: goal.category as GoalCategory,
      deadline: goal.deadline, motivation: goal.motivation ?? '', is_pinned: goal.is_pinned,
    } : { name: '', category: 'lifestyle', deadline: '', motivation: '', is_pinned: false });
    setFormSubs([]);
    setShowSubForm(false);
    setSubDraft({ name: '', budget: '', deadline: '' });
    setShowAdd(true);
  }

  async function saveGoal() {
    if (!user || !form.name || !form.deadline) return;
    setSaving(true);

    if (form.is_pinned) {
      await supabase.from('goals').update({ is_pinned: false }).eq('user_id', user.id).neq('id', editGoal?.id ?? '00000000-0000-0000-0000-000000000000');
    }

    const payload = {
      user_id: user.id, sprint_id: sprint?.id ?? null,
      name: form.name, category: form.category, deadline: form.deadline,
      financial_target: null, motivation: form.motivation || null,
      is_pinned: form.is_pinned, status: 'active', parent_goal_id: null,
    };

    let parentId = editGoal?.id ?? null;

    if (editGoal) {
      const { data } = await supabase.from('goals').update(payload).eq('id', editGoal.id).select().single();
      if (data) setGoals((prev) => prev.map((g) => g.id === editGoal.id ? data : (form.is_pinned ? { ...g, is_pinned: false } : g)));
    } else {
      const { data } = await supabase.from('goals').insert(payload).select().single();
      if (data) {
        parentId = data.id;
        setGoals((prev) => [data, ...prev.map((g) => form.is_pinned ? { ...g, is_pinned: false } : g)]);
        if (data.deadline) scheduleGoalReminder(data.name, data.deadline, data.id);
      }
    }

    // Save formSubs for new goals
    if (!editGoal && parentId && formSubs.length > 0) {
      const subInserts = formSubs.map((s, i) => ({
        user_id: user.id,
        parent_goal_id: parentId,
        name: s.name,
        category: form.category,
        deadline: s.deadline || form.deadline,
        financial_target: parseFloat(s.budget) || null,
        current_amount: 0,
        motivation: null,
        is_pinned: false,
        status: 'active',
        sprint_id: null,
      }));
      const { data: subData } = await supabase.from('goals').insert(subInserts).select();
      if (subData) setGoals((prev) => [...prev, ...subData]);
    }

    setSaving(false);
    setShowAdd(false);
  }

  // ─── Sub-goal actions (from detail) ────────────────────────────────────────

  async function addSubGoal() {
    if (!selectedGoal || !newSubForm.name || !user) return;
    setSavingSub(true);
    const { data } = await supabase.from('goals').insert({
      user_id: user.id,
      parent_goal_id: selectedGoal.id,
      name: newSubForm.name,
      category: selectedGoal.category,
      deadline: newSubForm.deadline || selectedGoal.deadline,
      financial_target: parseFloat(newSubForm.budget) || null,
      current_amount: 0,
      motivation: null,
      is_pinned: false,
      status: 'active',
      sprint_id: null,
    }).select().single();
    if (data) setGoals((prev) => [...prev, data]);
    setNewSubForm({ name: '', budget: '', deadline: '' });
    setShowAddSub(false);
    setSavingSub(false);
  }

  async function toggleSubComplete(sub: Goal) {
    const newStatus = sub.status === 'completed' ? 'active' : 'completed';
    await supabase.from('goals').update({ status: newStatus }).eq('id', sub.id);
    setGoals((prev) => prev.map((g) => g.id === sub.id ? { ...g, status: newStatus } : g));
  }

  async function deleteGoal(id: string, isParent = false) {
    Alert.alert(
      'Delete Goal?',
      isParent ? 'All sub-goals will also be deleted.' : 'This sub-goal will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            await supabase.from('goals').delete().eq('id', id);
            setGoals((prev) => prev.filter((g) => g.id !== id && g.parent_goal_id !== id));
            setShowDetail(false);
          },
        },
      ]
    );
  }

  async function markGoalComplete(id: string) {
    await supabase.from('goals').update({ status: 'completed' }).eq('id', id);
    setGoals((prev) => prev.map((g) => g.id === id ? { ...g, status: 'completed' } : g));
    setShowDetail(false);
  }

  // ─── Log saving ────────────────────────────────────────────────────────────

  function openLog(goal: Goal) {
    setLogTarget(goal);
    setLogAmount(String(goal.current_amount || ''));
    setShowLog(true);
  }

  async function saveLog() {
    if (!logTarget) return;
    const val = parseFloat(logAmount);
    if (isNaN(val)) return;
    await supabase.from('goals').update({ current_amount: val }).eq('id', logTarget.id);
    setGoals((prev) => prev.map((g) => g.id === logTarget.id ? { ...g, current_amount: val } : g));
    if (selectedGoal?.id === logTarget.id) setSelectedGoal((p) => p ? { ...p, current_amount: val } : p);
    setShowLog(false);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>🎯 Goals</Text>
          <Text style={styles.subtitle}>{activeParents.length} active · {completedParents.length} completed</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => openAdd()}>
          <Text style={styles.addBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Category filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity style={[styles.filterChip, !catFilter && styles.filterChipActive]} onPress={() => setCatFilter(null)}>
          <Text style={[styles.filterChipText, !catFilter && styles.filterChipTextActive]}>All</Text>
        </TouchableOpacity>
        {CATEGORIES.map((cat) => {
          const m = CAT_META[cat];
          const active = catFilter === cat;
          return (
            <TouchableOpacity key={cat} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setCatFilter(active ? null : cat)}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{m.emoji} {m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.white} size="large" /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchGoals} tintColor={colors.white} />}
          contentContainerStyle={styles.listContent}
        >
          {/* ── Pinned hero ── */}
          {pinned && (() => {
            const subs = subsOf(pinned.id);
            const meta = catMeta(pinned.category);
            const budget = subs.length > 0 ? subBudget(subs) : (pinned.financial_target ?? 0);
            const saved = subs.length > 0 ? subSaved(subs) : pinned.current_amount;
            const pct = budget > 0 ? Math.min(Math.round((saved / budget) * 100), 100) : 0;
            const doneSubs = subs.filter((s) => s.status === 'completed').length;
            const preview = subs.slice(0, 3);
            return (
              <TouchableOpacity style={styles.heroCard} onPress={() => { setSelectedGoal(pinned); setShowDetail(true); }} activeOpacity={0.85}>
                <View style={styles.heroGlow} />
                {/* tag row */}
                <View style={styles.heroTagRow}>
                  <View style={[styles.heroCatTag, { backgroundColor: `${meta.color}15` }]}>
                    <Text style={[styles.heroCatText, { color: meta.color }]}>📌 Pinned · {meta.emoji} {meta.label}</Text>
                  </View>
                  {subs.length > 0 && <Text style={styles.heroSubCount}>{subs.length} sub-goals</Text>}
                </View>
                <Text style={styles.heroName}>{pinned.name}</Text>
                <Text style={styles.heroDeadline}>📅 {fmtDeadline(pinned.deadline)} · {daysLeft(pinned.deadline)} days left</Text>
                {budget > 0 && (
                  <View style={styles.heroProgress}>
                    <View style={styles.heroProgressLabels}>
                      <Text style={styles.heroProgressLeft}>${saved.toLocaleString()} of ${budget.toLocaleString()} budget</Text>
                      <Text style={[styles.heroProgressRight, { color: meta.color }]}>{pct}%</Text>
                    </View>
                    <AnimatedProgressBar pct={pct} color={meta.color} height={5} delay={400} />
                  </View>
                )}
                {/* sub-goals preview */}
                {subs.length > 0 && (
                  <View style={styles.heroSubsRow}>
                    {preview.map((sub) => (
                      <View key={sub.id} style={styles.heroSubItem}>
                        <View style={[styles.heroSubCheck, sub.status === 'completed' && styles.heroSubCheckDone]}>
                          {sub.status === 'completed' && <Text style={styles.heroSubCheckMark}>✓</Text>}
                        </View>
                        <Text style={[styles.heroSubName, sub.status === 'completed' && styles.heroSubNameDone]} numberOfLines={1}>
                          {sub.name}
                        </Text>
                        {sub.financial_target ? (
                          <Text style={styles.heroSubBudget}>${sub.financial_target.toLocaleString()}</Text>
                        ) : null}
                      </View>
                    ))}
                    {subs.length > 3 && (
                      <Text style={styles.heroSubMore}>+ {subs.length - 3} more sub-goal{subs.length - 3 > 1 ? 's' : ''} →</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })()}

          {/* ── Category groups ── */}
          {categoryGroups.map(([cat, catGoals]) => {
            const meta = catMeta(cat);
            return (
              <View key={cat} style={styles.catGroup}>
                <View style={styles.catGroupHeader}>
                  <View style={[styles.catGroupDot, { backgroundColor: meta.color }]} />
                  <Text style={styles.catGroupName}>{meta.label}</Text>
                  <Text style={styles.catGroupCount}>{catGoals.length} {catGoals.length === 1 ? 'goal' : 'goals'}</Text>
                </View>
                {catGoals.map((goal) => {
                  const subs = subsOf(goal.id);
                  const budget = subs.length > 0 ? subBudget(subs) : (goal.financial_target ?? 0);
                  const saved = subs.length > 0 ? subSaved(subs) : goal.current_amount;
                  const pct = budget > 0 ? Math.min(Math.round((saved / budget) * 100), 100) : 0;
                  const doneSubs = subs.filter((s) => s.status === 'completed').length;
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
                            <Text style={[styles.goalCatLabel, { color: meta.color }]}>
                              {meta.emoji} {meta.label}{subs.length > 0 ? ` · ${subs.length} sub-goals` : ''}
                            </Text>
                            <Text style={styles.goalName}>{goal.name}</Text>
                            <Text style={styles.goalDeadline}>📅 {fmtDeadline(goal.deadline)}</Text>
                          </View>
                          <View style={styles.goalCardRight}>
                            <Text style={[styles.daysLeft, { color: meta.color }]}>{dl}d</Text>
                            <Text style={styles.daysLbl}>left</Text>
                          </View>
                        </View>
                        {budget > 0 && (
                          <View style={styles.goalMiniBar}>
                            <View style={styles.goalMiniLabels}>
                              <Text style={styles.goalMiniLeft}>
                                ${saved.toLocaleString()} / ${budget.toLocaleString()}
                                {subs.length > 0 ? ` · ${doneSubs}/${subs.length} sub-goals done` : ''}
                              </Text>
                              <Text style={[styles.goalMiniPct, { color: meta.color }]}>{pct}%</Text>
                            </View>
                            <AnimatedProgressBar pct={pct} color={meta.color} height={3} delay={200} />
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}

          {/* ── Completed ── */}
          {completedParents.length > 0 && (
            <View style={styles.catGroup}>
              <View style={styles.catGroupHeader}>
                <View style={[styles.catGroupDot, { backgroundColor: '#333' }]} />
                <Text style={styles.catGroupName}>Completed</Text>
                <Text style={styles.catGroupCount}>{completedParents.length}</Text>
              </View>
              {completedParents.map((goal) => {
                const meta = catMeta(goal.category);
                return (
                  <View key={goal.id} style={[styles.goalCard, { opacity: 0.45 }]}>
                    <View style={[styles.goalAccent, { backgroundColor: meta.color }]} />
                    <View style={styles.goalCardInner}>
                      <Text style={[styles.goalCatLabel, { color: meta.color }]}>✅ {meta.label}</Text>
                      <Text style={styles.goalName}>{goal.name}</Text>
                      <Text style={styles.goalDeadline}>📅 {fmtDeadline(goal.deadline)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {parentGoals.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🎯</Text>
              <Text style={styles.emptyTitle}>No goals yet</Text>
              <Text style={styles.emptySub}>Set your first big goal and track it here</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* GOAL DETAIL MODAL                       */}
      {/* ═══════════════════════════════════════ */}
      <Modal visible={showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setShowDetail(false)} />
          {selectedGoal && (() => {
            const subs = subsOf(selectedGoal.id);
            const meta = catMeta(selectedGoal.category);
            const budget = subs.length > 0 ? subBudget(subs) : (selectedGoal.financial_target ?? 0);
            const saved = subs.length > 0 ? subSaved(subs) : selectedGoal.current_amount;
            const remaining = Math.max(0, budget - saved);
            const pct = budget > 0 ? Math.min(Math.round((saved / budget) * 100), 100) : 0;
            const doneSubs = subs.filter((s) => s.status === 'completed').length;
            return (
              <View style={styles.detailSheet}>
                <View style={styles.modalHandle} />
                {/* detail header */}
                <View style={styles.detailHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailTitle}>{selectedGoal.name}</Text>
                  </View>
                  <TouchableOpacity style={styles.detailEditBtn} onPress={() => { setShowDetail(false); openAdd(selectedGoal); }}>
                    <Text style={styles.detailEditBtnText}>⋯ Edit</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailScroll}>
                  {/* hero summary card */}
                  <View style={[styles.detailHero, { borderColor: `${meta.color}30` }]}>
                    <View style={[styles.detailHeroGlow, { backgroundColor: `${meta.color}10` }]} />
                    <View style={[styles.heroCatTag, { backgroundColor: `${meta.color}15`, alignSelf: 'flex-start', marginBottom: 10 }]}>
                      <Text style={[styles.heroCatText, { color: meta.color }]}>{meta.emoji} {meta.label} Goal</Text>
                    </View>
                    <Text style={styles.detailHeroName}>{selectedGoal.name}</Text>
                    <Text style={styles.detailHeroDeadline}>📅 {fmtDeadline(selectedGoal.deadline)} · {daysLeft(selectedGoal.deadline)} days left</Text>

                    {/* 3 stat blocks */}
                    {budget > 0 && (
                      <View style={styles.statBlocks}>
                        <View style={styles.statBlock}>
                          <Text style={styles.statLabel}>Total Budget</Text>
                          <Text style={styles.statValue}>${budget.toLocaleString()}</Text>
                        </View>
                        <View style={styles.statBlock}>
                          <Text style={styles.statLabel}>Saved</Text>
                          <Text style={[styles.statValue, { color: colors.revenue }]}>${saved.toLocaleString()}</Text>
                        </View>
                        <View style={styles.statBlock}>
                          <Text style={styles.statLabel}>Remaining</Text>
                          <Text style={[styles.statValue, { color: remaining > 0 ? '#EF4444' : colors.revenue }]}>${remaining.toLocaleString()}</Text>
                        </View>
                      </View>
                    )}

                    {/* overall progress */}
                    {budget > 0 && (
                      <View style={{ marginTop: 14 }}>
                        <View style={styles.heroProgressLabels}>
                          <Text style={styles.heroProgressLeft}>
                            {subs.length > 0 ? `${doneSubs}/${subs.length} sub-goals complete` : 'Progress'}
                          </Text>
                          <Text style={[styles.heroProgressRight, { color: meta.color }]}>{pct}%</Text>
                        </View>
                        <AnimatedProgressBar pct={pct} color={meta.color} height={5} delay={300} />
                      </View>
                    )}
                  </View>

                  {/* Sub-goals section */}
                  <View style={styles.detailSectionRow}>
                    <Text style={styles.detailSectionTitle}>Sub-goals</Text>
                    <TouchableOpacity style={styles.addSubBtn} onPress={() => setShowAddSub(!showAddSub)}>
                      <Text style={styles.addSubBtnText}>+ Add Sub-goal</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Inline add sub-goal form */}
                  {showAddSub && (
                    <View style={styles.addSubForm}>
                      <TextInput
                        style={styles.addSubInput}
                        value={newSubForm.name}
                        onChangeText={(v) => setNewSubForm((p) => ({ ...p, name: v }))}
                        placeholder="Sub-goal name..."
                        placeholderTextColor="#333"
                        autoFocus
                      />
                      <View style={styles.addSubRow}>
                        <TextInput
                          style={[styles.addSubInput, { flex: 1 }]}
                          value={newSubForm.budget}
                          onChangeText={(v) => setNewSubForm((p) => ({ ...p, budget: v }))}
                          placeholder="Budget $"
                          placeholderTextColor="#333"
                          keyboardType="numeric"
                        />
                        <TextInput
                          style={[styles.addSubInput, { flex: 1 }]}
                          value={newSubForm.deadline}
                          onChangeText={(v) => setNewSubForm((p) => ({ ...p, deadline: v }))}
                          placeholder="Deadline YYYY-MM-DD"
                          placeholderTextColor="#333"
                        />
                      </View>
                      <TouchableOpacity
                        style={[styles.addSubSaveBtn, (!newSubForm.name || savingSub) && { opacity: 0.4 }]}
                        onPress={addSubGoal}
                        disabled={!newSubForm.name || savingSub}
                      >
                        {savingSub ? <ActivityIndicator color={colors.black} size="small" /> : <Text style={styles.addSubSaveBtnText}>Save Sub-goal</Text>}
                      </TouchableOpacity>
                    </View>
                  )}

                  {subs.length === 0 && !showAddSub && (
                    <Text style={styles.noSubsText}>No sub-goals yet — tap "+ Add Sub-goal" to break this down</Text>
                  )}

                  {subs.map((sub) => {
                    const subMeta = catMeta(sub.category);
                    const subRemaining = Math.max(0, (sub.financial_target ?? 0) - sub.current_amount);
                    const subPct = sub.financial_target ? Math.min(Math.round((sub.current_amount / sub.financial_target) * 100), 100) : 0;
                    const isDone = sub.status === 'completed';
                    return (
                      <View key={sub.id} style={[styles.subCard, isDone && styles.subCardDone]}>
                        <View style={styles.subCardTop}>
                          <TouchableOpacity style={[styles.subCheck, isDone && styles.subCheckDone]} onPress={() => toggleSubComplete(sub)}>
                            {isDone && <Text style={styles.subCheckMark}>✓</Text>}
                          </TouchableOpacity>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.subName, isDone && styles.subNameDone]}>{sub.name}</Text>
                            <Text style={styles.subDeadline}>📅 {fmtDeadline(sub.deadline)} · {daysLeft(sub.deadline)} days left</Text>
                          </View>
                          <TouchableOpacity onPress={() => openLog(sub)} style={styles.subLogBtn}>
                            <Text style={styles.subLogBtnText}>Log</Text>
                          </TouchableOpacity>
                        </View>
                        {sub.financial_target ? (
                          <>
                            <View style={styles.subStatBlocks}>
                              <View style={styles.subStatBlock}>
                                <Text style={styles.subStatLabel}>Budget</Text>
                                <Text style={[styles.subStatValue, isDone && { color: '#333', textDecorationLine: 'line-through' }]}>
                                  ${sub.financial_target.toLocaleString()}
                                </Text>
                              </View>
                              <View style={styles.subStatBlock}>
                                <Text style={styles.subStatLabel}>Saved</Text>
                                <Text style={[styles.subStatValue, { color: isDone ? colors.revenue : sub.current_amount > 0 ? colors.revenue : '#444' }]}>
                                  ${sub.current_amount.toLocaleString()}
                                </Text>
                              </View>
                              <View style={styles.subStatBlock}>
                                <Text style={styles.subStatLabel}>Remaining</Text>
                                <Text style={[styles.subStatValue, { color: isDone ? colors.revenue : subRemaining > 0 ? '#EF4444' : colors.revenue }]}>
                                  {isDone ? '✓ Done' : `$${subRemaining.toLocaleString()}`}
                                </Text>
                              </View>
                            </View>
                            {!isDone && <AnimatedProgressBar pct={subPct} color={meta.color} height={3} delay={200} />}
                          </>
                        ) : null}
                      </View>
                    );
                  })}

                  {/* Sprint connection */}
                  <View style={styles.sprintRow}>
                    <View style={[styles.sprintIcon, { backgroundColor: `${meta.color}12` }]}>
                      <Text style={{ fontSize: 16 }}>📅</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sprintRowTitle}>Linked to Current Sprint</Text>
                      {budget > 0 && remaining > 0 && (
                        <Text style={styles.sprintRowSub}>
                          ${Math.ceil(remaining / Math.max(1, daysLeft(selectedGoal.deadline) / 7))}/week needed to hit on time
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.sprintRowStatus, { color: pct >= 50 ? colors.revenue : '#EAB308' }]}>
                      {pct >= 50 ? 'On Track →' : 'At Risk →'}
                    </Text>
                  </View>

                  {/* Motivation */}
                  {selectedGoal.motivation ? (
                    <View style={styles.motivationCard}>
                      <Text style={styles.motivationLabel}>Why this matters</Text>
                      <Text style={styles.motivationText}>"{selectedGoal.motivation}"</Text>
                    </View>
                  ) : null}

                  {/* Action row */}
                  <View style={styles.detailActions}>
                    {(subs.length === 0) && (
                      <TouchableOpacity style={styles.logBtn} onPress={() => openLog(selectedGoal)}>
                        <Text style={styles.logBtnText}>+ Log Saving</Text>
                      </TouchableOpacity>
                    )}
                    {selectedGoal.status === 'active' && (
                      <TouchableOpacity style={styles.completeBtn} onPress={() => markGoalComplete(selectedGoal.id)}>
                        <Text style={styles.completeBtnText}>Mark Achieved 🏆</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteGoal(selectedGoal.id, true)}>
                      <Text style={styles.deleteBtnText}>🗑</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Pin toggle */}
                  <TouchableOpacity
                    style={[styles.pinRow, selectedGoal.is_pinned && styles.pinRowOn]}
                    onPress={async () => {
                      const newPinned = !selectedGoal.is_pinned;
                      if (newPinned) {
                        await supabase.from('goals').update({ is_pinned: false }).eq('user_id', user?.id ?? '').neq('id', selectedGoal.id);
                        setGoals((prev) => prev.map((g) => ({ ...g, is_pinned: g.id === selectedGoal.id })));
                      } else {
                        await supabase.from('goals').update({ is_pinned: false }).eq('id', selectedGoal.id);
                        setGoals((prev) => prev.map((g) => g.id === selectedGoal.id ? { ...g, is_pinned: false } : g));
                      }
                      setSelectedGoal((p) => p ? { ...p, is_pinned: newPinned } : p);
                    }}
                  >
                    <Text style={styles.pinRowText}>📌 {selectedGoal.is_pinned ? 'Unpin goal' : 'Pin as main goal'}</Text>
                    <View style={[styles.toggle, selectedGoal.is_pinned && styles.toggleOn]}>
                      <View style={[styles.toggleThumb, selectedGoal.is_pinned && styles.toggleThumbOn]} />
                    </View>
                  </TouchableOpacity>

                </ScrollView>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* ═══════════════════════════════════════ */}
      {/* LOG SAVING MODAL                        */}
      {/* ═══════════════════════════════════════ */}
      <Modal visible={showLog} transparent animationType="slide" onRequestClose={() => setShowLog(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setShowLog(false)} />
          <View style={styles.smallSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Log Saving</Text>
            {logTarget && <Text style={styles.logTargetName}>{logTarget.name}</Text>}
            <TextInput
              style={styles.bigAmountInput}
              value={logAmount}
              onChangeText={setLogAmount}
              keyboardType="numeric"
              autoFocus
              selectTextOnFocus
            />
            <TouchableOpacity style={styles.modalSave} onPress={saveLog}>
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══════════════════════════════════════ */}
      {/* ADD / EDIT GOAL MODAL                   */}
      {/* ═══════════════════════════════════════ */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setShowAdd(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editGoal ? 'Edit Goal' : 'New Goal'}</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 500 }}>
              <View style={styles.formGap}>

                {/* Name */}
                <View>
                  <Text style={styles.modalLabel}>Goal Name *</Text>
                  <TextInput style={styles.modalInput} value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="e.g. Move to a New Apartment" placeholderTextColor="#333" autoFocus />
                </View>

                {/* Category */}
                <View>
                  <Text style={styles.modalLabel}>Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.catRow}>
                      {CATEGORIES.map((cat) => {
                        const m = CAT_META[cat];
                        const active = form.category === cat;
                        return (
                          <TouchableOpacity key={cat} style={[styles.catChip, active && { backgroundColor: `${m.color}20`, borderColor: m.color }]} onPress={() => setForm((p) => ({ ...p, category: cat }))}>
                            <Text style={styles.catEmoji}>{m.emoji}</Text>
                            <Text style={[styles.catChipText, active && { color: m.color }]}>{m.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>

                {/* Deadline */}
                <View>
                  <Text style={styles.modalLabel}>Deadline (YYYY-MM-DD) *</Text>
                  <TextInput style={styles.modalInput} value={form.deadline} onChangeText={(v) => setForm((p) => ({ ...p, deadline: v }))} placeholder="2026-09-01" placeholderTextColor="#333" />
                </View>

                {/* Sub-goals builder — only for new goals */}
                {!editGoal && (
                  <View>
                    <View style={styles.subBuilderHeader}>
                      <Text style={styles.modalLabel}>Sub-goals <Text style={{ color: '#333', fontWeight: '500', textTransform: 'none' }}>(optional)</Text></Text>
                      {formSubs.length > 0 && <Text style={styles.budgetAutoNote}>budget auto-totals ↓</Text>}
                    </View>

                    {formSubs.map((s, i) => (
                      <View key={i} style={styles.formSubItem}>
                        <View style={styles.formSubRow}>
                          <Text style={styles.formSubName} numberOfLines={1}>{s.name}</Text>
                          {s.budget ? <Text style={styles.formSubBudget}>${s.budget}</Text> : null}
                          <TouchableOpacity onPress={() => setFormSubs((prev) => prev.filter((_, idx) => idx !== i))}>
                            <Text style={styles.formSubDel}>✕</Text>
                          </TouchableOpacity>
                        </View>
                        {s.deadline ? <Text style={styles.formSubDate}>📅 {s.deadline}</Text> : null}
                      </View>
                    ))}

                    {showSubForm ? (
                      <View style={styles.subDraftForm}>
                        <TextInput style={styles.modalInput} value={subDraft.name} onChangeText={(v) => setSubDraft((p) => ({ ...p, name: v }))} placeholder="Sub-goal name" placeholderTextColor="#333" autoFocus />
                        <View style={styles.subDraftRow}>
                          <TextInput style={[styles.modalInput, { flex: 1 }]} value={subDraft.budget} onChangeText={(v) => setSubDraft((p) => ({ ...p, budget: v }))} placeholder="Budget $" placeholderTextColor="#333" keyboardType="numeric" />
                          <TextInput style={[styles.modalInput, { flex: 1 }]} value={subDraft.deadline} onChangeText={(v) => setSubDraft((p) => ({ ...p, deadline: v }))} placeholder="YYYY-MM-DD" placeholderTextColor="#333" />
                        </View>
                        <View style={styles.subDraftActions}>
                          <TouchableOpacity style={styles.subDraftCancel} onPress={() => { setShowSubForm(false); setSubDraft({ name: '', budget: '', deadline: '' }); }}>
                            <Text style={styles.subDraftCancelText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.subDraftSave, !subDraft.name && { opacity: 0.4 }]}
                            disabled={!subDraft.name}
                            onPress={() => {
                              if (!subDraft.name) return;
                              setFormSubs((p) => [...p, { ...subDraft }]);
                              setSubDraft({ name: '', budget: '', deadline: '' });
                              setShowSubForm(false);
                            }}
                          >
                            <Text style={styles.subDraftSaveText}>Add</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.addSubGoalRow} onPress={() => setShowSubForm(true)}>
                        <View style={styles.addSubGoalIcon}><Text style={{ color: colors.white, fontSize: 16 }}>+</Text></View>
                        <Text style={styles.addSubGoalText}>Add a sub-goal...</Text>
                      </TouchableOpacity>
                    )}

                    {/* Budget auto-total */}
                    {formSubs.some((s) => s.budget) && (
                      <View style={styles.budgetSummary}>
                        {formSubs.filter((s) => s.budget).map((s, i) => (
                          <View key={i} style={styles.budgetSummaryRow}>
                            <Text style={styles.budgetSummaryLabel} numberOfLines={1}>{s.name}</Text>
                            <Text style={styles.budgetSummaryValue}>${s.budget}</Text>
                          </View>
                        ))}
                        <View style={styles.budgetSummaryDivider} />
                        <View style={styles.budgetSummaryRow}>
                          <Text style={[styles.budgetSummaryLabel, { color: '#ccc', fontWeight: '700' }]}>Total Budget</Text>
                          <Text style={[styles.budgetSummaryValue, { fontSize: 16, fontWeight: '900', color: colors.revenue }]}>
                            ${formSubs.reduce((s, x) => s + (parseFloat(x.budget) || 0), 0).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* Motivation */}
                <View>
                  <Text style={styles.modalLabel}>Why this matters <Text style={{ color: '#333', fontWeight: '500', textTransform: 'none' }}>(optional)</Text></Text>
                  <TextInput style={[styles.modalInput, { minHeight: 64, textAlignVertical: 'top' }]} value={form.motivation} onChangeText={(v) => setForm((p) => ({ ...p, motivation: v }))} placeholder="My own space, finally independent..." placeholderTextColor="#333" multiline />
                </View>

                {/* Pin toggle */}
                <TouchableOpacity style={[styles.pinnedToggle, form.is_pinned && styles.pinnedToggleActive]} onPress={() => setForm((p) => ({ ...p, is_pinned: !p.is_pinned }))}>
                  <Text style={styles.pinnedToggleText}>📌 Pin as main goal</Text>
                  <View style={[styles.toggle, form.is_pinned && styles.toggleOn]}>
                    <View style={[styles.toggleThumb, form.is_pinned && styles.toggleThumbOn]} />
                  </View>
                </TouchableOpacity>

                {editGoal && (
                  <TouchableOpacity style={styles.deleteGoalBtn} onPress={() => deleteGoal(editGoal.id, true)}>
                    <Text style={styles.deleteGoalBtnText}>Delete Goal</Text>
                  </TouchableOpacity>
                )}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: '#444', marginTop: 3 },
  addBtn: { backgroundColor: colors.white, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
  addBtnText: { fontSize: 13, fontWeight: '700', color: colors.black },

  filterScroll: { maxHeight: 44 },
  filterRow: { paddingHorizontal: 22, gap: 6, alignItems: 'center', paddingBottom: 2 },
  filterChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e', flexShrink: 0 },
  filterChipActive: { backgroundColor: colors.white, borderColor: colors.white },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#444' },
  filterChipTextActive: { color: colors.black },

  listContent: { paddingHorizontal: 22, paddingBottom: 100, paddingTop: 12, gap: 16 },

  // hero
  heroCard: { backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#1e1e1e', borderRadius: 22, padding: 22, overflow: 'hidden' },
  heroGlow: { position: 'absolute', top: -40, right: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(99,102,241,0.1)' },
  heroTagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  heroCatTag: { alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 12, borderRadius: 100 },
  heroCatText: { fontSize: 11, fontWeight: '700' },
  heroSubCount: { fontSize: 10, color: '#333', fontWeight: '600' },
  heroName: { fontSize: 20, fontWeight: '900', color: colors.white, letterSpacing: -0.5, lineHeight: 26 },
  heroDeadline: { fontSize: 12, color: '#555', marginTop: 6 },
  heroProgress: { marginTop: 14 },
  heroProgressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  heroProgressLeft: { fontSize: 11, color: '#555' },
  heroProgressRight: { fontSize: 11, fontWeight: '700' },
  heroSubsRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#161616', gap: 7 },
  heroSubItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroSubCheck: { width: 16, height: 16, borderRadius: 5, borderWidth: 1.5, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  heroSubCheckDone: { backgroundColor: colors.revenue, borderColor: colors.revenue },
  heroSubCheckMark: { fontSize: 9, fontWeight: '900', color: colors.black },
  heroSubName: { flex: 1, fontSize: 12, color: '#888', fontWeight: '500' },
  heroSubNameDone: { color: '#333', textDecorationLine: 'line-through' },
  heroSubBudget: { fontSize: 11, color: '#444', fontWeight: '600' },
  heroSubMore: { fontSize: 11, color: '#333', fontWeight: '600', textAlign: 'center', marginTop: 2 },

  // category groups
  catGroup: { gap: 8 },
  catGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  catGroupDot: { width: 8, height: 8, borderRadius: 4 },
  catGroupName: { flex: 1, fontSize: 10, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5 },
  catGroupCount: { fontSize: 10, color: '#333', fontWeight: '600' },

  // goal cards
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
  goalMiniBar: { gap: 4 },
  goalMiniLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  goalMiniLeft: { fontSize: 10, color: '#444', flex: 1 },
  goalMiniPct: { fontSize: 10, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.white },
  emptySub: { fontSize: 13, color: colors.grey600, textAlign: 'center' },

  // modal/overlay shared
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  modalHandle: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  modalLabel: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  modalInput: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, fontSize: 14, color: colors.white, borderWidth: 1, borderColor: '#2a2a2a' },
  modalSave: { height: 52, backgroundColor: colors.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: colors.black },

  // detail sheet
  detailSheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 0, maxHeight: '92%' },
  detailHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 4 },
  detailTitle: { fontSize: 18, fontWeight: '800', color: colors.white, letterSpacing: -0.4, lineHeight: 24 },
  detailEditBtn: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12, flexShrink: 0 },
  detailEditBtnText: { fontSize: 11, fontWeight: '700', color: '#888' },
  detailScroll: { paddingBottom: 48, gap: 16 },

  // hero in detail
  detailHero: { borderWidth: 1, borderRadius: 20, padding: 20, overflow: 'hidden', position: 'relative' },
  detailHeroGlow: { position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: 60 },
  detailHeroName: { fontSize: 20, fontWeight: '900', color: colors.white, letterSpacing: -0.5, lineHeight: 26 },
  detailHeroDeadline: { fontSize: 12, color: '#555', marginTop: 5 },
  statBlocks: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statBlock: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: '#1a2a2a', borderRadius: 12, padding: 10 },
  statLabel: { fontSize: 9, fontWeight: '700', color: '#446', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '900', color: colors.white },

  // sub-goals in detail
  detailSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailSectionTitle: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5 },
  addSubBtn: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e', borderRadius: 9, paddingVertical: 5, paddingHorizontal: 12 },
  addSubBtnText: { fontSize: 11, fontWeight: '700', color: '#888' },
  noSubsText: { fontSize: 12, color: '#333', fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 },
  addSubForm: { backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: '#1e1e1e', borderRadius: 14, padding: 14, gap: 10 },
  addSubInput: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, fontSize: 14, color: colors.white, borderWidth: 1, borderColor: '#2a2a2a' },
  addSubRow: { flexDirection: 'row', gap: 8 },
  addSubSaveBtn: { height: 44, backgroundColor: colors.white, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addSubSaveBtnText: { fontSize: 14, fontWeight: '700', color: colors.black },

  subCard: { backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 14, padding: 14, gap: 10 },
  subCardDone: { borderColor: `${colors.revenue}20` },
  subCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  subCheck: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  subCheckDone: { backgroundColor: colors.revenue, borderColor: colors.revenue },
  subCheckMark: { fontSize: 12, fontWeight: '900', color: colors.black },
  subName: { fontSize: 14, fontWeight: '700', color: colors.white },
  subNameDone: { color: '#333', textDecorationLine: 'line-through' },
  subDeadline: { fontSize: 11, color: '#444', marginTop: 2 },
  subLogBtn: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, flexShrink: 0 },
  subLogBtnText: { fontSize: 11, fontWeight: '700', color: '#888' },
  subStatBlocks: { flexDirection: 'row', gap: 6 },
  subStatBlock: { flex: 1, backgroundColor: '#111', borderWidth: 1, borderColor: '#161616', borderRadius: 10, padding: 8 },
  subStatLabel: { fontSize: 9, fontWeight: '700', color: '#333', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  subStatValue: { fontSize: 14, fontWeight: '800', color: colors.white },

  // sprint connection
  sprintRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 14, padding: 14 },
  sprintIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sprintRowTitle: { fontSize: 13, fontWeight: '700', color: colors.white },
  sprintRowSub: { fontSize: 11, color: '#444', marginTop: 2 },
  sprintRowStatus: { fontSize: 11, fontWeight: '700' },

  motivationCard: { backgroundColor: '#0d0d0d', borderRadius: 14, padding: 16, gap: 6 },
  motivationLabel: { fontSize: 10, fontWeight: '700', color: '#333', textTransform: 'uppercase', letterSpacing: 1 },
  motivationText: { fontSize: 13, color: '#666', fontStyle: 'italic', lineHeight: 20 },

  detailActions: { flexDirection: 'row', gap: 8 },
  logBtn: { flex: 1, height: 46, backgroundColor: colors.white, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  logBtnText: { fontSize: 13, fontWeight: '700', color: colors.black },
  completeBtn: { flex: 1, height: 46, backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: colors.revenue, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  completeBtnText: { fontSize: 12, fontWeight: '700', color: colors.revenue },
  deleteBtn: { width: 46, height: 46, backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 16 },

  pinRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 4 },
  pinRowOn: { borderColor: colors.fyp, backgroundColor: 'rgba(99,102,241,0.08)' },
  pinRowText: { fontSize: 13, fontWeight: '600', color: colors.white },
  toggle: { width: 44, height: 26, backgroundColor: '#2a2a2a', borderRadius: 13 },
  toggleOn: { backgroundColor: colors.fyp },
  toggleThumb: { position: 'absolute', left: 3, top: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white },
  toggleThumbOn: { left: 21 },

  // log saving sheet
  smallSheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 14 },
  logTargetName: { fontSize: 13, color: '#888', marginTop: -6 },
  bigAmountInput: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 14, fontSize: 36, fontWeight: '900', color: colors.revenue, textAlign: 'center', borderWidth: 1, borderColor: '#2a2a2a' },

  // add/edit form
  modalSheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36, gap: 12 },
  formGap: { gap: 16 },
  catRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  catEmoji: { fontSize: 13 },
  catChipText: { fontSize: 12, fontWeight: '600', color: '#555' },

  subBuilderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  budgetAutoNote: { fontSize: 10, color: '#333' },
  formSubItem: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e', borderRadius: 12, padding: 12, marginBottom: 6, gap: 4 },
  formSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formSubName: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.white },
  formSubBudget: { fontSize: 12, color: '#555', backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  formSubDel: { fontSize: 12, color: '#333', padding: 4 },
  formSubDate: { fontSize: 10, color: '#333' },
  subDraftForm: { backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: '#1e1e1e', borderRadius: 14, padding: 14, gap: 10, marginBottom: 6 },
  subDraftRow: { flexDirection: 'row', gap: 8 },
  subDraftActions: { flexDirection: 'row', gap: 8 },
  subDraftCancel: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  subDraftCancelText: { fontSize: 13, fontWeight: '600', color: '#555' },
  subDraftSave: { flex: 1, height: 40, backgroundColor: colors.white, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  subDraftSaveText: { fontSize: 13, fontWeight: '700', color: colors.black },
  addSubGoalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e', borderRadius: 12, padding: 12 },
  addSubGoalIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  addSubGoalText: { fontSize: 13, color: '#444' },
  budgetSummary: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 14, padding: 14, gap: 10, marginTop: 8 },
  budgetSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budgetSummaryLabel: { fontSize: 12, color: '#888', flex: 1 },
  budgetSummaryValue: { fontSize: 13, fontWeight: '800', color: colors.white },
  budgetSummaryDivider: { height: 1, backgroundColor: '#1a1a1a' },

  pinnedToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  pinnedToggleActive: { borderColor: colors.fyp, backgroundColor: 'rgba(99,102,241,0.08)' },
  pinnedToggleText: { fontSize: 14, fontWeight: '600', color: colors.white },
  deleteGoalBtn: { height: 46, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteGoalBtnText: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
});
