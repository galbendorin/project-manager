import { useCallback, useEffect, useRef, useState } from 'react';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const initial = owner => ({ owner, projects: [], loading: Boolean(owner), loadingMessage: 'Loading projects...', error: '' });

// Keep request failure separate from a successful empty result. Only this
// mounted account's newest request may replace the last successful list.
export function useProjectHomeLoading({ userId, queryProjects, normalizeProject }) {
  const [state, setState] = useState(() => initial(userId));
  const scope = useRef({ owner: userId, ticket: 0, active: true });
  if (scope.current.owner !== userId) {
    scope.current.owner = userId;
    scope.current.ticket++;
  }
  const fetchProjects = useCallback(async (isRetry = false) => {
    if (!userId || !scope.current.active || scope.current.owner !== userId) return;
    const ticket = ++scope.current.ticket;
    const current = () => scope.current.active && scope.current.owner === userId && scope.current.ticket === ticket;
    setState(previous => ({ ...(previous.owner === userId ? previous : initial(userId)),
      loading: true, loadingMessage: 'Loading projects...' }));
    const query = async () => {
      try { return await queryProjects(); }
      catch (error) { return { data: null, error }; }
    };
    let response = await query();
    if (!current()) return;
    if ((response?.error || !Array.isArray(response?.data)) && !isRetry) {
      setState(previous => ({ ...previous, loadingMessage: 'Retrying connection...' }));
      await wait(3000);
      if (!current()) return;
      response = await query();
      if (!current()) return;
    }
    if (response?.error || !Array.isArray(response?.data)) {
      setState(previous => ({ ...previous, loading: false,
        error: 'We could not load your projects. Check your connection and try again.' }));
      return;
    }
    try {
      const projects = response.data.map(normalizeProject);
      setState({ owner: userId, projects, loading: false, loadingMessage: '', error: '' });
    } catch {
      setState(previous => ({ ...previous, loading: false,
        error: 'We could not load your projects. Check your connection and try again.' }));
    }
  }, [normalizeProject, queryProjects, userId]);

  useEffect(() => {
    scope.current.active = true;
    void fetchProjects();
    return () => { scope.current.active = false; scope.current.ticket++; };
  }, [fetchProjects]);

  return { ...(state.owner === userId ? state : initial(userId)), fetchProjects };
}
