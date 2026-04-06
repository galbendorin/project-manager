import React from 'react';

export default function WorkspaceProjectStatusBar({
  handleOpenFeedback,
  importStatus,
  isAdmin,
  isOnline,
  lastSaved,
  onBackToProjects,
  pendingProjectSyncCount,
  projectName,
  reloadProject,
  remoteUpdateAvailable,
  retryProjectSync,
  saveConflict,
  saveError,
  saving,
  simulatedPlan,
  simulatorOptions,
  usingOfflineSnapshot,
  setSimulatedPlan,
}) {
  return (
    <div className="bg-gray-800 border-b border-gray-700 px-3 sm:px-4 py-1.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-1.5 text-xs">
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-2.5 gap-y-1 min-w-0">
        <button
          onClick={onBackToProjects}
          className="text-gray-400 hover:text-white transition-colors flex items-center gap-1"
        >
          ← Projects
        </button>
        <span className="hidden sm:inline text-gray-600">|</span>
        <span className="text-white font-medium truncate">{projectName}</span>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mb-1 lg:flex-wrap">
        {isAdmin && simulatorOptions.length > 0 && (
          <select
            value={simulatedPlan || ''}
            onChange={(e) => setSimulatedPlan(e.target.value || null)}
            className="shrink-0 text-[11px] px-1.5 py-0.5 bg-purple-900/60 border border-purple-500/50 text-purple-200 rounded cursor-pointer"
            title="Plan Simulator (admin only)"
          >
            {simulatorOptions.map((opt) => (
              <option key={opt.value || 'real'} value={opt.value || ''}>{opt.label}</option>
            ))}
          </select>
        )}
        {simulatedPlan && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-purple-600 text-white rounded-full font-medium animate-pulse">
            SIM: {simulatorOptions.find((o) => o.value === simulatedPlan)?.label}
          </span>
        )}
        <button
          onClick={handleOpenFeedback}
          className="shrink-0 text-xs px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
          title="Report a bug, request an improvement, or send feedback by email"
        >
          Send Feedback
        </button>
        {importStatus ? (
          <span className={`shrink-0 flex items-center gap-1 ${importStatus.startsWith('✓') ? 'text-emerald-400' : importStatus === 'Importing...' || importStatus === 'Exporting...' || importStatus === 'Exporting AI report...' ? 'text-blue-400' : 'text-amber-400'}`}>
            {importStatus}
          </span>
        ) : pendingProjectSyncCount > 0 && !isOnline ? (
          <span className="shrink-0 text-amber-300 whitespace-nowrap">
            {pendingProjectSyncCount} project change{pendingProjectSyncCount === 1 ? '' : 's'} queued
          </span>
        ) : saveConflict ? (
          <div className="shrink-0 flex items-center gap-2">
            <span className="text-rose-400 whitespace-nowrap">Save conflict detected</span>
            <button
              onClick={reloadProject}
              className="px-2 py-1 text-[11px] bg-rose-600 hover:bg-rose-700 text-white rounded transition-colors"
              title="Reload server version to resolve conflict"
            >
              Reload Latest
            </button>
          </div>
        ) : remoteUpdateAvailable ? (
          <div className="shrink-0 flex items-center gap-2">
            <span className="text-amber-400 whitespace-nowrap">Remote changes available</span>
            <button
              onClick={reloadProject}
              className="px-2 py-1 text-[11px] bg-amber-500 hover:bg-amber-600 text-slate-950 rounded transition-colors"
              title="Reload the latest server version before making more edits"
            >
              Reload Latest
            </button>
          </div>
        ) : pendingProjectSyncCount > 0 && isOnline && !saving && !saveError ? (
          <div className="shrink-0 flex items-center gap-2">
            <span className="text-sky-300 whitespace-nowrap">
              {pendingProjectSyncCount} project change{pendingProjectSyncCount === 1 ? '' : 's'} ready to sync
            </span>
            <button
              onClick={retryProjectSync}
              className="px-2 py-1 text-[11px] bg-sky-500 hover:bg-sky-600 text-slate-950 rounded transition-colors"
              title="Push the queued project changes now"
            >
              Retry sync
            </button>
          </div>
        ) : saveError && pendingProjectSyncCount > 0 ? (
          <div className="shrink-0 flex items-center gap-2">
            <span className="text-rose-400 whitespace-nowrap" title={saveError}>Project sync failed</span>
            {!saveConflict ? (
              <button
                onClick={retryProjectSync}
                className="px-2 py-1 text-[11px] bg-rose-600 hover:bg-rose-700 text-white rounded transition-colors"
                title="Retry syncing your queued project changes"
              >
                Retry sync
              </button>
            ) : null}
          </div>
        ) : saveError ? (
          <span className="shrink-0 text-rose-400 whitespace-nowrap" title={saveError}>Save failed</span>
        ) : !isOnline && usingOfflineSnapshot ? (
          <span className="shrink-0 text-amber-300 whitespace-nowrap">Offline snapshot loaded</span>
        ) : saving ? (
          <span className="shrink-0 text-yellow-400 flex items-center gap-1 whitespace-nowrap">
            <span className="animate-pulse">●</span> Saving...
          </span>
        ) : lastSaved ? (
          <span className="shrink-0 text-green-400 flex items-center gap-1 whitespace-nowrap">
            ✓ Saved {lastSaved.toLocaleTimeString()}
          </span>
        ) : (
          <span className="shrink-0 text-gray-500 whitespace-nowrap">Ready</span>
        )}
      </div>
    </div>
  );
}
