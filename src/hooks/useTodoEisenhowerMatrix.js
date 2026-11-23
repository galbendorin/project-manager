import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { matchesPreferenceSnapshot, preferenceSnapshot, validCalendarSlot, validPreferenceTiming } from '../utils/todoCalendar';
import {
  groupMatrixTasks,
  matrixReference,
  DEFAULT_MATRIX_QUADRANT,
  validCalendarDay,
  validMatrixQuadrant,
} from "../utils/todoEisenhower";
const EMPTY_PREFERENCES = Object.freeze({});
const EMPTY_GROUPS = Object.freeze([]);
const PREFERENCE_BATCH_SIZE = 100;
const PREFERENCE_CHUNK_CONCURRENCY = 3;

export function useTodoEisenhowerMatrix({
  currentUserId,
  isExternalView,
  enabled,
  todos,
  visibleTodos = todos,
  today,
  calendarEnabled = false,
  computeGroups = true,
}) {
  const [preferences, setPreferences] = useState({});
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState({});
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const refresh = () => setOnline(navigator.onLine);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);
  const keys = enabled
    ? todos
        .map((todo) => matrixReference(todo)?.task_key)
        .filter(Boolean)
        .sort()
    : [];
  const keySignature = JSON.stringify([...new Set(keys)]);
  const context = `${currentUserId}:${enabled}:${isExternalView}`;
  const [loadedContext, setLoadedContext] = useState(null);
  const [coveredKeys, setCoveredKeys] = useState(() => new Set());
  const [reloadNonce, setReloadNonce] = useState(0);
  const [calendarCheckNonce, setCalendarCheckNonce] = useState(0);
  const [calendarSchema, setCalendarSchema] = useState({ context: null, available: false, error: '' });
  const session = useRef(null);
  const latest = useRef({ todos, today });
  const latestKeysRef = useRef(keySignature);
  latestKeysRef.current = keySignature;
  const wasOfflineRef = useRef(!online);
  useEffect(() => {
    latest.current = { todos, today };
  }, [todos, today]);
  useEffect(() => {
    const scope = {
      owner: currentUserId,
      context,
      active: true,
      initialized: false,
      coveredKeys: new Set(),
      load: 0,
      loading: false,
      writes: new Set(),
      revision: 0,
      fullReloadNeeded: false,
      deltaSyncNeeded: false,
    };
    session.current = scope;
    setPreferences({});
    setReady(false);
    setLoading(false);
    setSyncing(false);
    setLoadedContext(null);
    setCoveredKeys(new Set());
    setPending({});
    setError("");
    return () => {
      scope.active = false;
    };
  }, [currentUserId, context]);
  useEffect(() => {
    const scope = session.current; let cancelled = false;
    if (!calendarEnabled || !enabled || !currentUserId || isExternalView || !online) return undefined;
    setCalendarSchema({ context, available: false, error: '' });
    Promise.resolve(supabase.from('task_eisenhower_preferences').select('planned_start_minute,planned_duration_minutes').limit(0)).then(result => {
      if (cancelled || !scope?.active || scope !== session.current) return;
      setCalendarSchema({ context, available: !result.error, error: result.error ? ['42703', 'PGRST204'].includes(result.error.code) ? 'Calendar needs the database update before time blocks can be saved.' : 'Unable to check Calendar storage. Retry loading.' : '' });
    }).catch(() => { if (!cancelled && scope?.active && scope === session.current) setCalendarSchema({ context, available: false, error: 'Unable to check Calendar storage. Retry loading.' }); });
    return () => { cancelled = true; };
  }, [calendarEnabled, enabled, currentUserId, isExternalView, online, context, calendarCheckNonce]);

  const fetchPreferences = useCallback(async ({ full = false } = {}) => {
    const scope = session.current;
    if (
      !enabled ||
      !currentUserId ||
      isExternalView ||
      !scope?.active ||
      scope.context !== context
    )
      return;
    if (!online) {
      setError("Reconnect to load your saved priorities.");
      setLoading(false);
      setSyncing(false);
      return;
    }

    const allKeys = JSON.parse(latestKeysRef.current);
    const shouldReplaceAll = Boolean(full || !scope.initialized);
    const requestedKeys = shouldReplaceAll
      ? allKeys
      : allKeys.filter((key) => !scope.coveredKeys.has(key));

    if (!shouldReplaceAll && requestedKeys.length === 0) {
      return;
    }

    if (scope.writes.size) {
      if (shouldReplaceAll) scope.fullReloadNeeded = true;
      else scope.deltaSyncNeeded = true;
      return;
    }

    if (shouldReplaceAll) scope.fullReloadNeeded = false;
    else scope.deltaSyncNeeded = false;

    scope.loading = true;
    const load = ++scope.load;
    const revision = scope.revision;
    if (shouldReplaceAll) setLoading(true);
    else setSyncing(true);

    const fetchBatch = async (batch) => {
      const batchRows = [];
      let offset = 0;
      let expectedCount = null;
      const seen = new Set();
      while (true) {
        const result = await supabase
          .from("task_eisenhower_preferences")
          .select("*, planned_day", { count: "exact" })
          .eq("user_id", currentUserId)
          .in("task_key", batch)
          .order("task_key", { ascending: true })
          .range(offset, offset + 499);
        if (
          !scope.active ||
          scope !== session.current ||
          load !== scope.load ||
          revision !== scope.revision
        )
          return null;
        if (result.error) throw result.error;
        if (!Number.isInteger(result.count))
          throw new Error(
            "Priority loading was not confirmed. Retry loading.",
          );
        if (expectedCount !== null && expectedCount !== result.count)
          throw new Error("Priorities changed while loading. Retry loading.");
        expectedCount = result.count;
        const rows = result.data || [];
        for (const row of rows) {
          if (
            seen.has(row.task_key) ||
            !batch.includes(row.task_key) ||
            row.user_id !== currentUserId
            || !validPreferenceTiming(row)
          )
            throw new Error(
              "Priority loading was incomplete. Retry loading.",
            );
          seen.add(row.task_key);
        }
        batchRows.push(...rows);
        offset += rows.length;
        if (offset >= result.count) break;
        if (!rows.length)
          throw new Error("Priority loading was incomplete. Retry loading.");
      }
      return batchRows;
    };

    try {
      const data = [];
      const batches = [];
      for (let start = 0; start < requestedKeys.length; start += PREFERENCE_BATCH_SIZE) {
        batches.push(requestedKeys.slice(start, start + PREFERENCE_BATCH_SIZE));
      }
      for (let i = 0; i < batches.length; i += PREFERENCE_CHUNK_CONCURRENCY) {
        const wave = await Promise.all(
          batches.slice(i, i + PREFERENCE_CHUNK_CONCURRENCY).map(fetchBatch),
        );
        if (
          !scope.active ||
          scope !== session.current ||
          load !== scope.load ||
          revision !== scope.revision
        )
          return;
        for (const rows of wave) {
          if (rows === null) return;
          data.push(...rows);
        }
      }
      if (
        !scope.active ||
        scope !== session.current ||
        load !== scope.load ||
        revision !== scope.revision
      )
        return;

      if (shouldReplaceAll) {
        scope.coveredKeys = new Set(allKeys);
        scope.initialized = true;
        setPreferences(Object.fromEntries(data.map((row) => [row.task_key, row])));
        setCoveredKeys(new Set(scope.coveredKeys));
      } else {
        for (const key of requestedKeys) scope.coveredKeys.add(key);
        setPreferences((previous) => {
          const next = { ...previous };
          for (const key of requestedKeys) delete next[key];
          return {
            ...next,
            ...Object.fromEntries(data.map((row) => [row.task_key, row])),
          };
        });
        setCoveredKeys(new Set(scope.coveredKeys));
      }
      setLoadedContext(context);
      setReady(true);
      setError("");
    } catch (failure) {
      if (
        scope.active &&
        scope === session.current &&
        load === scope.load &&
        revision === scope.revision
      ) {
        setError(
          ["PGRST205", "42P01", "42703", "PGRST204"].includes(failure?.code)
            ? "Today planning needs the database update before saved priorities are available."
            : "Unable to load your saved priorities. Retry loading.",
        );
      }
    } finally {
      if (scope.active && scope === session.current && load === scope.load) {
        scope.loading = false;
        setLoading(false);
        setSyncing(false);
      }
    }
  }, [currentUserId, context, enabled, isExternalView, online]);

  const reload = useCallback(() => {
    const scope = session.current;
    if (scope && scope.context === context && scope.active) {
      scope.fullReloadNeeded = false;
      scope.deltaSyncNeeded = false;
    }
    return fetchPreferences({ full: true });
  }, [context, fetchPreferences]);

  useEffect(() => {
    const wasOffline = wasOfflineRef.current;
    wasOfflineRef.current = !online;
    if (!online) {
      if (enabled && currentUserId && !isExternalView) {
        setError("Reconnect to load your saved priorities.");
        setLoading(false);
        setSyncing(false);
      }
      return;
    }
    void fetchPreferences({ full: wasOffline });
  }, [context, currentUserId, enabled, isExternalView, keySignature, online, fetchPreferences]);

  useEffect(() => {
    if (reloadNonce === 0) return;
    const scope = session.current;
    if (!scope || !scope.active || scope.context !== context) return;
    const full = scope.fullReloadNeeded || !scope.initialized;
    scope.fullReloadNeeded = false;
    scope.deltaSyncNeeded = false;
    void fetchPreferences({ full });
  }, [reloadNonce, context, fetchPreferences]);

  const patchPreference = useCallback(
    async (todo, requestedPatch, expected) => {
      const patch = requestedPatch;
      const quadrant = patch.manual_quadrant;
      const scope = session.current;
      const reference = matrixReference(todo);
      if (
        !enabled ||
        !ready ||
        loadedContext !== context ||
        isExternalView ||
        !scope?.active ||
        scope.context !== context ||
        !reference ||
        (quadrant !== undefined && !validMatrixQuadrant(quadrant)) ||
        (patch.planned_day !== undefined && patch.planned_day !== null && !validCalendarDay(patch.planned_day)) ||
        (patch.manual_quadrant_day !== undefined && !validCalendarDay(patch.manual_quadrant_day))
      )
        return false;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setError("Reconnect to save your plan. Your confirmed choices are kept.");
        return false;
      }
      const key = reference.task_key;
      if (!coveredKeys.has(key)) return false;
      const current = latest.current.todos.find(
        (t) => matrixReference(t)?.task_key === key,
      );
      if (
        !current ||
        current.status === "Done" ||
        scope.writes.has(key)
      )
        return false;
      const old = preferences[key];
      const intended = { ...old, ...patch, ...(patch.planned_day === null ? { planned_start_minute: null, planned_duration_minutes: null } : {}) };
      if (!validPreferenceTiming(intended)) return false;
      // A fresh read can confirm a previously lost write acknowledgement.
      if (expected && old && patch.planned_day !== undefined && (old.planned_day || null) === patch.planned_day &&
        (old.planned_start_minute ?? null) === (patch.planned_day === null ? null : patch.planned_start_minute !== undefined ? patch.planned_start_minute : expected.start ?? null) &&
        (old.planned_duration_minutes ?? null) === (patch.planned_day === null ? null : patch.planned_duration_minutes !== undefined ? patch.planned_duration_minutes : expected.duration ?? null) &&
        (quadrant === undefined || (old.manual_quadrant === quadrant && old.manual_quadrant_day === patch.manual_quadrant_day))) return true;
      scope.writes.add(key);
      scope.revision += 1;
      if (scope.loading) scope.deltaSyncNeeded = true;
      setPending((prev) => ({ ...prev, [key]: true }));
      if (expected && !matchesPreferenceSnapshot(old, expected)) {
        scope.writes.delete(key);
        setPending(prev => { const next = { ...prev }; delete next[key]; return next; });
        setError('Your personal day or time changed elsewhere. Check it before trying again.');
        return false;
      }
      try {
        let request;
        if (old)
          request = supabase
            .from("task_eisenhower_preferences")
            .update(patch)
            .eq("id", old.id)
            .eq("user_id", currentUserId)
            .eq("version", old.version);
        else {
          const { task_key: ignoredKey, ...fields } = reference;
          void ignoredKey;
          request = supabase
            .from("task_eisenhower_preferences")
            .insert({
              ...fields,
              user_id: currentUserId,
              manual_quadrant: quadrant ?? DEFAULT_MATRIX_QUADRANT,
              ...patch,
            });
        }
        const { data, error: failure } = await request.select("*");
        if (!scope.active || scope !== session.current) return false;
        if (
          failure ||
          data?.length !== 1 ||
          data[0].task_key !== key ||
          data[0].user_id !== currentUserId ||
          (quadrant !== undefined && data[0].manual_quadrant !== quadrant) ||
          (patch.manual_quadrant_day !== undefined && data[0].manual_quadrant_day !== patch.manual_quadrant_day) ||
          (old && patch.manual_quadrant_day === undefined && (data[0].manual_quadrant_day ?? null) !== (old.manual_quadrant_day ?? null)) ||
          (patch.planned_day !== undefined && (data[0].planned_day ?? null) !== patch.planned_day) ||
          !validPreferenceTiming(data[0]) ||
          (data[0].planned_start_minute ?? null) !== (intended.planned_start_minute ?? null) ||
          (data[0].planned_duration_minutes ?? null) !== (intended.planned_duration_minutes ?? null) ||
          (old && quadrant === undefined && data[0].manual_quadrant !== old.manual_quadrant) ||
          (old && patch.planned_day === undefined && (data[0].planned_day ?? null) !== (old.planned_day ?? null)) ||
          data[0].version !== (old ? old.version + 1 : 1)
        ) {
          throw new Error(
            failure?.code === "23505" || (!failure && !data?.length)
              ? "This task's plan changed elsewhere. Reload priorities and try again."
              : "Your plan was not saved. Previous choices are kept. Try again.",
          );
        }
        setPreferences((prev) => ({ ...prev, [key]: data[0] }));
        setError("");
        return true;
      } catch (failure) {
        if (expected) scope.fullReloadNeeded = true;
        if (scope.active && scope === session.current)
          setError(failure?.message || "Move was not saved. Try again.");
        return false;
      } finally {
        scope.writes.delete(key);
        scope.revision += 1;
        if (scope.active && scope === session.current) {
          setLoading(false);
          setSyncing(false);
          setPending((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          if (!scope.writes.size && (scope.fullReloadNeeded || scope.deltaSyncNeeded))
            setReloadNonce((value) => value + 1);
        }
      }
    },
    [
      currentUserId,
      context,
      loadedContext,
      enabled,
      isExternalView,
      preferences,
      ready,
      coveredKeys,
    ],
  );
  const isKeyCovered = useCallback(
    (key) => {
      if (isExternalView) return true;
      if (!key) return true;
      return ready && loadedContext === context && coveredKeys.has(key);
    },
    [context, coveredKeys, isExternalView, loadedContext, ready],
  );
  const move = useCallback((todo, quadrant) => patchPreference(todo, { manual_quadrant: quadrant, manual_quadrant_day: latest.current.today }), [patchPreference]);
  const planDay = useCallback((todo, day, expected) => patchPreference(todo, { planned_day: day || null }, expected), [patchPreference]);
  const planSlot = useCallback((todo, { day, start, duration }, expected) => {
    if (calendarSchema.context !== context || !calendarSchema.available || !(start === null && duration === null && validCalendarDay(day) || validCalendarSlot(day, start, duration))) return Promise.resolve(false);
    return patchPreference(todo, { planned_day: day, planned_start_minute: start, planned_duration_minutes: duration }, expected ?? preferenceSnapshot(preferences[matrixReference(todo)?.task_key]));
  }, [calendarSchema, context, patchPreference, preferences]);
  const planTask = useCallback((todo, { day, quadrant }, expected) => patchPreference(todo, {
    planned_day: day || null,
    ...(quadrant ? { manual_quadrant: quadrant, manual_quadrant_day: latest.current.today } : {}),
  }, expected), [patchPreference]);
  const groups = useMemo(
    () => {
      if (!enabled || !computeGroups) return EMPTY_GROUPS;
      const scopedTodos = isExternalView
        ? visibleTodos
        : loadedContext !== context
          ? []
          : visibleTodos.filter((todo) => {
              const ref = matrixReference(todo);
              return !ref || coveredKeys.has(ref.task_key);
            });
      return groupMatrixTasks(
        scopedTodos,
        isExternalView || loadedContext !== context ? EMPTY_PREFERENCES : preferences,
        today,
      );
    },
    [
      computeGroups,
      visibleTodos,
      preferences,
      today,
      isExternalView,
      loadedContext,
      context,
      coveredKeys,
      enabled,
    ],
  );
  const reloadCalendar = useCallback(() => {
    void reload();
    setCalendarCheckNonce((value) => value + 1);
  }, [reload]);
  return {
    preferences: loadedContext === context && !isExternalView ? preferences : EMPTY_PREFERENCES,
    groups,
    ready: isExternalView || (ready && loadedContext === context),
    isKeyCovered,
    offline: !online,
    loading,
    syncing,
    error:
      loadedContext === context || session.current?.context === context
        ? error
        : "",
    pending: loadedContext === context ? pending : {},
    move,
    planDay,
    planTask,
    planSlot,
    calendarReady: calendarSchema.context === context && calendarSchema.available,
    calendarError: calendarSchema.context === context ? calendarSchema.error : '',
    reloadCalendar,
    reload,
  };
}
