import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Switch, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useRoutineStore, RoutineItem, RoutineAlarm } from '../store/routineStore';
import { colors } from '../lib/colors';

const CATEGORY_COLORS = [
  '#22C55E', '#3B82F6', '#EAB308', '#EF4444',
  '#A855F7', '#F97316', '#06B6D4', '#EC4899',
];

const FREQ_OPTIONS: { label: string; key: 'daily' | 'weekdays' | 'weekends' }[] = [
  { label: 'Every day', key: 'daily' },
  { label: 'Weekdays', key: 'weekdays' },
  { label: 'Weekends', key: 'weekends' },
];

function pad(n: number) { return String(n).padStart(2, '0'); }

function fmtAlarmTime(hour: number, minute: number) {
  const ampm = hour < 12 ? 'AM' : 'PM';
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h}:${pad(minute)} ${ampm}`;
}

export default function RoutinesScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    categories, items, alarms, loading,
    fetchAll, addCategory, updateCategory, deleteCategory,
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
  const [newAlarmFreq, setNewAlarmFreq] = useState<'daily' | 'weekdays' | 'weekends'>('daily');
  const [savingAlarm, setSavingAlarm] = useState(false);

  useEffect(() => {
    if (user) fetchAll(user.id);
  }, [user]);

  // ── Item CRUD ──
  function openNewItem() {
    setIsNewItem(true);
    setEditItem(null);
    setItemTitle('');
    setItemDur('');
    setItemCatId(null);
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

  function openEditCat(cat: typeof categories[0]) {
    setEditCat({ id: cat.id, name: cat.name, color: cat.color });
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
    setNewAlarmFreq('daily');
    setShowAlarmEditor(true);
  }

  async function handleAddAlarm() {
    if (!alarmItem) return;
    setSavingAlarm(true);
    await addAlarm(alarmItem.id, alarmItem.title, newAlarmHour, newAlarmMin, newAlarmFreq);
    setSavingAlarm(false);
  }

  const uncategorized = items.filter((i) => !i.category_id);
  const catGroups = categories.map((cat) => ({
    cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));

  const sheetOpen = !!editItem || isNewItem;
  const alarmItemAlarms = alarmItem ? alarms.filter((a) => a.routine_item_id === alarmItem.id) : [];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Routines</Text>
        <TouchableOpacity style={styles.addCatBtn} onPress={openNewCat}>
          <Text style={styles.addCatBtnText}>+ Category</Text>
        </TouchableOpacity>
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
                <Text style={styles.groupCount}>{catItems.length}</Text>
                <TouchableOpacity onPress={() => openEditCat(cat)} style={styles.editCatBtn}>
                  <Text style={styles.editCatBtnText}>Edit</Text>
                </TouchableOpacity>
              </View>
              {catItems.map((item) => (
                <RoutineItemRow
                  key={item.id}
                  item={item}
                  catColor={cat.color}
                  alarmCount={alarms.filter((a) => a.routine_item_id === item.id && a.is_active).length}
                  onEdit={() => openEditItem(item)}
                  onAlarms={() => openAlarms(item)}
                  onDelete={() => handleDeleteItem(item)}
                />
              ))}
              <TouchableOpacity style={styles.addItemRow} onPress={() => { setItemCatId(cat.id); openNewItem(); }}>
                <Text style={styles.addItemText}>+ Add item to {cat.name}</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Uncategorized */}
          {uncategorized.length > 0 && (
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <View style={[styles.groupDot, { backgroundColor: '#333' }]} />
                <Text style={styles.groupName}>Uncategorized</Text>
                <Text style={styles.groupCount}>{uncategorized.length}</Text>
              </View>
              {uncategorized.map((item) => (
                <RoutineItemRow
                  key={item.id}
                  item={item}
                  catColor="#333"
                  alarmCount={alarms.filter((a) => a.routine_item_id === item.id && a.is_active).length}
                  onEdit={() => openEditItem(item)}
                  onAlarms={() => openAlarms(item)}
                  onDelete={() => handleDeleteItem(item)}
                />
              ))}
            </View>
          )}

          {/* Global add */}
          <TouchableOpacity style={styles.globalAddBtn} onPress={openNewItem} activeOpacity={0.8}>
            <Text style={styles.globalAddBtnText}>+ Add Routine Item</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Item editor sheet */}
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
                      style={[styles.catChip, itemCatId === cat.id && styles.catChipActive, { borderColor: itemCatId === cat.id ? cat.color : '#1e1e1e' }]}
                      onPress={() => setItemCatId(cat.id)}
                    >
                      <View style={[styles.catDotSm, { backgroundColor: cat.color }]} />
                      <Text style={[styles.catChipText, itemCatId === cat.id && styles.catChipTextActive]}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

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

      {/* Category editor */}
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

      {/* Alarm editor */}
      <Modal visible={showAlarmEditor} transparent animationType="slide" onRequestClose={() => setShowAlarmEditor(false)}>
        <TouchableOpacity style={styles.modalBg} onPress={() => setShowAlarmEditor(false)} activeOpacity={1} />
        <View style={styles.alarmSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Alarms for "{alarmItem?.title}"</Text>

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

          {/* Add new alarm */}
          <Text style={styles.fieldLabel} >Add New Alarm</Text>
          <View style={styles.timePickerRow}>
            {/* Hour picker */}
            <ScrollView style={styles.timePicker} showsVerticalScrollIndicator={false}>
              {Array.from({ length: 24 }, (_, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.timePickerItem, newAlarmHour === i && styles.timePickerItemActive]}
                  onPress={() => setNewAlarmHour(i)}
                >
                  <Text style={[styles.timePickerText, newAlarmHour === i && styles.timePickerTextActive]}>
                    {pad(i)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.timeSep}>:</Text>
            {/* Minute picker */}
            <ScrollView style={styles.timePicker} showsVerticalScrollIndicator={false}>
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
            {savingAlarm ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Add Alarm</Text>}
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function RoutineItemRow({ item, catColor, alarmCount, onEdit, onAlarms, onDelete }: {
  item: RoutineItem;
  catColor: string;
  alarmCount: number;
  onEdit: () => void;
  onAlarms: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={itemStyles.row}>
      <View style={[itemStyles.accent, { backgroundColor: catColor }]} />
      <View style={itemStyles.body}>
        <Text style={itemStyles.name}>{item.title}</Text>
        <View style={itemStyles.meta}>
          {item.duration_minutes ? <Text style={itemStyles.dur}>{item.duration_minutes}m</Text> : null}
          {alarmCount > 0 && <Text style={itemStyles.alarm}>🔔 {alarmCount}</Text>}
        </View>
      </View>
      <TouchableOpacity style={itemStyles.btn} onPress={onAlarms}>
        <Text style={itemStyles.btnText}>🔔</Text>
      </TouchableOpacity>
      <TouchableOpacity style={itemStyles.btn} onPress={onEdit}>
        <Text style={itemStyles.btnText}>✏️</Text>
      </TouchableOpacity>
      <TouchableOpacity style={itemStyles.btn} onPress={onDelete}>
        <Text style={[itemStyles.btnText, { color: '#EF4444' }]}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function AlarmRow({ alarm, onToggle, onDelete }: { alarm: RoutineAlarm; onToggle: () => void; onDelete: () => void }) {
  return (
    <View style={alarmStyles.row}>
      <View style={{ flex: 1 }}>
        <Text style={alarmStyles.time}>{fmtAlarmTime(alarm.hour, alarm.minute)}</Text>
        <Text style={alarmStyles.freq}>{FREQ_OPTIONS.find(f => f.key === alarm.frequency)?.label}</Text>
      </View>
      <Switch
        value={alarm.is_active}
        onValueChange={onToggle}
        trackColor={{ false: '#2a2a2a', true: colors.revenue }}
        thumbColor={colors.white}
      />
      <TouchableOpacity onPress={onDelete} style={{ padding: 4 }}>
        <Text style={{ color: '#333', fontWeight: '700' }}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8 },
  backText: { fontSize: 14, fontWeight: '600', color: colors.grey600, width: 60 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.white },
  addCatBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e', borderRadius: 10 },
  addCatBtnText: { fontSize: 12, fontWeight: '600', color: colors.grey600 },
  scroll: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 60, gap: 20 },

  group: { gap: 4 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupName: { flex: 1, fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 1 },
  groupCount: { fontSize: 11, color: '#444', fontWeight: '600' },
  editCatBtn: { padding: 4 },
  editCatBtnText: { fontSize: 11, color: '#444', fontWeight: '600' },
  addItemRow: { paddingVertical: 10, paddingHorizontal: 4 },
  addItemText: { fontSize: 13, color: '#2a2a2a', fontStyle: 'italic' },

  globalAddBtn: {
    height: 50, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e',
    borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  globalAddBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 16 },
  alarmSheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 14, maxHeight: '80%' },
  sheetHandle: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1 },
  fieldInput: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, fontSize: 15, color: colors.white, borderWidth: 1, borderColor: '#2a2a2a' },
  catChipRow: { flexDirection: 'row', gap: 8 },
  catChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#1e1e1e', flexDirection: 'row', alignItems: 'center', gap: 6 },
  catChipActive: { backgroundColor: '#2a2a2a' },
  catChipText: { fontSize: 12, fontWeight: '600', color: '#555' },
  catChipTextActive: { color: colors.white },
  catDotSm: { width: 8, height: 8, borderRadius: 4 },
  saveBtn: { height: 52, backgroundColor: colors.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnDisabled: { opacity: 0.3 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: colors.black },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: { width: 34, height: 34, borderRadius: 10 },
  colorSwatchActive: { borderWidth: 3, borderColor: colors.white },
  deleteCatBtn: { height: 46, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteCatBtnText: { fontSize: 14, fontWeight: '700', color: '#EF4444' },

  alarmList: { gap: 4, marginBottom: 4 },
  timePickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 160 },
  timePicker: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12 },
  timePickerItem: { paddingVertical: 10, alignItems: 'center' },
  timePickerItemActive: { backgroundColor: '#2a2a2a', borderRadius: 8 },
  timePickerText: { fontSize: 18, fontWeight: '600', color: '#444', fontVariant: ['tabular-nums'] },
  timePickerTextActive: { color: colors.white },
  timeSep: { fontSize: 24, fontWeight: '700', color: '#333' },
  freqRow: { flexDirection: 'row', gap: 8 },
  freqChip: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  freqChipActive: { backgroundColor: colors.white, borderColor: colors.white },
  freqChipText: { fontSize: 11, fontWeight: '700', color: '#444' },
  freqChipTextActive: { color: colors.black },
});

const itemStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 12, padding: 12, gap: 10, marginBottom: 4 },
  accent: { width: 3, height: 28, borderRadius: 2 },
  body: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: '#ccc' },
  meta: { flexDirection: 'row', gap: 8, marginTop: 2 },
  dur: { fontSize: 11, color: '#444' },
  alarm: { fontSize: 11, color: '#444' },
  btn: { padding: 6 },
  btnText: { fontSize: 14 },
});

const alarmStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12 },
  time: { fontSize: 16, fontWeight: '700', color: colors.white },
  freq: { fontSize: 11, color: '#444', marginTop: 2 },
});
