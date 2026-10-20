import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { shiftSleepDate, validateSleepEntry, validSleepDate } from '../utils/babySleepEntries';

const SELECT = 'id,baby_id,sleep_date,start_minute,end_minute,notes,version,archived_at,created_at,updated_at';
const mapEntry = row => ({ id: row.id, babyId: row.baby_id, sleepDate: row.sleep_date,
  startMinute: row.start_minute, endMinute: row.end_minute, notes: row.notes,
  version: row.version, archivedAt: row.archived_at, updatedAt: row.updated_at });
const matches = (row, payload) => row && ['id','baby_id','sleep_date','start_minute','end_minute','notes']
  .every(key => (row[key] ?? null) === (payload[key] ?? null))
  && (payload.archived_at == null ? row.archived_at == null
    : Date.parse(row.archived_at) === Date.parse(payload.archived_at));

export function useBabySleepEntries({ currentUserId, babyId, startDate, endDate, revision = 0 } = {}) {
  const scope = `${currentUserId || ''}:${babyId || ''}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const requestRef = useRef(0);
  const pendingRef = useRef(null);
  const [state, setState] = useState({ scope, entries: [], loading: false, error: '', available: null });
  const [saving, setSaving] = useState(false);
  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    const current = () => requestRef.current === request && scopeRef.current === scope;
    if (!currentUserId || !babyId || !validSleepDate(startDate) || !validSleepDate(endDate)) return;
    setState(previous => ({ ...(previous.scope === scope ? previous : { entries: [], available: null }), scope, loading: true, error: '' }));
    try {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('baby_sleep_entries').select(SELECT).eq('baby_id', babyId)
          .gte('sleep_date', shiftSleepDate(startDate, -1)).lte('sleep_date', endDate)
          .is('archived_at', null).order('sleep_date').order('start_minute').order('id').range(offset, offset + 999);
        if (!current()) return;
        if (error) throw error;
        rows.push(...(data || []));
        if ((data || []).length < 1000) break;
      }
      if (current()) setState({ scope, entries: rows.map(mapEntry), loading: false, error: '', available: true });
    } catch (error) {
      if (!current()) return;
      const missing = ['42P01','PGRST205'].includes(error?.code);
      setState(previous => ({ ...previous, scope, loading: false, available: missing ? false : previous.available,
        error: missing ? 'Exact sleep needs the database update. Your existing sleep grid is available.' : error?.message || 'Unable to load exact sleep and notes. Retry before editing.' }));
    }
  }, [currentUserId, babyId, startDate, endDate, scope]);
  useEffect(() => {
    pendingRef.current = null;
    setSaving(false);
    return () => { pendingRef.current = null; };
  }, [scope]);
  useEffect(() => {
    void refresh();
    return () => { requestRef.current += 1; };
  }, [refresh, revision]);

  const save = useCallback(async (entry, archive = false) => {
    const operationScope = scope;
    if (!currentUserId || !babyId || scopeRef.current !== scope) throw new Error('The tracker changed. Reopen the sleep entry.');
    if (pendingRef.current) throw new Error('Wait for the current sleep entry to finish saving.');
    if (entry.babyId && entry.babyId !== babyId) throw new Error('This entry belongs to a different tracker.');
    const validated = validateSleepEntry(entry);
    const payload = { id: entry.id, baby_id: babyId, sleep_date: validated.sleepDate,
      start_minute: validated.startMinute, end_minute: validated.endMinute, notes: validated.notes,
      archived_at: archive ? (entry.archiveRequestedAt || new Date().toISOString()) : null };
    if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(payload.id || '')) throw new Error('Reopen Add sleep before saving.');
    const operation = {};
    pendingRef.current = operation;
    const current = () => scopeRef.current === operationScope && pendingRef.current === operation;
    setSaving(true);
    try {
      let result;
      try {
        result = entry.version
          ? await supabase.from('baby_sleep_entries').update(payload).eq('id', entry.id).eq('baby_id', babyId).eq('version', entry.version).select(SELECT).maybeSingle()
          : await supabase.from('baby_sleep_entries').insert(payload).select(SELECT).single();
      } catch (error) { result = { error }; }
      if (!current()) throw new Error('The tracker changed. Reopen sleep history.');
      let confirmed = result.data;
      if (result.error || !matches(confirmed, payload)) {
        // A lost response must not create a duplicate or overwrite a newer edit.
        const read = await supabase.from('baby_sleep_entries').select(SELECT).eq('id', entry.id).eq('baby_id', babyId).maybeSingle();
        if (!current()) throw new Error('The tracker changed. Reopen sleep history.');
        if (read.error || !matches(read.data, payload)) {
          const conflict = read.data && !matches(read.data, payload);
          const failure = new Error(conflict ? 'This sleep entry changed elsewhere. Your draft is kept; review the latest saved entry before saving.'
            : `${result.error?.message || read.error?.message || 'Sleep entry was not confirmed.'} Your times and note are kept; try again.`);
          if (conflict) {
            failure.latest = mapEntry(read.data);
            setState(previous => ({ ...previous, scope, entries: [...previous.entries.filter(row => row.id !== entry.id), ...(failure.latest.archivedAt ? [] : [failure.latest])] }));
          }
          throw failure;
        }
        confirmed = read.data;
      }
      if (!Number.isInteger(confirmed.version) || confirmed.version < 1) throw new Error('Sleep entry confirmation is incomplete. Your draft is kept.');
      requestRef.current += 1;
      const saved = mapEntry(confirmed);
      setState(previous => ({ ...previous, scope, loading: false, error: '', available: true,
        entries: [...(previous.scope === scope ? previous.entries : []).filter(row => row.id !== saved.id), ...(saved.archivedAt ? [] : [saved])] }));
      return saved;
    } finally {
      if (current()) { pendingRef.current = null; setSaving(false); }
    }
  }, [currentUserId, babyId, scope]);
  return { ...(state.scope === scope ? state : { entries: [], loading: true, error: '', available: null }), saving, save, refresh };
}
