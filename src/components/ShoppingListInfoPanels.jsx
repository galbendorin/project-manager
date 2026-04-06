import React from 'react';

export default function ShoppingListInfoPanels({
  canShareProject,
  onOpenShare,
  selectedProject,
  shareIcon: ShareIcon,
  voiceIcon: VoiceIcon,
  voiceSupported,
}) {
  return (
    <div className="space-y-4">
      <div className="pm-surface-soft rounded-[28px] p-5">
        <p className="pm-kicker">How sharing works</p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">One shared grocery list</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Share this Shopping List project once, then both people can add groceries and tick them off from the same list.
        </p>
        {canShareProject ? (
          <button
            type="button"
            onClick={onOpenShare}
            className="pm-toolbar-primary mt-4 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition"
          >
            <ShareIcon className="h-4 w-4" />
            Share with household
          </button>
        ) : (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            {selectedProject?.isOwned
              ? 'Sharing is unavailable until project members are enabled.'
              : 'You are currently viewing a shared shopping list.'}
          </div>
        )}
      </div>

      <div className="pm-surface-soft rounded-[28px] p-5">
        <p className="pm-kicker">Voice add</p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Quick groceries</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Use the voice button for short bursts like “apples, pasta, olive oil” and the list will add them as separate items.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
          <VoiceIcon className="h-3.5 w-3.5 text-[var(--pm-accent)]" />
          {voiceSupported ? 'Speech recognition available here' : 'Speech recognition not available in this browser'}
        </div>
      </div>
    </div>
  );
}
