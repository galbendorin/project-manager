import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildTodoCardKey } from './useTodoKanbanBoard';
import {
  buildTaskChecklistScopeKey,
  calculateTaskChecklistPosition,
  parseChecklistItemDrafts,
  sortTaskChecklistItems,
  sortTaskChecklists,
  summarizeTaskChecklists,
} from '../utils/taskCardChecklists';

const CHECKLIST_SELECT = 'id, user_id, project_id, card_key, title, position, created_at, updated_at';
const CHECKLIST_ITEM_SELECT = 'id, checklist_id, user_id, project_id, title, checked, position, created_at, updated_at';
const CHECKLIST_SETUP_MESSAGE = 'Checklists are not available yet. Run the checklist database setup, then reload.';

const isMissingRelationError = (error, relationName) => {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  const relation = relationName.toLowerCase();
  return message.includes(relation) && (
    message.includes('relation')
    || message.includes('schema cache')
    || message.includes('could not find')
    || message.includes('does not exist')
    || error?.code === 'PGRST205'
  );
};

const normalizeChecklistRow = (row = {}, items = []) => ({
  id: row.id,
  userId: row.user_id || null,
  projectId: row.project_id || null,
  cardKey: row.card_key || '',
  title: row.title || 'Checklist',
  position: Number.isFinite(Number(row.position)) ? Number(row.position) : 0,
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
  items: sortTaskChecklistItems(items),
});

const normalizeChecklistItemRow = (row = {}) => ({
  id: row.id,
  checklistId: row.checklist_id || null,
  userId: row.user_id || null,
  projectId: row.project_id || null,
  title: row.title || '',
  checked: row.checked === true,
  position: Number.isFinite(Number(row.position)) ? Number(row.position) : 0,
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

const buildChecklistScopes = (todos = []) => {
  const scopeMap = new Map();

  (todos || []).forEach((todo) => {
    if (!todo) return;
    const cardKey = buildTodoCardKey(todo);
    if (!cardKey || cardKey.endsWith(':')) return;

    const projectId = todo.projectId || null;
    const scopeKey = buildTaskChecklistScopeKey(projectId, cardKey);
    if (scopeMap.has(scopeKey)) return;

    scopeMap.set(scopeKey, {
      cardKey,
      projectId,
      scopeKey,
    });
  });

  return [...scopeMap.values()].sort((left, right) => left.scopeKey.localeCompare(right.scopeKey));
};

const groupChecklistsByScope = (checklistRows = [], itemRows = []) => {
  const itemsByChecklistId = new Map();
  (itemRows || []).forEach((row) => {
    const item = normalizeChecklistItemRow(row);
    if (!item.checklistId) return;
    const existing = itemsByChecklistId.get(item.checklistId) || [];
    existing.push(item);
    itemsByChecklistId.set(item.checklistId, existing);
  });

  return (checklistRows || []).reduce((acc, row) => {
    const checklist = normalizeChecklistRow(row, itemsByChecklistId.get(row.id) || []);
    const scopeKey = buildTaskChecklistScopeKey(checklist.projectId, checklist.cardKey);
    const existing = acc[scopeKey] || [];
    acc[scopeKey] = sortTaskChecklists([...existing, checklist]);
    return acc;
  }, {});
};

const replaceChecklistInState = (checklistsByScopeKey, checklistId, updater) => {
  let changed = false;
  const next = Object.fromEntries(
    Object.entries(checklistsByScopeKey).map(([scopeKey, checklists]) => {
      const nextChecklists = checklists.map((checklist) => {
        if (checklist.id !== checklistId) return checklist;
        changed = true;
        return updater(checklist);
      });
      return [scopeKey, sortTaskChecklists(nextChecklists)];
    })
  );

  return changed ? next : checklistsByScopeKey;
};

const replaceChecklistItemInState = (checklistsByScopeKey, itemId, updater) => {
  let changed = false;
  const next = Object.fromEntries(
    Object.entries(checklistsByScopeKey).map(([scopeKey, checklists]) => [
      scopeKey,
      checklists.map((checklist) => {
        let checklistChanged = false;
        const nextItems = checklist.items.map((item) => {
          if (item.id !== itemId) return item;
          checklistChanged = true;
          changed = true;
          return updater(item, checklist);
        });
        return checklistChanged ? { ...checklist, items: sortTaskChecklistItems(nextItems) } : checklist;
      }),
    ])
  );

  return changed ? next : checklistsByScopeKey;
};

export function useTaskCardChecklists({
  currentUserId,
  isExternalView,
  todos,
}) {
  const [checklistsByScopeKey, setChecklistsByScopeKey] = useState({});
  const [checklistsLoading, setChecklistsLoading] = useState(false);
  const [checklistMessage, setChecklistMessage] = useState('');
  const [checklistsAvailable, setChecklistsAvailable] = useState(true);

  const checklistScopes = useMemo(() => buildChecklistScopes(todos), [todos]);
  const checklistScopeSignature = useMemo(
    () => checklistScopes.map((scope) => scope.scopeKey).join('|'),
    [checklistScopes]
  );

  const loadChecklists = useCallback(async () => {
    if (!currentUserId || checklistScopes.length === 0) {
      setChecklistsLoading(false);
      setChecklistsByScopeKey({});
      return;
    }

    if (!checklistsAvailable) {
      setChecklistsLoading(false);
      setChecklistsByScopeKey({});
      return;
    }

    setChecklistsLoading(true);

    const projectIds = [...new Set(checklistScopes.map((scope) => scope.projectId).filter(Boolean))];
    const cardKeys = [...new Set(checklistScopes.map((scope) => scope.cardKey).filter(Boolean))];
    const personalCardKeys = checklistScopes
      .filter((scope) => !scope.projectId)
      .map((scope) => scope.cardKey)
      .filter(Boolean);

    const checklistQueries = [];
    if (projectIds.length > 0) {
      checklistQueries.push(
        supabase
          .from('task_card_checklists')
          .select(CHECKLIST_SELECT)
          .in('card_key', cardKeys)
          .in('project_id', projectIds)
          .order('position', { ascending: true })
      );
    }
    if (personalCardKeys.length > 0) {
      checklistQueries.push(
        supabase
          .from('task_card_checklists')
          .select(CHECKLIST_SELECT)
          .in('card_key', personalCardKeys)
          .is('project_id', null)
          .eq('user_id', currentUserId)
          .order('position', { ascending: true })
      );
    }

    const checklistResults = await Promise.all(checklistQueries);
    const checklistError = checklistResults.find((result) => result.error)?.error || null;
    const checklistRows = checklistResults.flatMap((result) => result.data || []);

    if (checklistError) {
      setChecklistsLoading(false);
      if (isMissingRelationError(checklistError, 'task_card_checklists')) {
        setChecklistsAvailable(false);
        setChecklistMessage(CHECKLIST_SETUP_MESSAGE);
        setChecklistsByScopeKey({});
        return;
      }

      console.error('Failed to load task checklists:', checklistError);
      setChecklistsAvailable(false);
      setChecklistMessage(CHECKLIST_SETUP_MESSAGE);
      return;
    }

    const checklistIds = (checklistRows || []).map((row) => row.id).filter(Boolean);
    let itemRows = [];

    if (checklistIds.length > 0) {
      const { data: rows, error: itemError } = await supabase
        .from('task_card_checklist_items')
        .select(CHECKLIST_ITEM_SELECT)
        .in('checklist_id', checklistIds)
        .order('position', { ascending: true });

      if (itemError) {
        setChecklistsLoading(false);
        if (isMissingRelationError(itemError, 'task_card_checklist_items')) {
          setChecklistsAvailable(false);
          setChecklistMessage(CHECKLIST_SETUP_MESSAGE);
          setChecklistsByScopeKey({});
          return;
        }

        console.error('Failed to load task checklist items:', itemError);
        setChecklistsAvailable(false);
        setChecklistMessage(CHECKLIST_SETUP_MESSAGE);
        return;
      }
      itemRows = rows || [];
    }

    const scopeKeys = new Set(checklistScopes.map((scope) => scope.scopeKey));
    const grouped = groupChecklistsByScope(checklistRows || [], itemRows);
    setChecklistsByScopeKey(Object.fromEntries(
      Object.entries(grouped).filter(([scopeKey]) => scopeKeys.has(scopeKey))
    ));
    setChecklistMessage('');
    setChecklistsLoading(false);
  }, [checklistScopes, checklistsAvailable, currentUserId]);

  useEffect(() => {
    void loadChecklists();
  }, [checklistScopeSignature, loadChecklists]);

  const getChecklistsForTodo = useCallback((todo) => {
    if (!todo) return [];
    const cardKey = buildTodoCardKey(todo);
    const scopeKey = buildTaskChecklistScopeKey(todo.projectId || null, cardKey);
    return checklistsByScopeKey[scopeKey] || [];
  }, [checklistsByScopeKey]);

  const getChecklistSummaryForTodo = useCallback((todo) => (
    summarizeTaskChecklists(getChecklistsForTodo(todo))
  ), [getChecklistsForTodo]);

  const findChecklist = useCallback((checklistId) => {
    for (const [scopeKey, checklists] of Object.entries(checklistsByScopeKey)) {
      const checklist = checklists.find((item) => item.id === checklistId);
      if (checklist) return { checklist, scopeKey };
    }
    return { checklist: null, scopeKey: '' };
  }, [checklistsByScopeKey]);

  const setUnavailableFromError = useCallback((error) => {
    if (
      isMissingRelationError(error, 'task_card_checklists')
      || isMissingRelationError(error, 'task_card_checklist_items')
    ) {
      setChecklistsAvailable(false);
      setChecklistMessage(CHECKLIST_SETUP_MESSAGE);
      return true;
    }
    return false;
  }, []);

  const addChecklist = useCallback(async (todo, title = 'Checklist') => {
    if (!todo || !currentUserId || isExternalView || !checklistsAvailable) return;

    const cardKey = buildTodoCardKey(todo);
    const scopeKey = buildTaskChecklistScopeKey(todo.projectId || null, cardKey);
    const existing = checklistsByScopeKey[scopeKey] || [];
    const position = calculateTaskChecklistPosition(existing, existing.length);

    const { data, error } = await supabase
      .from('task_card_checklists')
      .insert({
        user_id: currentUserId,
        project_id: todo.projectId || null,
        card_key: cardKey,
        title: String(title || '').trim() || 'Checklist',
        position,
      })
      .select(CHECKLIST_SELECT)
      .single();

    if (error || !data) {
      if (!setUnavailableFromError(error)) {
        console.error('Failed to add checklist:', error);
        setChecklistMessage('Unable to add a checklist right now.');
      }
      return;
    }

    const checklist = normalizeChecklistRow(data, []);
    setChecklistsByScopeKey((prev) => ({
      ...prev,
      [scopeKey]: sortTaskChecklists([...(prev[scopeKey] || []), checklist]),
    }));
    setChecklistMessage('');
  }, [checklistsAvailable, checklistsByScopeKey, currentUserId, isExternalView, setUnavailableFromError]);

  const renameChecklist = useCallback(async (checklistId, title) => {
    const trimmedTitle = String(title || '').trim();
    if (!checklistId || !trimmedTitle || isExternalView || !checklistsAvailable) return;

    setChecklistsByScopeKey((prev) => replaceChecklistInState(prev, checklistId, (checklist) => ({
      ...checklist,
      title: trimmedTitle,
    })));

    const { error } = await supabase
      .from('task_card_checklists')
      .update({ title: trimmedTitle, updated_at: new Date().toISOString() })
      .eq('id', checklistId);

    if (error) {
      if (!setUnavailableFromError(error)) {
        console.error('Failed to rename checklist:', error);
        setChecklistMessage('Unable to rename this checklist right now.');
        void loadChecklists();
      }
    }
  }, [checklistsAvailable, isExternalView, loadChecklists, setUnavailableFromError]);

  const deleteChecklist = useCallback(async (checklistId) => {
    if (!checklistId || isExternalView || !checklistsAvailable) return;

    setChecklistsByScopeKey((prev) => Object.fromEntries(
      Object.entries(prev).map(([scopeKey, checklists]) => [
        scopeKey,
        checklists.filter((checklist) => checklist.id !== checklistId),
      ])
    ));

    const { error } = await supabase
      .from('task_card_checklists')
      .delete()
      .eq('id', checklistId);

    if (error) {
      if (!setUnavailableFromError(error)) {
        console.error('Failed to delete checklist:', error);
        setChecklistMessage('Unable to delete this checklist right now.');
        void loadChecklists();
      }
    }
  }, [checklistsAvailable, isExternalView, loadChecklists, setUnavailableFromError]);

  const addChecklistItems = useCallback(async (checklistId, rawValue) => {
    if (!checklistId || isExternalView || !currentUserId || !checklistsAvailable) return;
    const itemDrafts = parseChecklistItemDrafts(rawValue);
    if (itemDrafts.length === 0) return;

    const { checklist, scopeKey } = findChecklist(checklistId);
    if (!checklist) return;

    let positionBaseItems = checklist.items || [];
    const rows = itemDrafts.map((itemDraft) => {
      const position = calculateTaskChecklistPosition(positionBaseItems, positionBaseItems.length);
      positionBaseItems = [...positionBaseItems, { position }];
      return {
        checklist_id: checklistId,
        user_id: currentUserId,
        project_id: checklist.projectId || null,
        title: itemDraft.title,
        checked: itemDraft.checked === true,
        position,
      };
    });

    const { data, error } = await supabase
      .from('task_card_checklist_items')
      .insert(rows)
      .select(CHECKLIST_ITEM_SELECT);

    if (error) {
      if (!setUnavailableFromError(error)) {
        console.error('Failed to add checklist items:', error);
        setChecklistMessage('Unable to add checklist items right now.');
      }
      return;
    }

    const nextItems = (data || []).map(normalizeChecklistItemRow);
    setChecklistsByScopeKey((prev) => ({
      ...prev,
      [scopeKey]: (prev[scopeKey] || []).map((item) => (
        item.id === checklistId
          ? { ...item, items: sortTaskChecklistItems([...(item.items || []), ...nextItems]) }
          : item
      )),
    }));
    setChecklistMessage('');
  }, [checklistsAvailable, currentUserId, findChecklist, isExternalView, setUnavailableFromError]);

  const renameChecklistItem = useCallback(async (itemId, title) => {
    const trimmedTitle = String(title || '').trim();
    if (!itemId || !trimmedTitle || isExternalView || !checklistsAvailable) return;

    setChecklistsByScopeKey((prev) => replaceChecklistItemInState(prev, itemId, (item) => ({
      ...item,
      title: trimmedTitle,
    })));

    const { error } = await supabase
      .from('task_card_checklist_items')
      .update({ title: trimmedTitle, updated_at: new Date().toISOString() })
      .eq('id', itemId);

    if (error) {
      if (!setUnavailableFromError(error)) {
        console.error('Failed to rename checklist item:', error);
        setChecklistMessage('Unable to rename this checklist item right now.');
        void loadChecklists();
      }
    }
  }, [checklistsAvailable, isExternalView, loadChecklists, setUnavailableFromError]);

  const toggleChecklistItem = useCallback(async (itemId, checked) => {
    if (!itemId || isExternalView || !checklistsAvailable) return;

    setChecklistsByScopeKey((prev) => replaceChecklistItemInState(prev, itemId, (item) => ({
      ...item,
      checked: checked === true,
    })));

    const { error } = await supabase
      .from('task_card_checklist_items')
      .update({ checked: checked === true, updated_at: new Date().toISOString() })
      .eq('id', itemId);

    if (error) {
      if (!setUnavailableFromError(error)) {
        console.error('Failed to update checklist item:', error);
        setChecklistMessage('Unable to update this checklist item right now.');
        void loadChecklists();
      }
    }
  }, [checklistsAvailable, isExternalView, loadChecklists, setUnavailableFromError]);

  const deleteChecklistItem = useCallback(async (itemId) => {
    if (!itemId || isExternalView || !checklistsAvailable) return;

    setChecklistsByScopeKey((prev) => Object.fromEntries(
      Object.entries(prev).map(([scopeKey, checklists]) => [
        scopeKey,
        checklists.map((checklist) => ({
          ...checklist,
          items: (checklist.items || []).filter((item) => item.id !== itemId),
        })),
      ])
    ));

    const { error } = await supabase
      .from('task_card_checklist_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      if (!setUnavailableFromError(error)) {
        console.error('Failed to delete checklist item:', error);
        setChecklistMessage('Unable to delete this checklist item right now.');
        void loadChecklists();
      }
    }
  }, [checklistsAvailable, isExternalView, loadChecklists, setUnavailableFromError]);

  const moveChecklistItem = useCallback(async (checklistId, itemId, direction) => {
    if (!checklistId || !itemId || isExternalView || !checklistsAvailable) return;
    const { checklist } = findChecklist(checklistId);
    if (!checklist) return;

    const items = sortTaskChecklistItems(checklist.items || []);
    const currentIndex = items.findIndex((item) => item.id === itemId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= items.length) return;

    const itemsWithoutDragged = items.filter((item) => item.id !== itemId);
    const insertIndex = direction < 0 ? targetIndex : targetIndex + 1;
    const nextPosition = calculateTaskChecklistPosition(itemsWithoutDragged, insertIndex);

    setChecklistsByScopeKey((prev) => replaceChecklistItemInState(prev, itemId, (item) => ({
      ...item,
      position: nextPosition,
    })));

    const { error } = await supabase
      .from('task_card_checklist_items')
      .update({ position: nextPosition, updated_at: new Date().toISOString() })
      .eq('id', itemId);

    if (error) {
      if (!setUnavailableFromError(error)) {
        console.error('Failed to move checklist item:', error);
        setChecklistMessage('Unable to move this checklist item right now.');
        void loadChecklists();
      }
    }
  }, [checklistsAvailable, findChecklist, isExternalView, loadChecklists, setUnavailableFromError]);

  return {
    addChecklist,
    addChecklistItems,
    checklistMessage,
    checklistsAvailable,
    checklistsLoading,
    deleteChecklist,
    deleteChecklistItem,
    getChecklistSummaryForTodo,
    getChecklistsForTodo,
    moveChecklistItem,
    renameChecklist,
    renameChecklistItem,
    toggleChecklistItem,
  };
}
