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
    const leftPos = Number.isFinite(Number(left.boardPosition)) ? Number(left.boardPosition) : (Number(left.kanbanPosition) || 0);
    const rightPos = Number.isFinite(Number(right.boardPosition)) ? Number(right.boardPosition) : (Number(right.kanbanPosition) || 0);
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

const buildCardKey = (todo = {}) => {
  if (!todo?.isDerived) {
    return `manual:${todo?._id || todo?.id || ''}`;
  }

  if (todo.originType === 'register' && todo.originRegisterType && todo.originItemId) {
    return `register:${todo.originRegisterType}:${todo.originItemId}`;
  }

  if (todo.originType === 'tracker' && todo.originItemId) {
    return `tracker:${todo.originItemId}`;
  }

  if (todo.originType === 'schedule' && (todo.originTaskId !== null && todo.originTaskId !== undefined)) {
    return `schedule:${todo.originTaskId}`;
  }

  return `derived:${todo?._id || todo?.id || ''}`;
};

const isMissingRelationError = (error, relationName) => {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return message.includes('relation') && message.includes(relationName.toLowerCase());
};

const computeNextPosition = (cards = [], targetIndex) => {
  const ordered = sortCards(cards);
  const previous = targetIndex > 0 ? ordered[targetIndex - 1] : null;
  const next = targetIndex < ordered.length ? ordered[targetIndex] : null;
  const previousPos = previous
    ? (Number.isFinite(Number(previous.boardPosition)) ? Number(previous.boardPosition) : (Number(previous.kanbanPosition) || 0))
    : null;
  const nextPos = next
    ? (Number.isFinite(Number(next.boardPosition)) ? Number(next.boardPosition) : (Number(next.kanbanPosition) || 0))
    : null;

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
  const [cardOverrides, setCardOverrides] = useState({});
  const [kanbanMessage, setKanbanMessage] = useState('');
  const supportsPersistentColumnsRef = useRef(true);
  const supportsPersistentCardsRef = useRef(true);

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

    const { data, error } = await supabase
      .from('task_board_columns')
      .select('id, title, position, created_at, updated_at')
      .eq('project_id', projectId)
      .order('position', { ascending: true });

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

  const loadCardOverrides = useCallback(async () => {
    if (!projectId || scope !== 'project') {
      setCardOverrides({});
      return {};
    }

    if (!supportsPersistentCardsRef.current) {
      setCardOverrides({});
      return {};
    }

    const { data, error } = await supabase
      .from('task_board_cards')
      .select('card_key, column_id, position')
      .eq('project_id', projectId);

    if (error) {
      if (isMissingRelationError(error, 'task_board_cards')) {
        supportsPersistentCardsRef.current = false;
        setCardOverrides({});
        setKanbanMessage((prev) => prev || 'Kanban card positions are using a local fallback until the board migration is applied.');
        return {};
      }

      console.error('Failed to load Kanban card positions:', error);
      setKanbanMessage('Unable to load Kanban card positions right now.');
      return {};
    }

    const nextOverrides = Object.fromEntries(
      (data || []).map((item) => [
        item.card_key,
        {
          columnId: item.column_id || null,
          position: Number(item.position) || 0,
        }
      ])
    );
    setCardOverrides(nextOverrides);
    return nextOverrides;
  }, [projectId, scope]);

  useEffect(() => {
    void loadCardOverrides();
  }, [loadCardOverrides]);

  const normalizedColumns = useMemo(() => {
    if (columns.length > 0) return columns;
    if (!projectId || scope !== 'project') return [];
    return buildFallbackColumns();
  }, [columns, projectId, scope]);

  const columnsWithCards = useMemo(() => {
    if (normalizedColumns.length === 0) return [];

    const firstColumnId = normalizedColumns[0]?.id || null;
    return normalizedColumns.map((column) => {
      const cards = projectKanbanTodos
        .map((todo) => {
          const cardKey = buildCardKey(todo);
          const override = cardOverrides[cardKey];
          const boardColumnId = todo.isDerived
            ? (override?.columnId || firstColumnId)
            : (todo.kanbanColumnId || firstColumnId);
          const boardPosition = todo.isDerived
            ? (Number.isFinite(Number(override?.position)) ? Number(override.position) : 0)
            : (Number.isFinite(Number(todo.kanbanPosition)) ? Number(todo.kanbanPosition) : 0);

          return {
            ...todo,
            kanbanCardKey: cardKey,
            boardColumnId,
            boardPosition,
          };
        })
        .filter((todo) => todo.boardColumnId === column.id);

      return {
        ...column,
        cards: [...cards].sort((left, right) => {
          const leftPos = Number(left.boardPosition) || 0;
          const rightPos = Number(right.boardPosition) || 0;
          if (leftPos !== rightPos) return leftPos - rightPos;
          return String(left.title || '').localeCompare(String(right.title || ''));
        }),
      };
    });
  }, [cardOverrides, projectKanbanTodos, normalizedColumns]);

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
    if (!todo?._id) return;

    const targetColumn = columnsWithCards.find((column) => column.id === targetColumnId);
    if (!targetColumn) return;

    const sourceColumn = columnsWithCards.find((column) => (
      column.cards.some((card) => card._id === todo._id)
    ));
    const sourceIndex = sourceColumn
      ? sourceColumn.cards.findIndex((card) => card._id === todo._id)
      : -1;

    const cardsWithoutDragged = targetColumn.cards.filter((card) => card._id !== todo._id);
    const adjustedTargetIndex = sourceColumn?.id === targetColumnId && sourceIndex >= 0 && sourceIndex < targetIndex
      ? Math.max(0, targetIndex - 1)
      : targetIndex;
    const nextPosition = computeNextPosition(cardsWithoutDragged, adjustedTargetIndex);

    if (!todo.isDerived) {
      if (!onUpdateTodo) return;
      await onUpdateTodo(todo._id, 'kanbanMeta', {
        kanbanColumnId: targetColumnId,
        kanbanPosition: nextPosition,
      });
      return;
    }

    const cardKey = buildCardKey(todo);
    setCardOverrides((prev) => ({
      ...prev,
      [cardKey]: {
        columnId: targetColumnId,
        position: nextPosition,
      }
    }));

    if (!supportsPersistentCardsRef.current || !currentUserId || isExternalView || !projectId) return;

    const { error } = await supabase
      .from('task_board_cards')
      .upsert({
        user_id: currentUserId,
        project_id: projectId,
        card_key: cardKey,
        column_id: targetColumnId,
        position: nextPosition,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,card_key' });

    if (error) {
      if (isMissingRelationError(error, 'task_board_cards')) {
        supportsPersistentCardsRef.current = false;
        setKanbanMessage((prev) => prev || 'Kanban card positions are using a local fallback until the board migration is applied.');
        return;
      }

      console.error('Failed to persist Kanban card position:', error);
      setKanbanMessage('Unable to save this Kanban move right now.');
      void loadCardOverrides();
    }
  }, [columnsWithCards, currentUserId, isExternalView, loadCardOverrides, onUpdateTodo, projectId]);

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
