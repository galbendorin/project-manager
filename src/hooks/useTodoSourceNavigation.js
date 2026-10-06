import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isShoppingListProject } from '../utils/todoCommandCentre';

export function useTodoSourceNavigation(currentUserId, selectProject) {
  const [request, setRequest] = useState(null);
  const [error, setError] = useState('');
  const owner = useRef(currentUserId);
  owner.current = currentUserId;
  const epoch = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; epoch.current += 1; }; }, []);
  const openSource = useCallback(async (todo, { canLeave } = {}) => {
    if (!currentUserId || owner.current !== currentUserId || !alive.current || !todo?.projectId || !todo.isDerived) return false;
    const attempt = ++epoch.current;
    setError('');
    try {
      const { data, error: failure } = await supabase.from('projects').select('*').eq('id', todo.projectId).maybeSingle();
      if (!alive.current || owner.current !== currentUserId || attempt !== epoch.current) return false;
      if (failure || !data || data.id !== todo.projectId || isShoppingListProject(data)) throw new Error('Source project is unavailable. Check your access and try again.');
      if (canLeave && !canLeave(data.id)) {
        setError('The current workspace changed or still has unsaved edits. Your work is retained; retry after saving.');
        return false;
      }
      setRequest({ ownerId: currentUserId, projectId: data.id, id: attempt, todo });
      selectProject(data);
      return true;
    } catch {
      if (alive.current && owner.current === currentUserId && attempt === epoch.current) setError('Unable to open the source project. Your task has not changed; retry from Tasks.');
      return false;
    }
  }, [currentUserId, selectProject]);
  return { request: request?.ownerId === currentUserId ? request : null, error, openSource, clear: () => setRequest(null) };
}
