import React from 'react';

export default function ShoppingListPageHeader({
  canShareProject,
  onOpenShare,
  selectedProject,
  shoppingProjectName,
  sparklesIcon: SparklesIcon,
}) {
  return (
    <>
      <div className="mb-4 rounded-[24px] border border-slate-200 bg-white/80 px-4 py-4 shadow-sm lg:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="pm-kicker">Current list</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
              {selectedProject?.name || shoppingProjectName}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {selectedProject?.project_members?.length ? 'Shared with team' : 'Private for now'}
            </p>
          </div>
          {canShareProject ? (
            <button
              type="button"
              onClick={onOpenShare}
              className="pm-subtle-button shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition"
            >
              Share
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="pm-kicker">Groceries</p>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950 sm:text-3xl">Add what you need</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Keep groceries easy to scan, easy to share, and fast to tick off together.
          </p>
        </div>
        <div className="hidden items-center gap-2 text-xs text-slate-500 md:flex">
          <SparklesIcon className="h-3.5 w-3.5 text-[var(--pm-accent)]" />
          Shared project access powers this list.
        </div>
      </div>
    </>
  );
}
