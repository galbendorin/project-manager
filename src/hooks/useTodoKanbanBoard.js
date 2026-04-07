import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const DEFAULT_KANBAN_COLUMNS = [
  { title: 'To do', position: 0 },
  { title: 'Doing', position: 1024 },
  { title: 'Done later', position: 2048 },
];

const makeLocalColumnId = (index) => `kanban-local-${index + 1}`;

const sortColumns = (columns = []) => (
  [...columns].sort((left, right) => {
    const leftPos = Number(left.position) || 0;
    const rightPos = Number(right.position) || 0;
    if (leftPos !== rightPos) return leftPos - rightPos;
    return String(left.title || '').localeCompare(String(right.title || ''));
  })
);

const sortCards = (cards = []) => (
  [...cards].sort((left, right) => {
    const leftPos = Number(left.kanbanPosition) || 0;
    const rightPos = Number(right.kanbanPosition) || 0;
    if (leftPos !== rightPos) return leftPos - rightPos;
    return String(left.title || '').localeCompare(String(right.title || ''));
  })
);

const buildFallbackColumns = () => (
  DEFAULT_KANBAN_COLUMNS.map((column, index) => ({
    id: makeLocalColumnId(index),
    title: column.title,
    position: column.position,
    isLocalOnly: true,
  }))
);

const isMissingRelationError = (error, relationName) => {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return message.includes('relation') && message.includes(relationName.toLowerCase());
};

const computeNextPosition = (cards = [], targetIndex) => {
  const ordered = sortCards(cards);
  const previous = targetIndex > 0 ? ordered[targetIndex - 1] : null;
  const next = targetIndex < ordered.length ? ordered[targetIndex] : null;
  const previousPos = previous ? Number(previous.kanbanPosition) || 0 : null;
  const nextPos = next ? Number(next.kanbanPosition) || 0 : null;

  if (previousPos === null && nextPos === null) return 1024;
  if (previousPos === null) return nextPos - 1024;
  if (nextPos === null) return previousPos + 1024;
  return previousPos + ((nextPos - previousPos) / 2);
};

export function useTodoKanbanBoard({
  currentProject,
  currentUserId,
  isExternalView,
  onAddTodo,
  onUpdateTodo,
  scope,
  visibleOpenTodos,
}) {
  const [columns, setColumns] = useState([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [kanbanMessage, setKanbanMessage] = useState('');
  const supportsPersistentColumnsRef = useRef(true);
  const loadingColumnsRef = useRef(false);

  const projectId = currentProject?.id || null;

  const projectKanbanTodos = useMemo(() => (
    (visibleOpenTodos || []).filter((todo) => todo.projectId === projectId)
  ), [projectId, visibleOpenTodos]);

  const loadColumns = useCallback(async () => {
    if (!projectId || scope !== 'project') {
      setColumns([]);
      return [];
    }

    if (!supportsPersistentColumnsRef.current) {
      const fallback = buildFallbackColumns();
      setColumns(fallback);
      return fallback;
    }

    setColumnsLoading(true);
    loadingColumnsRef.current = true;

    const { data, error } = await supabase
      .from('task_board_columns')
      .select('id, title, position, created_at, updated_at')
      .eq('project_id', projectId)
      .order('position', { ascending: true });

    loadingColumnsRef.current = false;
    setColumnsLoading(false);

    if (error) {
      if (isMissingRelationError(error, 'task_board_columns')) {
        supportsPersistentColumnsRef.current = false;
        const fallback = buildFallbackColumns();
        setColumns(fallback);
        setKanbanMessage('Kanban columns are using a local fallback until the board migration is applied.');
        return fallback;
      }

      console.error('Failed to load Kanban columns:', error);
      setKanbanMessage('Unable to load Kanban columns right now.');
      return [];
    }

    if ((data || []).length === 0 && !isExternalView && currentUserId) {
      const { data: insertedColumns, error: insertError } = await supabase
        .from('task_board_columns')
        .insert(DEFAULT_KANBAN_COLUMNS.map((column) => ({
          user_id: currentUserId,
          project_id: projectId,
          title: column.title,
          position: column.position,
        })))
        .select('id, title, position, created_at, updated_at');

      if (!insertError && insertedColumns) {
        const nextColumns = sortColumns(insertedColumns);
        setColumns(nextColumns);
        return nextColumns;
      }

      if (insertError) {
        console.error('Failed to seed Kanban columns:', insertError);
      }
    }

    const nextColumns = sortColumns(data || []);
    setColumns(nextColumns);
    setKanbanMessage('');
    return nextColumns;
  }, [currentUserId, isExternalView, projectId, scope]);

  useEffect(() => {
    void loadColumns();
  }, [loadColumns]);

  const normalizedColumns = useMemo(() => {
    if (columns.length > 0) return columns;
    if (!projectId || scope !== 'project') return [];
    return buildFallbackColumns();
  }, [columns, projectId, scope]);

  const columnsWithCards = useMemo(() => {
    if (normalizedColumns.length === 0) return [];

    const firstColumnId = normalizedColumns[0]?.id || null;
    return normalizedColumns.map((column) => {
      const cards = projectKanbanTodos.filter((todo) => (
        (todo.kanbanColumnId || firstColumnId) === column.id
      ));
      return {
        ...column,
        cards: sortCards(cards),
      };
    });
  }, [projectKanbanTodos, normalizedColumns]);

  const createCardInColumn = useCallback(async (columnId, title) => {
    const trimmedTitle = String(title || '').trim();
    if (!trimmedTitle || !onAddTodo || !projectId) return null;

    const targetColumn = columnsWithCards.find((column) => column.id === columnId);
    const nextPosition = computeNextPosition(targetColumn?.cards || [], (targetColumn?.cards || []).length);

    return onAddTodo({
      title: trimmedTitle,
      projectId,
      dueDate: '',
      kanbanColumnId: columnId,
      kanbanPosition: nextPosition,
    });
  }, [columnsWithCards, onAddTodo, projectId]);

  const moveCardToColumn = useCallback(async (todo, targetColumnId, targetIndex) => {
    if (!todo?._id || !onUpdateTodo) return;

    const targetColumn = columnsWithCards.find((column) => column.id === targetColumnId);
    if (!targetColumn) return;

    const cardsWithoutDragged = targetColumn.cards.filter((card) => card._id !== todo._id);
    const nextPosition = computeNextPosition(cardsWithoutDragged, targetIndex);

    await onUpdateTodo(todo._id, 'kanbanMeta', {
      kanbanColumnId: targetColumnId,
      kanbanPosition: nextPosition,
    });
  }, [columnsWithCards, onUpdateTodo]);

  const renameColumn = useCallback(async (columnId, title) => {
    const trimmedTitle = String(title || '').trim();
    if (!trimmedTitle) return;

    setColumns((prev) => prev.map((column) => (
      column.id === columnId ? { ...column, title: trimmedTitle } : column
    )));

    if (!supportsPersistentColumnsRef.current) return;

    const { error } = await supabase
      .from('task_board_columns')
      .update({
        title: trimmedTitle,
        updated_at: new Date().toISOString(),
      })
      .eq('id', columnId);

    if (error) {
      console.error('Failed to rename Kanban column:', error);
      setKanbanMessage('Unable to rename this Kanban list right now.');
      void loadColumns();
    }
  }, [loadColumns]);

  const addColumn = useCallback(async (title) => {
    const trimmedTitle = String(title || '').trim();
    if (!trimmedTitle || !projectId || isExternalView || !currentUserId) return;

    const nextPosition = (normalizedColumns[normalizedColumns.length - 1]?.position || 0) + 1024;

    if (!supportsPersistentColumnsRef.current) {
      setColumns((prev) => [...prev, {
        id: makeLocalColumnId(prev.length),
        title: trimmedTitle,
        position: nextPosition,
        isLocalOnly: true,
      }]);
      return;
    }

    const { data, error } = await supabase
      .from('task_board_columns')
      .insert({
        user_id: currentUserId,
        project_id: projectId,
        title: trimmedTitle,
        position: nextPosition,
      })
      .select('id, title, position, created_at, updated_at')
      .single();

    if (error || !data) {
      console.error('Failed to add Kanban column:', error);
      setKanbanMessage('Unable to add a new Kanban list right now.');
      return;
    }

    setColumns((prev) => sortColumns([...prev, data]));
  }, [currentUserId, isExternalView, normalizedColumns, projectId]);

  return {
    addColumn,
    columns: columnsWithCards,
    columnsLoading,
    createCardInColumn,
    kanbanAvailable: scope === 'project' && Boolean(projectId),
    kanbanMessage,
    moveCardToColumn,
    renameColumn,
  };
}
