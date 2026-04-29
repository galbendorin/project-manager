import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { addHabitDays, getHabitTodayKey, getHabitWeekStart } from '../utils/habitTracker';

const HABIT_SELECT = 'id, user_id, household_project_id, name, direction, color, sort_order, archived_at, created_at, updated_at';
const ENTRY_SELECT = 'id, habit_id, user_id, household_project_id, entry_date, status, note, created_at, updated_at';

const mapHabit = (row = {}) => ({
  id: row.id,
  userId: row.user_id || '',
  householdProjectId: row.household_project_id || '',
  name: row.name || '',
  direction: row.direction || 'positive',
  color: row.color || '#f59e0b',
  sortOrder: Number(row.sort_order) || 0,
  archivedAt: row.archived_at || '',
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

const mapEntry = (row = {}) => ({
  id: row.id,
  habitId: row.habit_id || '',
  userId: row.user_id || '',
  householdProjectId: row.household_project_id || '',
  entryDate: row.entry_date || '',
  status: row.status || '',
  note: row.note || '',
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

const getRangeStart = (selectedDate) => addHabitDays(getHabitWeekStart(selectedDate), -180);
const getRangeEnd = (selectedDate) => addHabitDays(getHabitWeekStart(selectedDate), 13);

const isMissingHabitsTableError = (error) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return msg.includes('habit_items') || msg.includes('habit_entries');
};

export function useHabitsData({ currentUserId } = {}) {
  const [selectedDate, setSelectedDate] = useState(getHabitTodayKey);
  const [habits, setHabits] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const range = useMemo(() => ({
    startDate: getRangeStart(selectedDate),
    endDate: getRangeEnd(selectedDate),
  }), [selectedDate]);

  const loadHabits = useCallback(async () => {
    if (!currentUserId) return [];
    const { data, error: loadError } = await supabase
      .from('habit_items')
      .select(HABIT_SELECT)
      .eq('user_id', currentUserId)
      .is('archived_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (loadError) throw loadError;
    const nextHabits = (data || []).map(mapHabit);
    setHabits(nextHabits);
    return nextHabits;
  }, [currentUserId]);

  const loadEntries = useCallback(async ({ startDate = range.startDate, endDate = range.endDate } = {}) => {
    if (!currentUserId) return [];
    const { data, error: loadError } = await supabase
      .from('habit_entries')
      .select(ENTRY_SELECT)
      .eq('user_id', currentUserId)
      .gte('entry_date', startDate)
      .lte('entry_date', endDate)
      .order('entry_date', { ascending: true });

    if (loadError) throw loadError;
    const nextEntries = (data || []).map(mapEntry);
    setEntries(nextEntries);
    return nextEntries;
  }, [currentUserId, range.endDate, range.startDate]);

  const loadAll = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError('');
    try {
      await Promise.all([
        loadHabits(),
        loadEntries(),
      ]);
    } catch (nextError) {
      setError(isMissingHabitsTableError(nextError)
        ? 'Habits needs the latest SQL migration before it can load.'
        : (nextError?.message || 'Unable to load Habits right now.'));
    } finally {
      setLoading(false);
    }
  }, [currentUserId, loadEntries, loadHabits]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const refresh = () => void loadAll();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadAll]);

  const addHabit = useCallback(async ({ name, direction = 'positive', color = '#f59e0b' } = {}) => {
    const title = String(name || '').trim();
    if (!title) throw new Error('Enter a habit name first.');
    setSaving(true);
    setError('');
    try {
      const nextSortOrder = habits.reduce((max, habit) => Math.max(max, habit.sortOrder || 0), 0) + 1;
      const { data, error: insertError } = await supabase
        .from('habit_items')
        .insert({
          user_id: currentUserId,
          name: title,
          direction: direction === 'negative' ? 'negative' : 'positive',
          color: color || '#f59e0b',
          sort_order: nextSortOrder,
        })
        .select(HABIT_SELECT)
        .single();
      if (insertError) throw insertError;
      setHabits((previous) => [...previous, mapHabit(data)]);
      return mapHabit(data);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to add habit.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, habits]);

  const updateHabit = useCallback(async (habitId, patch = {}) => {
    const payload = {};
    if (patch.name !== undefined) payload.name = String(patch.name || '').trim();
    if (patch.direction !== undefined) payload.direction = patch.direction === 'negative' ? 'negative' : 'positive';
    if (patch.color !== undefined) payload.color = patch.color || '#f59e0b';
    if (!Object.keys(payload).length) return;

    setSaving(true);
    setError('');
    try {
      const { data, error: updateError } = await supabase
        .from('habit_items')
        .update(payload)
        .eq('id', habitId)
        .select(HABIT_SELECT)
        .single();
      if (updateError) throw updateError;
      const nextHabit = mapHabit(data);
      setHabits((previous) => previous.map((habit) => (habit.id === habitId ? nextHabit : habit)));
    } catch (nextError) {
      setError(nextError?.message || 'Unable to update habit.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, []);

  const archiveHabit = useCallback(async (habitId) => {
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('habit_items')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', habitId);
      if (updateError) throw updateError;
      setHabits((previous) => previous.filter((habit) => habit.id !== habitId));
    } catch (nextError) {
      setError(nextError?.message || 'Unable to archive habit.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, []);

  const setEntryStatus = useCallback(async ({ habit, dateKey, status, note }) => {
    if (!habit?.id || !dateKey) return;
    setSaving(true);
    setError('');
    try {
      if (!status) {
        const { error: deleteError } = await supabase
          .from('habit_entries')
          .delete()
          .eq('habit_id', habit.id)
          .eq('entry_date', dateKey);
        if (deleteError) throw deleteError;
        setEntries((previous) => previous.filter((entry) => !(entry.habitId === habit.id && entry.entryDate === dateKey)));
        return;
      }

      const existing = entries.find((entry) => entry.habitId === habit.id && entry.entryDate === dateKey);
      const payload = {
        habit_id: habit.id,
        user_id: currentUserId,
        household_project_id: habit.householdProjectId || null,
        entry_date: dateKey,
        status,
        note: note ?? existing?.note ?? '',
      };
      const { data, error: upsertError } = await supabase
        .from('habit_entries')
        .upsert(payload, { onConflict: 'habit_id,entry_date' })
        .select(ENTRY_SELECT)
        .single();
      if (upsertError) throw upsertError;
      const nextEntry = mapEntry(data);
      setEntries((previous) => {
        const withoutExisting = previous.filter((entry) => !(entry.habitId === habit.id && entry.entryDate === dateKey));
        return [...withoutExisting, nextEntry].sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate)));
      });
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save journal entry.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, entries]);

  const updateEntryNote = useCallback(async ({ habit, dateKey, note = '' }) => {
    const existing = entries.find((entry) => entry.habitId === habit?.id && entry.entryDate === dateKey);
    await setEntryStatus({
      habit,
      dateKey,
      status: existing?.status || 'skip',
      note,
    });
  }, [entries, setEntryStatus]);

  return {
    addHabit,
    archiveHabit,
    entries,
    error,
    habits,
    loading,
    refresh: loadAll,
    saving,
    selectedDate,
    setEntryStatus,
    setSelectedDate,
    today: getHabitTodayKey(),
    updateEntryNote,
    updateHabit,
    goToPreviousWeek: () => setSelectedDate((current) => addHabitDays(current, -7)),
    goToNextWeek: () => setSelectedDate((current) => addHabitDays(current, 7)),
    goToToday: () => setSelectedDate(getHabitTodayKey()),
  };
}
