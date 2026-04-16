import React, { useState } from 'react';

export default function ShoppingListMobileControls({
  canShareProject,
  describeShoppingProject,
  handleDisablePushAlerts,
  handleEnablePushAlerts,
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
}) {
  const [isOpen, setIsOpen] = useState(false);

  const sharingLabel = selectedProject?.project_members?.length ? 'Shared' : 'Private';
  const alertsLabel = !pushSupported ? 'Unavailable' : pushEnabled ? 'On' : pushPermission === 'denied' ? 'Blocked' : 'Off';

  return (
    <div className="mb-4 rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm lg:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="pm-kicker">List setup</p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-slate-950">
            {selectedProject?.name || shoppingProjectName}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {sharingLabel}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              Alerts {alertsLabel}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((previous) => !previous)}
          className="pm-subtle-button shrink-0 rounded-full px-3 py-2 text-xs font-semibold"
        >
          {isOpen ? 'Hide options' : 'List options'}
        </button>
      </div>

      {isOpen ? (
        <div className="mt-4 space-y-3">
          {projects.length > 1 ? (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current list</span>
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className="pm-input mt-2 w-full rounded-2xl px-3 py-3 text-sm text-slate-900"
              >
                {projects.map((project, index) => (
                  <option key={project.id} value={project.id}>
                    {describeShoppingProject(project, index)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {canShareProject ? (
              <button
                type="button"
                onClick={onOpenShare}
                className="pm-subtle-button rounded-2xl px-4 py-3 text-sm font-semibold"
              >
                Share with household
              </button>
            ) : null}

            {!pushSupported ? null : pushEnabled ? (
              <button
                type="button"
                onClick={handleDisablePushAlerts}
                disabled={pushBusy}
                className="pm-subtle-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pushBusy ? 'Updating…' : 'Turn off alerts'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEnablePushAlerts}
                disabled={pushBusy || pushPermission === 'denied'}
                className="pm-subtle-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pushBusy ? 'Updating…' : 'Enable phone alerts'}
              </button>
            )}
          </div>

          <p className="text-xs leading-5 text-slate-500">
            Keep the list surface simple while you shop. Sharing and phone alerts live here when you need them.
          </p>

          {pushMessage ? (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              {pushMessage}
            </div>
          ) : null}

          {projectError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {projectError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
