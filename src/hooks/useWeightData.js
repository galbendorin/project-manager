import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  convertWeightToKg,
  getWeightTodayKey,
  normalizeWeightUnit,
  parseWeightInput,
  summarizeWeightEntries,
} from '../utils/weightTracker';

const ENTRY_SELECT = 'id, user_id, measured_on, weight_value, weight_unit, weight_kg, note, created_at, updated_at';
const SETTINGS_SELECT = 'user_id, preferred_unit, goal_weight_kg, created_at, updated_at';

const mapEntry = (row = {}) => ({
  id: row.id,
  userId: row.user_id || '',
  measuredOn: row.measured_on || '',
  weightValue: Number(row.weight_value) || 0,
  weightUnit: normalizeWeightUnit(row.weight_unit),
  weightKg: Number(row.weight_kg) || 0,
  note: row.note || '',
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

const mapSettings = (row = {}) => ({
  preferredUnit: normalizeWeightUnit(row.preferred_unit || 'kg'),
  goalWeightKg: Number(row.goal_weight_kg) > 0 ? Number(row.goal_weight_kg) : null,
  updatedAt: row.updated_at || '',
});

const sortEntriesDesc = (entries = []) => (
  [...entries].sort((left, right) => String(right.measuredOn).localeCompare(String(left.measuredOn)))
);

const isMissingWeightTableError = (error) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return msg.includes('weight_entries') || msg.includes('weight_tracker_settings');
};

export function useWeightData({ currentUserId } = {}) {
  const [entries, setEntries] = useState([]);
  const [settings, setSettings] = useState({ preferredUnit: 'kg', goalWeightKg: null, updatedAt: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadEntries = useCallback(async () => {
    if (!currentUserId) return [];
    const { data, error: loadError } = await supabase
      .from('weight_entries')
      .select(ENTRY_SELECT)
      .eq('user_id', currentUserId)
      .order('measured_on', { ascending: false })
      .limit(180);

    if (loadError) throw loadError;
    const nextEntries = sortEntriesDesc((data || []).map(mapEntry));
    setEntries(nextEntries);
    return nextEntries;
  }, [currentUserId]);

  const loadSettings = useCallback(async () => {
    if (!currentUserId) return { preferredUnit: 'kg', goalWeightKg: null, updatedAt: '' };
    const { data, error: loadError } = await supabase
      .from('weight_tracker_settings')
      .select(SETTINGS_SELECT)
      .eq('user_id', currentUserId)
      .maybeSingle();

    if (loadError) throw loadError;
    const nextSettings = data ? mapSettings(data) : { preferredUnit: 'kg', goalWeightKg: null, updatedAt: '' };
    setSettings(nextSettings);
    return nextSettings;
  }, [currentUserId]);

  const loadAll = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError('');
    try {
      await Promise.all([
        loadEntries(),
        loadSettings(),
      ]);
    } catch (nextError) {
      setError(isMissingWeightTableError(nextError)
        ? 'Weight Tracker needs the latest SQL migration before it can save data.'
        : (nextError?.message || 'Unable to load Weight Tracker right now.'));
    } finally {
      setLoading(false);
    }
  }, [currentUserId, loadEntries, loadSettings]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const summary = useMemo(() => summarizeWeightEntries({
    entries,
    goalWeightKg: settings.goalWeightKg,
    unit: settings.preferredUnit,
  }), [entries, settings.goalWeightKg, settings.preferredUnit]);

  const saveEntry = useCallback(async ({
    measuredOn = getWeightTodayKey(),
    weightValue,
    weightUnit = settings.preferredUnit,
    note = '',
  } = {}) => {
    const parsedWeight = parseWeightInput(weightValue);
    if (!parsedWeight) throw new Error('Enter a valid weight first.');
    const normalizedUnit = normalizeWeightUnit(weightUnit);
    const weightKg = convertWeightToKg(parsedWeight, normalizedUnit);
    if (!weightKg) throw new Error('Enter a valid weight first.');

    setSaving(true);
    setError('');
    try {
      const payload = {
        user_id: currentUserId,
        measured_on: measuredOn || getWeightTodayKey(),
        weight_value: parsedWeight,
        weight_unit: normalizedUnit,
        weight_kg: weightKg,
        note: String(note || '').trim(),
      };
      const { data, error: upsertError } = await supabase
        .from('weight_entries')
        .upsert(payload, { onConflict: 'user_id,measured_on' })
        .select(ENTRY_SELECT)
        .single();
      if (upsertError) throw upsertError;
      const nextEntry = mapEntry(data);
      setEntries((previous) => sortEntriesDesc([
        nextEntry,
        ...previous.filter((entry) => entry.id !== nextEntry.id && entry.measuredOn !== nextEntry.measuredOn),
      ]));
      return nextEntry;
    } catch (nextError) {
      const message = isMissingWeightTableError(nextError)
        ? 'Weight Tracker needs the latest SQL migration before it can save data.'
        : (nextError?.message || 'Unable to save weight.');
      setError(message);
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, settings.preferredUnit]);

  const saveSettings = useCallback(async ({ preferredUnit = settings.preferredUnit, goalWeightValue = '' } = {}) => {
    const normalizedUnit = normalizeWeightUnit(preferredUnit);
    const parsedGoal = parseWeightInput(goalWeightValue);
    const goalWeightKg = parsedGoal ? convertWeightToKg(parsedGoal, normalizedUnit) : null;

    setSaving(true);
    setError('');
    try {
      const payload = {
        user_id: currentUserId,
        preferred_unit: normalizedUnit,
        goal_weight_kg: goalWeightKg,
      };
      const { data, error: upsertError } = await supabase
        .from('weight_tracker_settings')
        .upsert(payload, { onConflict: 'user_id' })
        .select(SETTINGS_SELECT)
        .single();
      if (upsertError) throw upsertError;
      const nextSettings = mapSettings(data);
      setSettings(nextSettings);
      return nextSettings;
    } catch (nextError) {
      const message = isMissingWeightTableError(nextError)
        ? 'Weight Tracker needs the latest SQL migration before it can save data.'
        : (nextError?.message || 'Unable to save weight goal.');
      setError(message);
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, settings.preferredUnit]);

  const deleteEntry = useCallback(async (entryId) => {
    if (!entryId) return;
    setSaving(true);
    setError('');
    try {
      const { error: deleteError } = await supabase
        .from('weight_entries')
        .delete()
        .eq('id', entryId)
        .eq('user_id', currentUserId);
      if (deleteError) throw deleteError;
      setEntries((previous) => previous.filter((entry) => entry.id !== entryId));
    } catch (nextError) {
      const message = isMissingWeightTableError(nextError)
        ? 'Weight Tracker needs the latest SQL migration before it can save data.'
        : (nextError?.message || 'Unable to delete weight entry.');
      setError(message);
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  return {
    deleteEntry,
    entries,
    error,
    loading,
    refresh: loadAll,
    saveEntry,
    saveSettings,
    saving,
    settings,
    summary,
    today: getWeightTodayKey(),
  };
}
