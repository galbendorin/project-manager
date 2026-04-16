import React from 'react';

export default function ShoppingListPageHeader({
  selectedProject,
  shoppingProjectName,
  sparklesIcon: SparklesIcon,
}) {
  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="pm-kicker">Groceries</p>
          <h2 className="mt-2 text-xl font-bold tracking-[-0.04em] text-slate-950 sm:text-3xl">Add what you need</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {selectedProject?.name || shoppingProjectName} stays quick to scan, easy to share, and fast to tick off together.
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
