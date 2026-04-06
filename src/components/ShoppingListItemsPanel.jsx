import React from 'react';
import { isOfflineTempId } from '../utils/offlineState';

export default function ShoppingListItemsPanel({
  CheckIcon,
  ChevronDownIcon,
  ListChecksIcon,
  LoaderIcon,
  ShoppingBasketIcon,
  TrashIcon,
  completedTodos,
  deleteTodo,
  desktopCompact,
  failedTodoId,
  failedTodoMessage,
  handleToggleTodo,
  isCompactDesktop,
  isMobile,
  isOnline,
  loadingTodos,
  offlineQueue,
  openTodos,
  pendingCompleteId,
  pendingCompleteSeconds,
  queuedTodoIds,
  retryTodoAction,
  savingTodoAction,
  savingTodoId,
  setDesktopCompact,
  shouldCollapseBought,
  showBought,
  setShowBought,
  shoppingSyncSummary,
  syncingQueue,
  todos,
}) {
  return (
    <div className="pm-list-shell rounded-[28px] p-3 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="pm-kicker text-sm">Shopping items</h3>
          <div className="mt-1 text-xs text-slate-500">
            {shoppingSyncSummary}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          {!isMobile ? (
            <button
              type="button"
              onClick={() => setDesktopCompact((value) => !value)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              {desktopCompact ? 'Comfortable list' : 'Compact list'}
            </button>
          ) : null}
          <div>
            <span className="text-xs text-slate-400">
              {loadingTodos ? 'Loading...' : `${openTodos.length} open · ${completedTodos.length} bought`}
            </span>
            {offlineQueue.length > 0 ? (
              <div className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                {offlineQueue.length} waiting
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {loadingTodos ? (
        <div className="pm-surface-card rounded-[24px] px-4 py-12 text-center shadow-sm">
          <div className="inline-flex items-center gap-2 text-sm text-slate-500">
            <LoaderIcon className="h-4 w-4 animate-spin" />
            Loading groceries...
          </div>
        </div>
      ) : todos.length === 0 ? (
        <div className="pm-surface-card rounded-[24px] px-4 py-12 text-center shadow-sm">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-[var(--pm-accent)] shadow-sm">
            <ShoppingBasketIcon className="h-5 w-5" />
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-900">Your shared grocery list is ready</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Add a few groceries above, or use voice to drop in a quick list for the week.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <ListChecksIcon className="h-4 w-4 text-[var(--pm-accent)]" />
              <h4 className="text-sm font-semibold text-slate-900">To buy</h4>
            </div>
            <div className="space-y-3">
              {openTodos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-500">
                  Nothing open right now.
                </div>
              ) : openTodos.map((todo) => {
                const syncState = queuedTodoIds.has(todo._id) || isOfflineTempId(todo._id)
                  ? (syncingQueue && isOnline ? 'syncing' : 'offline')
                  : '';

                return (
                  <div
                    key={todo._id}
                    className={`border bg-white shadow-sm transition ${
                      isCompactDesktop ? 'rounded-[18px] px-3.5 py-3' : 'rounded-[22px] px-4 py-4'
                    } ${
                      pendingCompleteId === todo._id
                        ? 'border-[var(--pm-accent)] bg-[var(--pm-accent-tint)]'
                        : savingTodoId === todo._id
                          ? 'border-emerald-200 bg-emerald-50/70'
                          : 'border-slate-200'
                    }`}
                  >
                    <div className={`flex gap-3 ${isCompactDesktop ? 'items-center' : 'items-start sm:items-center'}`}>
                      {isMobile ? (
                        <span
                          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
                            pendingCompleteId === todo._id
                              ? 'border-[var(--pm-accent)] bg-white text-[var(--pm-accent)]'
                              : savingTodoId === todo._id
                                ? 'border-emerald-300 bg-white text-emerald-600'
                                : 'border-slate-200 bg-white text-slate-400'
                          }`}
                          aria-hidden="true"
                        >
                          {savingTodoId === todo._id ? (
                            <LoaderIcon className="h-4 w-4 animate-spin" />
                          ) : pendingCompleteId === todo._id ? (
                            <span className="text-sm font-bold">{pendingCompleteSeconds}</span>
                          ) : (
                            <CheckIcon className="h-4 w-4" />
                          )}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleTodo(todo)}
                          disabled={savingTodoId === todo._id}
                          className={`inline-flex shrink-0 items-center justify-center rounded-full border transition ${
                            isCompactDesktop ? 'h-9 w-9' : 'h-11 w-11'
                          } ${
                            pendingCompleteId === todo._id
                              ? 'border-[var(--pm-accent)] bg-white text-[var(--pm-accent)]'
                              : savingTodoId === todo._id
                                ? 'border-emerald-300 bg-white text-emerald-600'
                                : 'border-slate-200 bg-white text-slate-400 hover:border-emerald-300 hover:text-emerald-600'
                          }`}
                          aria-label={`Mark ${todo.title} as bought`}
                        >
                          {savingTodoId === todo._id ? (
                            <LoaderIcon className="h-4 w-4 animate-spin" />
                          ) : pendingCompleteId === todo._id ? (
                            <span className="text-sm font-bold">{pendingCompleteSeconds}</span>
                          ) : (
                            <CheckIcon className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className={`flex justify-between gap-3 ${isCompactDesktop ? 'items-center' : 'items-start'}`}>
                          <div className="min-w-0 flex-1">
                            <p className={`font-semibold text-slate-900 ${isCompactDesktop ? 'text-sm leading-5' : 'text-base leading-6 sm:text-sm'}`}>{todo.title}</p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {savingTodoId === todo._id ? (
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm">
                                Saving...
                              </span>
                            ) : null}
                            {syncState ? (
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                syncState === 'syncing'
                                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                  : 'border-amber-200 bg-amber-50 text-amber-700'
                              }`}>
                                {syncState === 'syncing' ? 'Syncing' : 'Saved offline'}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {(isMobile || pendingCompleteId === todo._id || savingTodoId === todo._id || failedTodoId === todo._id || !isCompactDesktop) ? (
                          <p className={`mt-1 text-xs ${
                            pendingCompleteId === todo._id
                              ? 'text-[var(--pm-accent-strong)]'
                              : savingTodoId === todo._id
                                ? 'text-emerald-700'
                                : 'text-slate-400'
                          }`}>
                            {savingTodoId === todo._id
                              ? (savingTodoAction === 'complete' ? `Saving ${todo.title} as bought...` : 'Saving...')
                              : pendingCompleteId === todo._id
                                ? `Marking bought in ${pendingCompleteSeconds}s. Tap again to cancel.`
                                : (isMobile ? 'Tap Bought to move it off the live list.' : 'Tap the check to mark this item as bought.')}
                          </p>
                        ) : null}
                        {failedTodoId === todo._id ? (
                          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
                            <p className="text-xs font-medium text-rose-700">{failedTodoMessage}</p>
                            <button
                              type="button"
                              onClick={() => retryTodoAction(todo)}
                              className="mt-2 inline-flex min-h-9 items-center rounded-full border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                            >
                              Retry
                            </button>
                          </div>
                        ) : null}
                        {isMobile ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleTodo(todo)}
                              disabled={savingTodoId === todo._id}
                              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition ${
                                pendingCompleteId === todo._id
                                  ? 'border-[var(--pm-accent)] bg-white text-[var(--pm-accent-strong)]'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                            >
                              <CheckIcon className="h-4 w-4" />
                              {pendingCompleteId === todo._id ? `Bought in ${pendingCompleteSeconds}s` : 'Bought'}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTodo(todo._id)}
                              disabled={savingTodoId === todo._id}
                              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                            >
                              <TrashIcon className="h-4 w-4" />
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {!isMobile ? (
                        <button
                          type="button"
                          onClick={() => deleteTodo(todo._id)}
                          disabled={savingTodoId === todo._id}
                          className={`inline-flex shrink-0 items-center justify-center rounded-full border border-transparent text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 ${
                            isCompactDesktop ? 'h-9 w-9' : 'h-11 w-11'
                          }`}
                          aria-label={`Delete ${todo.title}`}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <CheckIcon className="h-4 w-4 text-emerald-600" />
              <h4 className="text-sm font-semibold text-slate-900">Bought</h4>
            </div>
            <div className="space-y-3">
              {completedTodos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-sm text-slate-500">
                  Bought groceries will collect here.
                </div>
              ) : null}
              {completedTodos.length > 0 ? (
                <div className="mb-3 flex items-center justify-between">
                  {shouldCollapseBought ? (
                    <button
                      type="button"
                      onClick={() => setShowBought((value) => !value)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      {showBought ? 'Hide bought' : `Show bought (${completedTodos.length})`}
                      <ChevronDownIcon className={`h-3.5 w-3.5 transition ${showBought ? 'rotate-180' : ''}`} />
                    </button>
                  ) : null}
                </div>
              ) : null}
              {completedTodos.length > 0 && (!shouldCollapseBought || showBought) ? completedTodos.map((todo) => {
                const syncState = queuedTodoIds.has(todo._id) || isOfflineTempId(todo._id)
                  ? (syncingQueue && isOnline ? 'syncing' : 'offline')
                  : '';

                return (
                  <div key={todo._id} className={`border border-slate-200 bg-white/90 shadow-sm ${
                    isCompactDesktop ? 'rounded-[18px] px-3.5 py-3' : 'rounded-[22px] px-4 py-4'
                  }`}>
                    <div className={`flex gap-3 ${isCompactDesktop ? 'items-center' : 'items-start sm:items-center'}`}>
                      {isMobile ? (
                        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600" aria-hidden="true">
                          {savingTodoId === todo._id ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <CheckIcon className="h-4 w-4" />}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleTodo(todo)}
                          disabled={savingTodoId === todo._id}
                          className={`inline-flex shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 ${
                            isCompactDesktop ? 'h-9 w-9' : 'h-11 w-11'
                          }`}
                          aria-label={`Move ${todo.title} back to open`}
                        >
                          {savingTodoId === todo._id ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <CheckIcon className="h-4 w-4" />}
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className={`flex justify-between gap-3 ${isCompactDesktop ? 'items-center' : 'items-start'}`}>
                          <p className={`font-semibold text-slate-400 line-through ${isCompactDesktop ? 'text-sm leading-5' : 'text-base leading-6 sm:text-sm'}`}>{todo.title}</p>
                          {syncState ? (
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                              syncState === 'syncing'
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}>
                              {syncState === 'syncing' ? 'Syncing' : 'Saved offline'}
                            </span>
                          ) : null}
                        </div>
                        {(isMobile || savingTodoId === todo._id || failedTodoId === todo._id || !isCompactDesktop) ? (
                          <p className={`mt-1 text-xs ${savingTodoId === todo._id ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {savingTodoId === todo._id
                              ? (savingTodoAction === 'reopen' ? `Saving ${todo.title}...` : 'Saving...')
                              : (isMobile ? 'Use Undo if this needs to go back on the live list.' : 'Tap the check if you need to reopen it.')}
                          </p>
                        ) : null}
                        {failedTodoId === todo._id ? (
                          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3">
                            <p className="text-xs font-medium text-rose-700">{failedTodoMessage}</p>
                            <button
                              type="button"
                              onClick={() => retryTodoAction(todo)}
                              className="mt-2 inline-flex min-h-9 items-center rounded-full border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                            >
                              Retry
                            </button>
                          </div>
                        ) : null}
                        {isMobile ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleTodo(todo)}
                              disabled={savingTodoId === todo._id}
                              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                            >
                              <CheckIcon className="h-4 w-4" />
                              Undo
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTodo(todo._id)}
                              disabled={savingTodoId === todo._id}
                              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                            >
                              <TrashIcon className="h-4 w-4" />
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {!isMobile ? (
                        <button
                          type="button"
                          onClick={() => deleteTodo(todo._id)}
                          disabled={savingTodoId === todo._id}
                          className={`inline-flex shrink-0 items-center justify-center rounded-full border border-transparent text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 ${
                            isCompactDesktop ? 'h-9 w-9' : 'h-11 w-11'
                          }`}
                          aria-label={`Delete ${todo.title}`}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              }) : null}
              {completedTodos.length > 0 && shouldCollapseBought && !showBought ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-4 text-sm text-slate-500">
                  {completedTodos.length} bought item{completedTodos.length === 1 ? '' : 's'} hidden while you shop.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
