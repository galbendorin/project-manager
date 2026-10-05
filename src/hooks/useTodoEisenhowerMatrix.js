import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  groupMatrixTasks,
  matrixPlacement,
  matrixReference,
  validMatrixQuadrant,
} from "../utils/todoEisenhower";

export function useTodoEisenhowerMatrix({
  currentUserId,
  isExternalView,
  enabled,
  todos,
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
            .select("*", { count: "exact" })
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
          failure?.code === "PGRST205" || failure?.code === "42P01"
            ? "Matrix needs the database update before saved priorities are available."
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
  const move = useCallback(
    async (todo, quadrant) => {
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
        !validMatrixQuadrant(quadrant)
      )
        return false;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setError("Reconnect to move tasks. Your saved priority is kept.");
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
        matrixPlacement(current, preferences[key], latest.current.today)
          .overdue ||
        scope.writes.has(key)
      )
        return false;
      scope.writes.add(key);
      scope.revision += 1;
      if (scope.loading) scope.reloadNeeded = true;
      setPending((prev) => ({ ...prev, [key]: true }));
      const old = preferences[key];
      try {
        let request;
        if (old)
          request = supabase
            .from("task_eisenhower_preferences")
            .update({ manual_quadrant: quadrant })
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
              manual_quadrant: quadrant,
            });
        }
        const { data, error: failure } = await request.select("*");
        if (!scope.active || scope !== session.current) return false;
        if (
          failure ||
          data?.length !== 1 ||
          data[0].task_key !== key ||
          data[0].user_id !== currentUserId ||
          data[0].manual_quadrant !== quadrant ||
          data[0].version !== (old ? old.version + 1 : 1)
        ) {
          throw new Error(
            failure?.code === "23505" || (!failure && !data?.length)
              ? "This priority changed elsewhere. Reload priorities before moving again."
              : "Move was not saved. Your previous quadrant is kept. Try again.",
          );
        }
        setPreferences((prev) => ({ ...prev, [key]: data[0] }));
        setError("");
        return true;
      } catch (failure) {
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
  const groups = useMemo(
    () =>
      enabled
        ? groupMatrixTasks(
            todos,
            isExternalView || loadedContext !== context ? {} : preferences,
            today,
          )
        : [],
    [
      todos,
      preferences,
      today,
      isExternalView,
      loadedContext,
      context,
      enabled,
    ],
  );
  return {
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
    reload,
  };
}
