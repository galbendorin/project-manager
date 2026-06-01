import React, { useEffect, useMemo, useState } from 'react';
import { summarizeTaskChecklists } from '../utils/taskCardChecklists';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from './Icons';

const ChecklistIcon = ({ className = 'h-5 w-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l2 2 4-5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5h14v14H5z" />
  </svg>
);

const CheckIcon = ({ className = 'h-4 w-4' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const SmallIconButton = ({ children, disabled, label, onClick }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
      disabled
        ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
        : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'
    }`}
  >
    {children}
  </button>
);

const ChecklistTitleInput = ({ canEdit, checklist, onRenameChecklist }) => {
  const [draftTitle, setDraftTitle] = useState(checklist.title || 'Checklist');

  useEffect(() => {
    setDraftTitle(checklist.title || 'Checklist');
  }, [checklist.id, checklist.title]);

  const commitTitle = () => {
    const trimmed = draftTitle.trim();
    if (!trimmed) {
      setDraftTitle(checklist.title || 'Checklist');
      return;
    }
    if (trimmed !== checklist.title) {
      onRenameChecklist(checklist.id, trimmed);
    }
  };

  if (!canEdit) {
    return <div className="text-sm font-semibold text-slate-900">{checklist.title || 'Checklist'}</div>;
  }

  return (
    <input
      type="text"
      value={draftTitle}
      onChange={(event) => setDraftTitle(event.target.value)}
      onBlur={commitTitle}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitTitle();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setDraftTitle(checklist.title || 'Checklist');
          event.currentTarget.blur();
        }
      }}
      className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-slate-900 outline-none transition hover:border-slate-200 hover:bg-white focus:border-indigo-300 focus:bg-white"
    />
  );
};

const ChecklistItemRow = ({
  canEdit,
  canMoveDown,
  canMoveUp,
  checklist,
  item,
  onDeleteChecklistItem,
  onMoveChecklistItem,
  onRenameChecklistItem,
  onToggleChecklistItem,
}) => {
  const [draftTitle, setDraftTitle] = useState(item.title || '');

  useEffect(() => {
    setDraftTitle(item.title || '');
  }, [item.id, item.title]);

  const commitTitle = () => {
    const trimmed = draftTitle.trim();
    if (!trimmed) {
      setDraftTitle(item.title || '');
      return;
    }
    if (trimmed !== item.title) {
      onRenameChecklistItem(item.id, trimmed);
    }
  };

  return (
    <div className="group flex items-start gap-2 rounded-xl px-1 py-1.5 transition hover:bg-slate-50">
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => onToggleChecklistItem(item.id, !item.checked)}
        aria-label={item.checked ? `Mark ${item.title || 'item'} incomplete` : `Mark ${item.title || 'item'} complete`}
        className={`mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition ${
          item.checked
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-slate-300 bg-white text-transparent hover:border-indigo-400 hover:bg-indigo-50'
        } ${canEdit ? 'focus:outline-none focus:ring-2 focus:ring-indigo-400/30' : 'cursor-default opacity-80'}`}
      >
        <CheckIcon />
      </button>

      <div className="min-w-0 flex-1">
        {canEdit ? (
          <input
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTitle();
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                setDraftTitle(item.title || '');
                event.currentTarget.blur();
              }
            }}
            className={`w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none transition hover:border-slate-200 hover:bg-white focus:border-indigo-300 focus:bg-white ${
              item.checked ? 'text-slate-400 line-through' : 'text-slate-800'
            }`}
          />
        ) : (
          <div className={`px-2 py-1.5 text-sm ${item.checked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
            {item.title || 'Checklist item'}
          </div>
        )}
      </div>

      {canEdit ? (
        <div className="flex flex-shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
          <SmallIconButton
            disabled={!canMoveUp}
            label="Move checklist item up"
            onClick={() => onMoveChecklistItem(checklist.id, item.id, -1)}
          >
            <IconArrowUp />
          </SmallIconButton>
          <SmallIconButton
            disabled={!canMoveDown}
            label="Move checklist item down"
            onClick={() => onMoveChecklistItem(checklist.id, item.id, 1)}
          >
            <IconArrowDown />
          </SmallIconButton>
          <SmallIconButton
            label="Delete checklist item"
            onClick={() => onDeleteChecklistItem(item.id)}
          >
            <IconTrash />
          </SmallIconButton>
        </div>
      ) : null}
    </div>
  );
};

const ChecklistItemComposer = ({ checklistId, disabled, onAddChecklistItems }) => {
  const [draftValue, setDraftValue] = useState('');

  const submit = async () => {
    const trimmed = draftValue.trim();
    if (!trimmed || disabled) return;
    setDraftValue('');
    await onAddChecklistItems(checklistId, trimmed);
  };

  return (
    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
      <input
        type="text"
        value={draftValue}
        disabled={disabled}
        onChange={(event) => setDraftValue(event.target.value)}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData('text');
          if (!pasted.includes('\n')) return;
          event.preventDefault();
          setDraftValue('');
          void onAddChecklistItems(checklistId, pasted);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder="Add an item"
        className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 disabled:bg-slate-50 disabled:text-slate-400"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={disabled || !draftValue.trim()}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      >
        <IconPlus />
        Add
      </button>
    </div>
  );
};

export default function TaskCardChecklistPanel({
  canEdit,
  checklists,
  checklistsAvailable,
  checklistsLoading,
  checklistMessage,
  onAddChecklist,
  onAddChecklistItems,
  onDeleteChecklist,
  onDeleteChecklistItem,
  onMoveChecklistItem,
  onRenameChecklist,
  onRenameChecklistItem,
  onToggleChecklistItem,
}) {
  const [hiddenCompleted, setHiddenCompleted] = useState({});
  const summary = useMemo(() => summarizeTaskChecklists(checklists), [checklists]);

  return (
    <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <ChecklistIcon />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Checklists
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {summary.total ? `${summary.completed}/${summary.total} complete` : 'No checklist items'}
            </div>
          </div>
        </div>

        {canEdit && checklistsAvailable ? (
          <button
            type="button"
            onClick={() => onAddChecklist()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <IconPlus />
            Checklist
          </button>
        ) : null}
      </div>

      {summary.total ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${summary.isComplete ? 'bg-emerald-500' : 'bg-indigo-500'}`}
              style={{ width: `${summary.percent}%` }}
            />
          </div>
          <div className="w-10 text-right text-[11px] font-semibold text-slate-500">{summary.percent}%</div>
        </div>
      ) : null}

      {checklistMessage ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {checklistMessage}
        </div>
      ) : null}

      {checklistsLoading ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Loading checklists...
        </div>
      ) : null}

      {checklists.length === 0 && !checklistsLoading ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
          No checklists yet.
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {checklists.map((checklist) => {
          const orderedItems = checklist.items || [];
          const checklistSummary = summarizeTaskChecklists([checklist]);
          const completedCount = orderedItems.filter((item) => item.checked).length;
          const hideCompleted = hiddenCompleted[checklist.id] === true;
          const visibleItems = hideCompleted
            ? orderedItems.filter((item) => !item.checked)
            : orderedItems;

          return (
            <div key={checklist.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <ChecklistTitleInput
                    canEdit={canEdit && checklistsAvailable}
                    checklist={checklist}
                    onRenameChecklist={onRenameChecklist}
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                      <div
                        className={`h-full rounded-full transition-all ${checklistSummary.isComplete ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                        style={{ width: `${checklistSummary.percent}%` }}
                      />
                    </div>
                    <div className="w-10 text-right text-[11px] font-semibold text-slate-500">
                      {checklistSummary.completed}/{checklistSummary.total}
                    </div>
                  </div>
                </div>

                {canEdit && checklistsAvailable ? (
                  <SmallIconButton
                    label="Delete checklist"
                    onClick={() => onDeleteChecklist(checklist.id)}
                  >
                    <IconTrash />
                  </SmallIconButton>
                ) : null}
              </div>

              {completedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setHiddenCompleted((prev) => ({
                    ...prev,
                    [checklist.id]: !hideCompleted,
                  }))}
                  className="mt-3 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {hideCompleted ? `Show completed (${completedCount})` : `Hide completed (${completedCount})`}
                </button>
              ) : null}

              <div className="mt-3 space-y-1">
                {visibleItems.map((item) => {
                  const itemIndex = orderedItems.findIndex((candidate) => candidate.id === item.id);
                  return (
                    <ChecklistItemRow
                      key={item.id}
                      canEdit={canEdit && checklistsAvailable}
                      canMoveDown={itemIndex >= 0 && itemIndex < orderedItems.length - 1}
                      canMoveUp={itemIndex > 0}
                      checklist={checklist}
                      item={item}
                      onDeleteChecklistItem={onDeleteChecklistItem}
                      onMoveChecklistItem={onMoveChecklistItem}
                      onRenameChecklistItem={onRenameChecklistItem}
                      onToggleChecklistItem={onToggleChecklistItem}
                    />
                  );
                })}
              </div>

              {canEdit && checklistsAvailable ? (
                <ChecklistItemComposer
                  checklistId={checklist.id}
                  disabled={!canEdit || !checklistsAvailable}
                  onAddChecklistItems={onAddChecklistItems}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
