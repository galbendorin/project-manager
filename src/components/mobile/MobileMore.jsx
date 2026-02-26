import React from 'react';

const MenuItem = ({ icon, label, sublabel, onClick, danger }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 active:bg-slate-50 transition-colors text-left ${danger ? '' : ''}`}
  >
    <span className="text-lg w-7 text-center">{icon}</span>
    <div className="flex-1 min-w-0">
      <div className={`text-sm font-semibold ${danger ? 'text-rose-600' : 'text-slate-800'}`}>{label}</div>
      {sublabel && <div className="text-[10px] text-slate-400">{sublabel}</div>}
    </div>
    <span className="text-slate-300 text-sm">›</span>
  </button>
);

const MobileMore = ({
  onNavigateToTracker,
  onExport,
  onImport,
  onLoadTemplate,
  onResetDemoData,
  onSetBaseline,
  onClearBaseline,
  hasBaseline,
  onShowDemoBenefits,
  onBackToProjects,
  isDemoProject,
  onOpenAiSettings,
}) => {
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50">
      {/* Section: Views */}
      <div className="px-4 pt-4 pb-1">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Views</h3>
      </div>
      <div className="bg-white rounded-xl mx-3 mb-3 border border-slate-100 overflow-hidden">
        <MenuItem icon="📊" label="Master Tracker" sublabel="Tracked items dashboard" onClick={onNavigateToTracker} />
        <MenuItem icon="📋" label="Status Report" sublabel="Project status overview" onClick={() => onNavigateToTracker('statusreport')} />
      </div>

      {/* Section: Data */}
      <div className="px-4 pb-1">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data</h3>
      </div>
      <div className="bg-white rounded-xl mx-3 mb-3 border border-slate-100 overflow-hidden">
        <MenuItem icon="📤" label="Export" sublabel="Download project as XLSX" onClick={onExport} />
        <MenuItem icon="📥" label="Import" sublabel="Import from XLSX file" onClick={onImport} />
        {hasBaseline ? (
          <MenuItem icon="📏" label="Clear Baseline" sublabel="Remove saved baseline" onClick={onClearBaseline} />
        ) : (
          <MenuItem icon="📏" label="Set Baseline" sublabel="Snapshot current schedule" onClick={onSetBaseline} />
        )}
      </div>

      {/* Section: Demo & AI */}
      <div className="px-4 pb-1">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tools</h3>
      </div>
      <div className="bg-white rounded-xl mx-3 mb-3 border border-slate-100 overflow-hidden">
        <MenuItem icon="🤖" label="AI Settings" sublabel="Configure AI assistant" onClick={onOpenAiSettings} />
        {isDemoProject && (
          <>
            <MenuItem icon="📦" label="Load Demo Data" sublabel="Fill all tabs with sample content" onClick={onLoadTemplate} />
            <MenuItem icon="💡" label="How It Works" sublabel="Feature walkthrough" onClick={onShowDemoBenefits} />
          </>
        )}
      </div>

      {/* Section: Account */}
      <div className="px-4 pb-1">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account</h3>
      </div>
      <div className="bg-white rounded-xl mx-3 mb-4 border border-slate-100 overflow-hidden">
        <MenuItem icon="🔀" label="Switch Project" sublabel="Go back to project list" onClick={onBackToProjects} />
        {isDemoProject && (
          <MenuItem icon="🗑️" label="Reset Demo Data" sublabel="Clear all demo content" onClick={onResetDemoData} danger />
        )}
      </div>

      <div className="h-8" />
    </div>
  );
};

export default React.memo(MobileMore);
