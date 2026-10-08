import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  groupMatrixTasks,
  matrixPlacement,
  matrixReference,
  DEFAULT_MATRIX_QUADRANT,
  validCalendarDay,
  validMatrixQuadrant,
} from "../utils/todoEisenhower";
const EMPTY_PREFERENCES = Object.freeze({});

export function useTodoEisenhowerMatrix({
  currentUserId,
  isExternalView,
  enabled,
  todos,
  visibleTodos = todos,
  today,
}) {
  const [preferences, setPreferences] = useState({});
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
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
  const [coveredKeys, setCoveredKeys] = useState(new Set());
  const [reloadNonce, setReloadNonce] = useState(0);
  const session = useRef(null);
  const latest = useRef({ todos, today });
  useEffect(() => {
    latest.current = { todos, today };
  }, [todos, today]);
  useEffect(() => {
    const scope = {
      owner: currentUserId,
      context,
      active: true,
      load: 0,
      writes: new Set(),
      revision: 0,
    };
    session.current = scope;
    setPreferences({});
    setReady(false);
    setLoadedContext(null);
    setCoveredKeys(new Set());
    setPending({});
    setError("");
    return () => {
      scope.active = false;
    };
  }, [currentUserId, context]);
  const reload = useCallback(async () => {
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
      return;
    }
    if (scope.writes.size) {
      scope.reloadNeeded = true;
      return;
    }
    scope.reloadNeeded = false;
    scope.loading = true;
    const load = ++scope.load;
    const revision = scope.revision;
    setLoading(true);
    try {
      const data = [];
      const requestedKeys = JSON.parse(keySignature);
      for (let start = 0; start < requestedKeys.length; start += 100) {
        const batch = requestedKeys.slice(start, start + 100);
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
            return;
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
            )
              throw new Error(
                "Priority loading was incomplete. Retry loading.",
              );
            seen.add(row.task_key);
          }
          data.push(...rows);
          offset += rows.length;
          if (offset >= result.count) break;
          if (!rows.length)
            throw new Error("Priority loading was incomplete. Retry loading.");
        }
      }
      if (
        !scope.active ||
        scope !== session.current ||
        load !== scope.load ||
        revision !== scope.revision
      )
        return;
      setPreferences((previous) => {
        const next = { ...previous };
        for (const key of requestedKeys) delete next[key];
        return {
          ...next,
          ...Object.fromEntries(data.map((row) => [row.task_key, row])),
        };
      });
      setCoveredKeys((previous) => new Set([...previous, ...requestedKeys]));
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
      }
    }
  }, [currentUserId, context, enabled, isExternalView, keySignature, online]);
  useEffect(() => {
    void reload();
  }, [reload, reloadNonce]);
  const patchPreference = useCallback(
    async (todo, patch, expected) => {
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
        (quadrant !== undefined && matrixPlacement(current, preferences[key], latest.current.today)
          .overdue) ||
        scope.writes.has(key)
      )
        return false;
      const old = preferences[key];
      // A fresh read can confirm a previously lost write acknowledgement.
      if (expected && old && patch.planned_day !== undefined && (old.planned_day || null) === patch.planned_day &&
        (quadrant === undefined || (old.manual_quadrant === quadrant && old.manual_quadrant_day === patch.manual_quadrant_day))) return true;
      scope.writes.add(key);
      scope.revision += 1;
      if (scope.loading) scope.reloadNeeded = true;
      setPending((prev) => ({ ...prev, [key]: true }));
      if (expected && ((old?.id || null) !== expected.id || (old?.version || null) !== expected.version || (old?.planned_day || null) !== expected.day)) {
        scope.writes.delete(key);
        setPending(prev => { const next = { ...prev }; delete next[key]; return next; });
        setError('Your personal day changed elsewhere. Check it before trying again.');
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
        if (expected) scope.reloadNeeded = true;
        if (scope.active && scope === session.current)
          setError(failure?.message || "Move was not saved. Try again.");
        return false;
      } finally {
        scope.writes.delete(key);
        scope.revision += 1;
        if (scope.active && scope === session.current) {
          setLoading(false);
          setPending((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          if (!scope.writes.size && scope.reloadNeeded)
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
  const move = useCallback((todo, quadrant) => patchPreference(todo, { manual_quadrant: quadrant, manual_quadrant_day: latest.current.today }), [patchPreference]);
  const planDay = useCallback((todo, day, expected) => patchPreference(todo, { planned_day: day || null }, expected), [patchPreference]);
  const planTask = useCallback((todo, { day, quadrant }, expected) => patchPreference(todo, {
    planned_day: day || null,
    ...(quadrant ? { manual_quadrant: quadrant, manual_quadrant_day: latest.current.today } : {}),
  }, expected), [patchPreference]);
  const groups = useMemo(
    () =>
      enabled
        ? groupMatrixTasks(
            visibleTodos,
            isExternalView || loadedContext !== context ? EMPTY_PREFERENCES : preferences,
            today,
          )
        : [],
    [
      visibleTodos,
      preferences,
      today,
      isExternalView,
      loadedContext,
      context,
      enabled,
    ],
  );
  return {
    preferences: loadedContext === context && !isExternalView ? preferences : EMPTY_PREFERENCES,
    groups,
    ready:
      isExternalView ||
      (ready &&
        loadedContext === context &&
        keys.every((key) => coveredKeys.has(key))),
    offline: !online,
    loading,
    error:
      loadedContext === context || session.current?.context === context
        ? error
        : "",
    pending: loadedContext === context ? pending : {},
    move,
    planDay,
    planTask,
    reload,
  };
}
