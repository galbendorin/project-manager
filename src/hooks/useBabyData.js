import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  addBabyDays,
  buildSleepBlockRecords,
  combineBabyDateAndTime,
  getBabyTodayKey,
} from '../utils/babyTracker';
import { pickPreferredShoppingProject } from '../utils/shoppingListViewState';
import { normalizeProjectRecord } from '../utils/projectSharing';

const SHOPPING_PROJECT_NAME = 'Shopping List';
const BABY_PROFILE_SELECT = 'id, user_id, household_project_id, name, birth_date, archived_at, created_at, updated_at';
const FEED_SELECT = 'id, baby_id, user_id, household_project_id, occurred_at, local_date, duration_minutes, feed_type, notes, created_at, updated_at';
const NAPPY_SELECT = 'id, baby_id, user_id, household_project_id, occurred_at, local_date, nappy_type, notes, created_at, updated_at';
const SLEEP_SELECT = 'id, baby_id, user_id, household_project_id, sleep_date, block_index, status, created_at, updated_at';
const WEIGHT_SELECT = 'id, baby_id, user_id, household_project_id, measured_at, weight_value, weight_unit, notes, created_at, updated_at';

const isMissingRelationError = (error, relationName) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return msg.includes(relationName.toLowerCase()) && (msg.includes('relation') || msg.includes('relationship'));
};

const mapProject = (row, currentUserId) => normalizeProjectRecord(row, currentUserId);

const mapBabyProfile = (row = {}) => ({
  id: row.id,
  userId: row.user_id || '',
  householdProjectId: row.household_project_id || '',
  name: row.name || '',
  birthDate: row.birth_date || '',
  archivedAt: row.archived_at || '',
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

const mapFeed = (row = {}) => ({
  id: row.id,
  babyId: row.baby_id || '',
  userId: row.user_id || '',
  householdProjectId: row.household_project_id || '',
  occurredAt: row.occurred_at || '',
  localDate: row.local_date || '',
  durationMinutes: Number(row.duration_minutes) || 0,
  feedType: row.feed_type || '',
  notes: row.notes || '',
});

const mapNappy = (row = {}) => ({
  id: row.id,
  babyId: row.baby_id || '',
  userId: row.user_id || '',
  householdProjectId: row.household_project_id || '',
  occurredAt: row.occurred_at || '',
  localDate: row.local_date || '',
  nappyType: row.nappy_type || '',
  notes: row.notes || '',
});

const mapSleepBlock = (row = {}) => ({
  id: row.id,
  babyId: row.baby_id || '',
  userId: row.user_id || '',
  householdProjectId: row.household_project_id || '',
  sleepDate: row.sleep_date || '',
  blockIndex: Number(row.block_index),
  status: row.status || 'awake',
});

const mapWeight = (row = {}) => ({
  id: row.id,
  babyId: row.baby_id || '',
  userId: row.user_id || '',
  householdProjectId: row.household_project_id || '',
  measuredAt: row.measured_at || '',
  weightValue: row.weight_value === null || row.weight_value === undefined ? null : Number(row.weight_value),
  weightUnit: row.weight_unit || 'kg',
  notes: row.notes || '',
});

export function useBabyData({ currentUserId } = {}) {
  const [selectedDate, setSelectedDate] = useState(getBabyTodayKey);
  const [householdProject, setHouseholdProject] = useState(null);
  const [babyProfile, setBabyProfile] = useState(null);
  const [feeds, setFeeds] = useState([]);
  const [nappies, setNappies] = useState([]);
  const [sleepBlocks, setSleepBlocks] = useState([]);
  const [weights, setWeights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const supportsMembersRef = useRef(true);

  const latestWeight = useMemo(() => (
    [...weights].sort((left, right) => String(right.measuredAt).localeCompare(String(left.measuredAt)))[0] || null
  ), [weights]);

  const loadHouseholdProject = useCallback(async () => {
    if (!currentUserId) return null;

    let query = supabase
      .from('projects')
      .select(supportsMembersRef.current
        ? 'id, user_id, name, created_at, updated_at, project_members(id, user_id, member_email, role, invited_by_user_id, created_at)'
        : 'id, user_id, name, created_at, updated_at')
      .eq('name', SHOPPING_PROJECT_NAME)
      .order('created_at', { ascending: true });

    let { data, error: projectError } = await query;
    if (projectError && supportsMembersRef.current && isMissingRelationError(projectError, 'project_members')) {
      supportsMembersRef.current = false;
      ({ data, error: projectError } = await supabase
        .from('projects')
        .select('id, user_id, name, created_at, updated_at')
        .eq('name', SHOPPING_PROJECT_NAME)
        .order('created_at', { ascending: true }));
    }

    if (projectError) throw projectError;

    const projects = (data || []).map((project) => mapProject(project, currentUserId));

    const preferred = pickPreferredShoppingProject(projects, currentUserId) || projects[0] || null;
    setHouseholdProject(preferred);
    return preferred;
  }, [currentUserId]);

  const loadProfile = useCallback(async (project = householdProject) => {
    if (!currentUserId) return null;

    let query = supabase
      .from('baby_profiles')
      .select(BABY_PROFILE_SELECT)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
      .limit(1);

    if (project?.id) {
      query = query.eq('household_project_id', project.id);
    } else {
      query = query.eq('user_id', currentUserId).is('household_project_id', null);
    }

    const { data, error: profileError } = await query;
    if (profileError) throw profileError;
    const nextProfile = data?.[0] ? mapBabyProfile(data[0]) : null;
    setBabyProfile(nextProfile);
    return nextProfile;
  }, [currentUserId, householdProject]);

  const loadDay = useCallback(async (profile = babyProfile, dateKey = selectedDate) => {
    if (!profile?.id) {
      setFeeds([]);
      setNappies([]);
      setSleepBlocks([]);
      setWeights([]);
      return;
    }

    const [feedResult, nappyResult, sleepResult, weightResult] = await Promise.all([
      supabase.from('baby_feed_entries').select(FEED_SELECT).eq('baby_id', profile.id).eq('local_date', dateKey).order('occurred_at', { ascending: true }),
      supabase.from('baby_nappy_entries').select(NAPPY_SELECT).eq('baby_id', profile.id).eq('local_date', dateKey).order('occurred_at', { ascending: true }),
      supabase.from('baby_sleep_blocks').select(SLEEP_SELECT).eq('baby_id', profile.id).eq('sleep_date', dateKey).eq('status', 'asleep').order('block_index', { ascending: true }),
      supabase.from('baby_weight_entries').select(WEIGHT_SELECT).eq('baby_id', profile.id).lte('measured_at', dateKey).order('measured_at', { ascending: false }).limit(10),
    ]);

    if (feedResult.error) throw feedResult.error;
    if (nappyResult.error) throw nappyResult.error;
    if (sleepResult.error) throw sleepResult.error;
    if (weightResult.error) throw weightResult.error;

    setFeeds((feedResult.data || []).map(mapFeed));
    setNappies((nappyResult.data || []).map(mapNappy));
    setSleepBlocks((sleepResult.data || []).map(mapSleepBlock));
    setWeights((weightResult.data || []).map(mapWeight));
  }, [babyProfile, selectedDate]);

  const loadAll = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError('');
    try {
      const project = await loadHouseholdProject();
      const profile = await loadProfile(project);
      await loadDay(profile, selectedDate);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to load Baby tracker.');
    } finally {
      setLoading(false);
    }
  }, [currentUserId, loadDay, loadHouseholdProject, loadProfile, selectedDate]);

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

  const createBabyProfile = useCallback(async ({ name, birthDate = '' }) => {
    setSaving(true);
    setError('');
    try {
      const project = householdProject || await loadHouseholdProject();
      const { data, error: createError } = await supabase
        .from('baby_profiles')
        .insert({
          user_id: currentUserId,
          household_project_id: project?.id || null,
          name: String(name || '').trim() || 'Baby',
          birth_date: birthDate || null,
        })
        .select(BABY_PROFILE_SELECT)
        .single();
      if (createError) throw createError;
      const nextProfile = mapBabyProfile(data);
      setBabyProfile(nextProfile);
      return nextProfile;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to create baby profile.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, householdProject, loadHouseholdProject]);

  const requireProfile = useCallback(() => {
    if (!babyProfile?.id) throw new Error('Create a baby profile first.');
    return babyProfile;
  }, [babyProfile]);

  const addFeed = useCallback(async ({ dateKey = selectedDate, time = null, durationMinutes = 20, feedType = '', notes = '' } = {}) => {
    const profile = requireProfile();
    const occurredAt = combineBabyDateAndTime(dateKey, time);
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('baby_feed_entries').insert({
        baby_id: profile.id,
        user_id: currentUserId,
        household_project_id: profile.householdProjectId || null,
        occurred_at: occurredAt,
        local_date: dateKey,
        duration_minutes: Math.max(0, Number(durationMinutes) || 0),
        feed_type: feedType || null,
        notes: notes || '',
      });
      if (insertError) throw insertError;
      await loadDay(profile, dateKey);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to add feed.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, loadDay, requireProfile, selectedDate]);

  const updateFeed = useCallback(async (feedId, patch = {}) => {
    const profile = requireProfile();
    const dateKey = patch.dateKey || selectedDate;
    const payload = {};
    if (patch.time || patch.dateKey) {
      payload.occurred_at = combineBabyDateAndTime(dateKey, patch.time);
      payload.local_date = dateKey;
    }
    if (patch.durationMinutes !== undefined) payload.duration_minutes = Math.max(0, Number(patch.durationMinutes) || 0);
    if (patch.feedType !== undefined) payload.feed_type = patch.feedType || null;
    if (patch.notes !== undefined) payload.notes = patch.notes || '';
    const { error: updateError } = await supabase.from('baby_feed_entries').update(payload).eq('id', feedId);
    if (updateError) throw updateError;
    await loadDay(profile, selectedDate);
  }, [loadDay, requireProfile, selectedDate]);

  const deleteFeed = useCallback(async (feedId) => {
    const profile = requireProfile();
    const { error: deleteError } = await supabase.from('baby_feed_entries').delete().eq('id', feedId);
    if (deleteError) throw deleteError;
    await loadDay(profile, selectedDate);
  }, [loadDay, requireProfile, selectedDate]);

  const addNappy = useCallback(async ({ dateKey = selectedDate, time = null, nappyType = 'wet', notes = '' } = {}) => {
    const profile = requireProfile();
    const occurredAt = combineBabyDateAndTime(dateKey, time);
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('baby_nappy_entries').insert({
        baby_id: profile.id,
        user_id: currentUserId,
        household_project_id: profile.householdProjectId || null,
        occurred_at: occurredAt,
        local_date: dateKey,
        nappy_type: nappyType,
        notes: notes || '',
      });
      if (insertError) throw insertError;
      await loadDay(profile, dateKey);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to add nappy.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, loadDay, requireProfile, selectedDate]);

  const deleteNappy = useCallback(async (nappyId) => {
    const profile = requireProfile();
    const { error: deleteError } = await supabase.from('baby_nappy_entries').delete().eq('id', nappyId);
    if (deleteError) throw deleteError;
    await loadDay(profile, selectedDate);
  }, [loadDay, requireProfile, selectedDate]);

  const updateNappy = useCallback(async (nappyId, patch = {}) => {
    const profile = requireProfile();
    const dateKey = patch.dateKey || selectedDate;
    const payload = {};
    if (patch.time || patch.dateKey) {
      payload.occurred_at = combineBabyDateAndTime(dateKey, patch.time);
      payload.local_date = dateKey;
    }
    if (patch.nappyType !== undefined) payload.nappy_type = patch.nappyType || 'wet';
    if (patch.notes !== undefined) payload.notes = patch.notes || '';
    const { error: updateError } = await supabase.from('baby_nappy_entries').update(payload).eq('id', nappyId);
    if (updateError) throw updateError;
    await loadDay(profile, selectedDate);
  }, [loadDay, requireProfile, selectedDate]);

  const saveSleepBlocks = useCallback(async (asleepBlockSet) => {
    const profile = requireProfile();
    const previousBlocks = sleepBlocks;
    const nextRows = buildSleepBlockRecords({
      babyId: profile.id,
      userId: currentUserId,
      householdProjectId: profile.householdProjectId || null,
      dateKey: selectedDate,
      asleepBlocks: asleepBlockSet,
    });
    setSleepBlocks(nextRows.map((row, index) => mapSleepBlock({ id: `local-${index}`, ...row })));
    setSaving(true);
    setError('');
    try {
      const { error: deleteError } = await supabase
        .from('baby_sleep_blocks')
        .delete()
        .eq('baby_id', profile.id)
        .eq('sleep_date', selectedDate);
      if (deleteError) throw deleteError;
      if (nextRows.length > 0) {
        const { error: insertError } = await supabase.from('baby_sleep_blocks').insert(nextRows);
        if (insertError) throw insertError;
      }
      await loadDay(profile, selectedDate);
    } catch (nextError) {
      setSleepBlocks(previousBlocks);
      setError(nextError?.message || 'Unable to save sleep.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, loadDay, requireProfile, selectedDate, sleepBlocks]);

  const addWeight = useCallback(async ({ measuredAt = selectedDate, weightValue, weightUnit = 'kg', notes = '' } = {}) => {
    const profile = requireProfile();
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('baby_weight_entries').insert({
        baby_id: profile.id,
        user_id: currentUserId,
        household_project_id: profile.householdProjectId || null,
        measured_at: measuredAt,
        weight_value: Number(weightValue),
        weight_unit: weightUnit || 'kg',
        notes: notes || '',
      });
      if (insertError) throw insertError;
      await loadDay(profile, selectedDate);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to add weight.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, loadDay, requireProfile, selectedDate]);

  return {
    addFeed,
    addNappy,
    addWeight,
    babyProfile,
    deleteFeed,
    deleteNappy,
    error,
    feeds,
    householdProject,
    latestWeight,
    loading,
    nappies,
    refresh: loadAll,
    saveSleepBlocks,
    saving,
    selectedDate,
    setSelectedDate,
    sleepBlocks,
    today: getBabyTodayKey(),
    updateFeed,
    updateNappy,
    weights,
    goToPreviousDay: () => setSelectedDate((current) => addBabyDays(current, -1)),
    goToNextDay: () => setSelectedDate((current) => addBabyDays(current, 1)),
    goToToday: () => setSelectedDate(getBabyTodayKey()),
    createBabyProfile,
  };
}
