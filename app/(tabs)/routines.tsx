import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Switch, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useRoutineStore, RoutineItem, RoutineAlarm } from '../../store/routineStore';
import { requestLocalNotificationPermissions } from '../../lib/notifications';
import { colors } from '../../lib/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = [
  '#22C55E', '#3B82F6', '#EAB308', '#EF4444',
  '#A855F7', '#F97316', '#06B6D4', '#EC4899',
];

const FREQ_OPTIONS: { label: string; key: 'daily' | 'weekdays' | 'weekends' }[] = [
  { label: 'Every day', key: 'daily' },
  { label: 'Weekdays', key: 'weekdays' },
  { label: 'Weekends', key: 'weekends' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }

function fmtAlarm(hour: number, minute: number) {
  const ampm = hour < 12 ? 'AM' : 'PM';
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `🔔 ${h}:${pad(minute)} ${ampm}`;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RoutinesScreen() {
  const { user } = useAuthStore();
  const {
    categories, items, alarms, completions, loading,
    fetchAll, fetchCompletions, toggleCompletion,
    addCategory, updateCategory, deleteCategory,
    addItem, updateItem, deleteItem,
    addAlarm, toggleAlarm, deleteAlarm,
  } = useRoutineStore();

  // Item editor sheet
  const [editItem, setEditItem] = useState<RoutineItem | null>(null);
  const [isNewItem, setIsNewItem] = useState(false);
  const [itemTitle, setItemTitle] = useState('');
  const [itemDur, setItemDur] = useState('');
  const [itemCatId, setItemCatId] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  // Category editor
  const [showCatEditor, setShowCatEditor] = useState(false);
  const [editCat, setEditCat] = useState<{ id?: string; name: string; color: string } | null>(null);

  // Alarm editor
  const [alarmItem, setAlarmItem] = useState<RoutineItem | null>(null);
  const [showAlarmEditor, setShowAlarmEditor] = useState(false);
  const [newAlarmHour, setNewAlarmHour] = useState(8);
  const [newAlarmMin, setNewAlarmMin] = useState(0);
  const [newAlarmAmPm, setNewAlarmAmPm] = useState<'AM' | 'PM'>('AM');
  const [newAlarmFreq, setNewAlarmFreq] = useState<'daily' | 'weekdays' | 'weekends'>('daily');
  const [savingAlarm, setSavingAlarm] = useState(false);

  const hourScrollRef = useRef<ScrollView>(null);
  const minScrollRef = useRef<ScrollView>(null);
  const ITEM_HEIGHT = 40; // matches paddingVertical: 10 * 2 + fontSize ~18 ≈ 40
  const MIN_VALUES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  useEffect(() => {
    if (user) fetchAll(user.id);
  }, [user]);

  // Auto-scroll time pickers to selected value when modal opens
  useEffect(() => {
    if (!showAlarmEditor) return;
    const t = setTimeout(() => {
      // Hour: index = newAlarmHour - 1 (list is 1-12)
      hourScrollRef.current?.scrollTo({ y: (newAlarmHour - 1) * ITEM_HEIGHT, animated: true });
      // Minute: find index in MIN_VALUES
      const minIdx = MIN_VALUES.indexOf(newAlarmMin);
      if (minIdx >= 0) minScrollRef.current?.scrollTo({ y: minIdx * ITEM_HEIGHT, animated: true });
    }, 120); // small delay so modal finishes mounting
    return () => clearTimeout(t);
  }, [showAlarmEditor]);

  // Derived
  const totalItems = items.length;
  const doneCount = completions.length;
  const progressPct = totalItems > 0 ? doneCount / totalItems : 0;

  const catGroups = categories.map((cat) => ({
    cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));
  const uncategorized = items.filter((i) => !i.category_id);

  // ── Helpers ──

  function firstActiveAlarm(itemId: string): RoutineAlarm | undefined {
    return alarms.find((a) => a.routine_item_id === itemId && a.is_active);
  }

  // ── Item CRUD ──

  function openNewItem(catId?: string) {
    setIsNewItem(true);
    setEditItem(null);
    setItemTitle('');
    setItemDur('');
    setItemCatId(catId ?? null);
  }

  function openEditItem(item: RoutineItem) {
    setIsNewItem(false);
    setEditItem(item);
    setItemTitle(item.title);
    setItemDur(item.duration_minutes ? String(item.duration_minutes) : '');
    setItemCatId(item.category_id);
  }

  async function handleSaveItem() {
    if (!itemTitle.trim() || !user) return;
    setSavingItem(true);
    const dur = parseInt(itemDur) || null;
    if (isNewItem) {
      await addItem(user.id, itemTitle.trim(), dur, itemCatId);
    } else if (editItem) {
      await updateItem(editItem.id, itemTitle.trim(), dur, itemCatId);
    }
    setSavingItem(false);
    setEditItem(null);
    setIsNewItem(false);
  }

  async function handleDeleteItem(item: RoutineItem) {
    Alert.alert('Delete Item?', `"${item.title}" and all its alarms will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteItem(item.id) },
    ]);
  }

  // ── Category CRUD ──

  function openNewCat() {
    setEditCat({ name: '', color: CATEGORY_COLORS[0] });
    setShowCatEditor(true);
  }

  async function handleSaveCat() {
    if (!editCat?.name.trim() || !user) return;
    if (editCat.id) {
      await updateCategory(editCat.id, editCat.name.trim(), editCat.color);
    } else {
      await addCategory(user.id, editCat.name.trim(), editCat.color);
    }
    setShowCatEditor(false);
    setEditCat(null);
  }

  // ── Alarms ──

  function openAlarms(item: RoutineItem) {
    setAlarmItem(item);
    setNewAlarmHour(8);
    setNewAlarmMin(0);
    setNewAlarmAmPm('AM');
    setNewAlarmFreq('daily');
    setShowAlarmEditor(true);
  }

  async function handleAddAlarm() {
    if (!alarmItem) return;
    setSavingAlarm(true);

    const granted = await requestLocalNotificationPermissions();
    if (!granted) {
      Alert.alert(
        'Notifications Required',
        'Please allow notifications in your device settings to set alarms.',
      );
      setSavingAlarm(false);
      return;
    }

    let hour24 = newAlarmHour % 12;
    if (newAlarmAmPm === 'PM') hour24 += 12;

    try {
      await addAlarm(user.id, alarmItem.id, alarmItem.title, hour24, newAlarmMin, newAlarmFreq);
      setShowAlarmEditor(false);
    } catch (e: any) {
      Alert.alert('Failed to save alarm', e?.message ?? 'Unknown error. Make sure the routine_alarms table exists in Supabase.');
    }
    setSavingAlarm(false);
  }

  const sheetOpen = !!editItem || isNewItem;
  const alarmItemAlarms = alarmItem ? alarms.filter((a) => a.routine_item_id === alarmItem.id) : [];

  return (
    <SafeAreaView style={styles.container}>

      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>📋 My Routines</Text>
          <Text style={styles.headerSub}>{doneCount} / {totalItems} done today</Text>
        </View>
        <TouchableOpacity style={styles.addCatBtn} onPress={openNewCat}>
          <Text style={styles.addCatBtnText}>+ Category</Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progressPct * 100)}%` as any }]} />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.white} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* Category groups */}
          {catGroups.map(({ cat, items: catItems }) => (
            <View key={cat.id} style={styles.group}>
              <View style={styles.groupHeader}>
                <View style={[styles.groupDot, { backgroundColor: cat.color }]} />
                <Text style={styles.groupName}>{cat.name}</Text>
                <Text style={styles.groupCount}>
                  {catItems.filter((i) => completions.includes(i.id)).length}/{catItems.length}
                </Text>
                <TouchableOpacity
                  style={styles.editCatBtn}
                  onPress={() => { setEditCat({ id: cat.id, name: cat.name, color: cat.color }); setShowCatEditor(true); }}
                >
                  <Text style={styles.editCatBtnText}>⋯</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.groupCard}>
                {catItems.map((item, idx) => {
                  const done = completions.includes(item.id);
                  const alarm = firstActiveAlarm(item.id);
                  return (
                    <View key={item.id}>
                      <RoutineRow
                        item={item}
                        catColor={cat.color}
                        done={done}
                        alarmLabel={alarm ? fmtAlarm(alarm.hour, alarm.minute) : undefined}
                        onToggle={() => user && toggleCompletion(user.id, item.id)}
                        onEdit={() => openEditItem(item)}
                        onAlarms={() => openAlarms(item)}
                      />
                      {idx < catItems.length - 1 && <View style={styles.rowDivider} />}
                    </View>
                  );
                })}
                <TouchableOpacity
                  style={styles.addItemRow}
                  onPress={() => openNewItem(cat.id)}
                >
                  <Text style={styles.addItemText}>＋  Add to {cat.name}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* Uncategorized */}
          {uncategorized.length > 0 && (
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <View style={[styles.groupDot, { backgroundColor: '#2a2a2a' }]} />
                <Text style={styles.groupName}>Uncategorized</Text>
                <Text style={styles.groupCount}>
                  {uncategorized.filter((i) => completions.includes(i.id)).length}/{uncategorized.length}
                </Text>
              </View>
              <View style={styles.groupCard}>
                {uncategorized.map((item, idx) => {
                  const done = completions.includes(item.id);
                  const alarm = firstActiveAlarm(item.id);
                  return (
                    <View key={item.id}>
                      <RoutineRow
                        item={item}
                        catColor="#2a2a2a"
                        done={done}
                        alarmLabel={alarm ? fmtAlarm(alarm.hour, alarm.minute) : undefined}
                        onToggle={() => user && toggleCompletion(user.id, item.id)}
                        onEdit={() => openEditItem(item)}
                        onAlarms={() => openAlarms(item)}
                      />
                      {idx < uncategorized.length - 1 && <View style={styles.rowDivider} />}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Add first item CTA */}
          <TouchableOpacity style={styles.globalAddBtn} onPress={() => openNewItem()} activeOpacity={0.8}>
            <Text style={styles.globalAddBtnText}>＋  Add Routine Item</Text>
          </TouchableOpacity>

          {items.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No routines yet</Text>
              <Text style={styles.emptySub}>Build your daily system and track it here</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ─── Item editor sheet ────────────────────────────────────────────── */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => { setEditItem(null); setIsNewItem(false); }}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalBg} onPress={() => { setEditItem(null); setIsNewItem(false); }} activeOpacity={1} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{isNewItem ? 'New Routine Item' : 'Edit Item'}</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.fieldInput}
                value={itemTitle}
                onChangeText={setItemTitle}
                placeholder="e.g. Morning run"
                placeholderTextColor="#333"
                autoFocus
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Duration (minutes, optional)</Text>
              <TextInput
                style={styles.fieldInput}
                value={itemDur}
                onChangeText={setItemDur}
                placeholder="e.g. 30"
                placeholderTextColor="#333"
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.catChipRow}>
                  <TouchableOpacity
                    style={[styles.catChip, !itemCatId && styles.catChipActive]}
                    onPress={() => setItemCatId(null)}
                  >
                    <Text style={[styles.catChipText, !itemCatId && styles.catChipTextActive]}>None</Text>
                  </TouchableOpacity>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.catChip, itemCatId === cat.id && { backgroundColor: `${cat.color}20`, borderColor: cat.color }]}
                      onPress={() => setItemCatId(cat.id)}
                    >
                      <View style={[styles.catDotSm, { backgroundColor: cat.color }]} />
                      <Text style={[styles.catChipText, itemCatId === cat.id && { color: cat.color }]}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {!isNewItem && editItem && (
              <TouchableOpacity style={styles.deleteItemBtn} onPress={() => { handleDeleteItem(editItem); setEditItem(null); setIsNewItem(false); }}>
                <Text style={styles.deleteItemBtnText}>Delete Item</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, (!itemTitle.trim() || savingItem) && styles.saveBtnDisabled]}
              onPress={handleSaveItem}
              disabled={!itemTitle.trim() || savingItem}
            >
              {savingItem ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Category editor ──────────────────────────────────────────────── */}
      <Modal visible={showCatEditor} transparent animationType="slide" onRequestClose={() => setShowCatEditor(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setShowCatEditor(false)} activeOpacity={1} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{editCat?.id ? 'Edit Category' : 'New Category'}</Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={editCat?.name ?? ''}
                onChangeText={(v) => setEditCat((c) => c ? { ...c, name: v } : c)}
                placeholder="e.g. Morning, Health, Work"
                placeholderTextColor="#333"
                autoFocus
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Color</Text>
              <View style={styles.colorGrid}>
                {CATEGORY_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorSwatch, { backgroundColor: c }, editCat?.color === c && styles.colorSwatchActive]}
                    onPress={() => setEditCat((ec) => ec ? { ...ec, color: c } : ec)}
                  />
                ))}
              </View>
            </View>
            {editCat?.id && (
              <TouchableOpacity
                style={styles.deleteCatBtn}
                onPress={() => { deleteCategory(editCat.id!); setShowCatEditor(false); }}
              >
                <Text style={styles.deleteCatBtnText}>Delete Category</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.saveBtn, !editCat?.name.trim() && styles.saveBtnDisabled]}
              onPress={handleSaveCat}
              disabled={!editCat?.name.trim()}
            >
              <Text style={styles.saveBtnText}>Save Category</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Alarm editor ─────────────────────────────────────────────────── */}
      <Modal visible={showAlarmEditor} transparent animationType="slide" onRequestClose={() => setShowAlarmEditor(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowAlarmEditor(false)} activeOpacity={1} />
          <ScrollView style={styles.alarmSheet} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Alarms — {alarmItem?.title}</Text>

            {/* Existing alarms */}
            {alarmItemAlarms.length > 0 && (
              <View style={styles.alarmList}>
                {alarmItemAlarms.map((alarm) => (
                  <AlarmRow
                    key={alarm.id}
                    alarm={alarm}
                    onToggle={() => toggleAlarm(alarm.id)}
                    onDelete={() => deleteAlarm(alarm.id)}
                  />
                ))}
              </View>
            )}

            <Text style={[styles.fieldLabel, { marginTop: alarmItemAlarms.length > 0 ? 16 : 0, marginBottom: 12 }]}>
              Add New Alarm
            </Text>

            {/* Time picker: 12h scrollers + AM/PM toggle */}
            <View style={styles.timePickerRow}>
              {/* Hour 1–12 */}
              <ScrollView ref={hourScrollRef} style={styles.timePicker} showsVerticalScrollIndicator={false}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.timePickerItem, newAlarmHour === h && styles.timePickerItemActive]}
                    onPress={() => setNewAlarmHour(h)}
                  >
                    <Text style={[styles.timePickerText, newAlarmHour === h && styles.timePickerTextActive]}>
                      {pad(h)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.timeSep}>:</Text>

              {/* Minute 0,5,10...55 */}
              <ScrollView ref={minScrollRef} style={styles.timePicker} showsVerticalScrollIndicator={false}>
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.timePickerItem, newAlarmMin === m && styles.timePickerItemActive]}
                    onPress={() => setNewAlarmMin(m)}
                  >
                    <Text style={[styles.timePickerText, newAlarmMin === m && styles.timePickerTextActive]}>
                      {pad(m)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* AM/PM toggle */}
              <View style={styles.ampmCol}>
                {(['AM', 'PM'] as const).map((period) => (
                  <TouchableOpacity
                    key={period}
                    style={[styles.ampmBtn, newAlarmAmPm === period && styles.ampmBtnActive]}
                    onPress={() => setNewAlarmAmPm(period)}
                  >
                    <Text style={[styles.ampmText, newAlarmAmPm === period && styles.ampmTextActive]}>
                      {period}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Frequency */}
            <View style={styles.freqRow}>
              {FREQ_OPTIONS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.freqChip, newAlarmFreq === f.key && styles.freqChipActive]}
                  onPress={() => setNewAlarmFreq(f.key)}
                >
                  <Text style={[styles.freqChipText, newAlarmFreq === f.key && styles.freqChipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, savingAlarm && { opacity: 0.5 }]}
              onPress={handleAddAlarm}
              disabled={savingAlarm}
            >
              {savingAlarm
                ? <ActivityIndicator color={colors.black} />
                : <Text style={styles.saveBtnText}>Add Alarm</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Row component ────────────────────────────────────────────────────────────

function RoutineRow({ item, catColor, done, alarmLabel, onToggle, onEdit, onAlarms }: {
  item: RoutineItem;
  catColor: string;
  done: boolean;
  alarmLabel?: string;
  onToggle: () => void;
  onEdit: () => void;
  onAlarms: () => void;
}) {
  return (
    <TouchableOpacity style={rowStyles.row} onPress={onToggle} activeOpacity={0.75}>
      {/* Left color accent */}
      <View style={[rowStyles.accent, { backgroundColor: catColor }]} />

      {/* Checkbox */}
      <View style={[rowStyles.check, done && { backgroundColor: `${catColor}22`, borderColor: 'transparent' }]}>
        {done && <Text style={[rowStyles.checkMark, { color: catColor }]}>✓</Text>}
      </View>

      {/* Title + meta */}
      <View style={rowStyles.body}>
        <Text style={[rowStyles.name, done && rowStyles.nameDone]}>{item.title}</Text>
        <View style={rowStyles.metaRow}>
          {item.duration_minutes ? <Text style={rowStyles.dur}>{item.duration_minutes}m</Text> : null}
          {alarmLabel ? <Text style={rowStyles.alarm}>{alarmLabel}</Text> : null}
        </View>
      </View>

      {/* Action buttons */}
      <TouchableOpacity style={rowStyles.iconBtn} onPress={onAlarms} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={rowStyles.iconBtnText}>🔔</Text>
      </TouchableOpacity>
      <TouchableOpacity style={rowStyles.iconBtn} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={rowStyles.iconBtnText}>✏️</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Alarm row ────────────────────────────────────────────────────────────────

function AlarmRow({ alarm, onToggle, onDelete }: { alarm: RoutineAlarm; onToggle: () => void; onDelete: () => void }) {
  const ampm = alarm.hour < 12 ? 'AM' : 'PM';
  const h = alarm.hour === 0 ? 12 : alarm.hour > 12 ? alarm.hour - 12 : alarm.hour;
  const timeStr = `${h}:${pad(alarm.minute)} ${ampm}`;
  return (
    <View style={alarmStyles.row}>
      <View style={{ flex: 1 }}>
        <Text style={alarmStyles.time}>{timeStr}</Text>
        <Text style={alarmStyles.freq}>{FREQ_OPTIONS.find((f) => f.key === alarm.frequency)?.label}</Text>
      </View>
      <Switch
        value={alarm.is_active}
        onValueChange={onToggle}
        trackColor={{ false: '#2a2a2a', true: colors.revenue }}
        thumbColor={colors.white}
      />
      <TouchableOpacity onPress={onDelete} style={{ padding: 6 }}>
        <Text style={{ color: '#333', fontWeight: '700', fontSize: 13 }}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8 },
  headerLeft: { gap: 2 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.white },
  headerSub: { fontSize: 12, color: '#444', fontWeight: '500' },
  addCatBtn: { paddingVertical: 7, paddingHorizontal: 14, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e', borderRadius: 10 },
  addCatBtnText: { fontSize: 12, fontWeight: '600', color: '#888' },

  progressTrack: { height: 3, backgroundColor: '#111', marginHorizontal: 22, borderRadius: 2, marginBottom: 12, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: colors.revenue, borderRadius: 2 },

  scroll: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 80, gap: 20 },

  group: { gap: 6 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupName: { flex: 1, fontSize: 11, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 1.2 },
  groupCount: { fontSize: 11, color: '#333', fontWeight: '600' },
  editCatBtn: { paddingVertical: 3, paddingHorizontal: 8 },
  editCatBtnText: { fontSize: 16, color: '#333' },

  groupCard: { backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 16, overflow: 'hidden' },
  rowDivider: { height: 1, backgroundColor: '#161616', marginLeft: 56 },

  addItemRow: { paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#161616' },
  addItemText: { fontSize: 13, color: '#2a2a2a', fontStyle: 'italic' },

  globalAddBtn: { height: 50, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  globalAddBtnText: { fontSize: 14, fontWeight: '700', color: '#555' },

  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyIcon: { fontSize: 36 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.white },
  emptySub: { fontSize: 13, color: '#444', textAlign: 'center' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 16 },
  alarmSheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '80%' },
  sheetHandle: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.white, letterSpacing: -0.4, marginBottom: 4 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1 },
  fieldInput: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, fontSize: 15, color: colors.white, borderWidth: 1, borderColor: '#2a2a2a' },
  catChipRow: { flexDirection: 'row', gap: 8 },
  catChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#1e1e1e', flexDirection: 'row', alignItems: 'center', gap: 6 },
  catChipActive: { backgroundColor: '#2a2a2a' },
  catChipText: { fontSize: 12, fontWeight: '600', color: '#555' },
  catChipTextActive: { color: colors.white },
  catDotSm: { width: 8, height: 8, borderRadius: 4 },

  deleteItemBtn: { height: 44, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteItemBtnText: { fontSize: 13, fontWeight: '700', color: '#EF4444' },

  saveBtn: { height: 52, backgroundColor: colors.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnDisabled: { opacity: 0.3 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: colors.black },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: { width: 34, height: 34, borderRadius: 10 },
  colorSwatchActive: { borderWidth: 3, borderColor: colors.white },
  deleteCatBtn: { height: 46, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteCatBtnText: { fontSize: 14, fontWeight: '700', color: '#EF4444' },

  alarmList: { gap: 6, marginBottom: 4 },
  timePickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 160, marginBottom: 14 },
  timePicker: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12 },
  timePickerItem: { height: 40, alignItems: 'center', justifyContent: 'center' },
  timePickerItemActive: { backgroundColor: '#2a2a2a', borderRadius: 8 },
  timePickerText: { fontSize: 18, fontWeight: '600', color: '#444', fontVariant: ['tabular-nums'] },
  timePickerTextActive: { color: colors.white },
  timeSep: { fontSize: 24, fontWeight: '700', color: '#2a2a2a' },
  ampmCol: { gap: 6 },
  ampmBtn: { width: 52, height: 44, borderRadius: 10, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  ampmBtnActive: { backgroundColor: colors.white, borderColor: colors.white },
  ampmText: { fontSize: 13, fontWeight: '700', color: '#444' },
  ampmTextActive: { color: colors.black },
  freqRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  freqChip: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  freqChipActive: { backgroundColor: colors.white, borderColor: colors.white },
  freqChipText: { fontSize: 11, fontWeight: '700', color: '#444' },
  freqChipTextActive: { color: colors.black },
});

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingRight: 12 },
  accent: { width: 3, height: '100%', marginRight: 12 },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  checkMark: { fontSize: 12, fontWeight: '900' },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '600', color: '#ccc' },
  nameDone: { color: '#333', textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', gap: 10 },
  dur: { fontSize: 11, color: '#333' },
  alarm: { fontSize: 11, color: '#333' },
  iconBtn: { padding: 6 },
  iconBtnText: { fontSize: 14 },
});

const alarmStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, marginBottom: 6 },
  time: { fontSize: 16, fontWeight: '700', color: colors.white },
  freq: { fontSize: 11, color: '#444', marginTop: 2 },
});
