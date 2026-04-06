import React from 'react';

export default function ShoppingListInfoPanels({
  selectedProject,
}) {
  return (
    <div className="space-y-4">
      <div className="pm-surface-soft rounded-[28px] p-5">
        <p className="pm-kicker">How sharing works</p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">One shared grocery list</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Share this Shopping List project once, then both people can add groceries and tick them off from the same list.
        </p>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          {selectedProject?.isOwned
            ? 'Use the collaboration card on the left to invite your household into this shared list.'
            : 'You are currently viewing a shared shopping list.'}
        </div>
      </div>
    </div>
  );
}
