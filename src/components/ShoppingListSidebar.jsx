import React from 'react';

export default function ShoppingListSidebar({
  canShareProject,
  describeShoppingProject,
  handleDisablePushAlerts,
  handleEnablePushAlerts,
  handleTestPushAlert,
  onOpenShare,
  projectError,
  projects,
  pushBusy,
  pushEnabled,
  pushMessage,
  pushPermission,
  pushSupported,
  selectedProject,
  selectedProjectId,
  setSelectedProjectId,
  shoppingProjectName,
  ShareIcon,
  ShoppingBasketIcon,
}) {
  return (
    <aside className="order-2 lg:order-1 lg:sticky lg:top-6 lg:self-start">
      <div className="pm-workspace-panel rounded-[30px] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="pm-kicker">Mini tool</p>
            <div className="mt-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/80 bg-white/80 text-[var(--pm-accent)] shadow-sm">
              <ShoppingBasketIcon className="h-5 w-5" />
            </div>
            <h1 className="mt-4 text-[1.55rem] font-bold tracking-[-0.04em] text-slate-950">Shopping List</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Keep one simple grocery list shared with your household, then add items by typing or voice.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <div className="pm-metric-card rounded-2xl px-4 py-3">
            <div className="pm-kicker">Current list</div>
            {projects.length > 1 ? (
              <label className="mt-2 block">
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="pm-input w-full rounded-2xl px-3 py-2.5 text-sm text-slate-900"
                >
                  {projects.map((project, index) => (
                    <option key={project.id} value={project.id}>
                      {describeShoppingProject(project, index)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <div className="mt-1 text-lg font-semibold text-slate-950">{selectedProject?.name || shoppingProjectName}</div>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedProject?.isOwned ? 'Owned by you' : 'Shared with you'}
                </p>
              </>
            )}
          </div>

          <div className="pm-metric-card rounded-2xl px-4 py-3">
            <div className="pm-kicker">Collaboration</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-lg font-semibold text-slate-950">
                {selectedProject?.project_members?.length ? 'Shared' : 'Private'}
              </span>
              <span className="text-xs text-slate-500">
                {selectedProject?.project_members?.length ? 'shared access enabled' : 'ready to share'}
              </span>
            </div>
            {canShareProject ? (
              <button
                type="button"
                onClick={onOpenShare}
                className="pm-toolbar-primary mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition"
              >
                <ShareIcon className="h-3.5 w-3.5" />
                Share with household
              </button>
            ) : null}
          </div>

          <div className="pm-metric-card rounded-2xl px-4 py-3">
            <div className="pm-kicker">Phone alerts</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-lg font-semibold text-slate-950">
                {!pushSupported ? 'Unavailable' : pushEnabled ? 'Enabled' : pushPermission === 'denied' ? 'Blocked' : 'Off'}
              </span>
              <span className="text-xs text-slate-500">
                {!pushSupported
                  ? 'browser support missing'
                  : pushEnabled
                    ? 'background alerts ready'
                    : pushPermission === 'denied'
                      ? 'allow notifications in settings'
                      : 'turn on for this device'}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Alerts are per device. They notify the other household members when you add groceries, and the test button checks this device directly.
            </p>
            {pushMessage ? (
              <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                {pushMessage}
              </div>
            ) : null}
            {!pushSupported ? null : pushEnabled ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleTestPushAlert}
                  disabled={pushBusy}
                  className="pm-toolbar-primary inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pushBusy ? 'Sending…' : 'Send test alert'}
                </button>
                <button
                  type="button"
                  onClick={handleDisablePushAlerts}
                  disabled={pushBusy}
                  className="pm-subtle-button inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pushBusy ? 'Updating…' : 'Turn off alerts'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleEnablePushAlerts}
                disabled={pushBusy || pushPermission === 'denied'}
                className="pm-subtle-button mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pushBusy ? 'Updating…' : 'Enable phone alerts'}
              </button>
            )}
          </div>
        </div>

        <div className="pm-utility-card mt-5 rounded-[24px] p-4">
          <p className="pm-kicker">Quick notes</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">Voice add</span>
            <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">Shared groceries</span>
            <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">Simple check-off</span>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Voice works best with short phrases like “milk, eggs, bananas”.
          </p>
        </div>

        {projectError ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {projectError}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
