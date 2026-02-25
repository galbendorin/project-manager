import React, { useState, useMemo } from 'react';
import { getFinishDate, getCurrentDate, countBusinessDays, parseDateValue, formatDateDDMMMyy } from '../utils/helpers';
import { AI_REPORT_TRIGGER_PROMPT } from '../utils/aiReportExport';
import AiReportPanel from './AiReportPanel';
import AiSettingsModal from './AiSettingsModal';
import EmailDigestModal from './EmailDigestModal';

// Track which detail sections are expanded

const RAG_OPTIONS = ['Green', 'Amber', 'Red'];
const RAG_STYLES = {
  Green: { bg: 'bg-emerald-500', ring: 'ring-emerald-200', label: 'text-emerald-700', labelBg: 'bg-emerald-50' },
  Amber: { bg: 'bg-amber-500', ring: 'ring-amber-200', label: 'text-amber-700', labelBg: 'bg-amber-50' },
  Red: { bg: 'bg-rose-500', ring: 'ring-rose-200', label: 'text-rose-700', labelBg: 'bg-rose-50' }
};

// Date helpers
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
};

const isInRange = (dateStr, from, to) => {
  if (!dateStr) return false;
  // Handle both ISO timestamps and YYYY-MM-DD
  const d = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  return d >= from && d <= to;
};

const formatDateDisplay = (dateStr) => {
  if (!dateStr || dateStr === '—') return '—';
  return formatDateDDMMMyy(dateStr) || dateStr;
};

const getBusinessDayVariance = (baselineDate, actualDate) => {
  const bl = parseDateValue(baselineDate);
  const ac = parseDateValue(actualDate);
  if (!bl || !ac) return null;
  if (bl.getTime() === ac.getTime()) return 0;
  if (ac > bl) return countBusinessDays(bl, ac);
  return -countBusinessDays(ac, bl);
};

const PRESETS = [
  { label: 'Last 7 days', from: () => daysAgo(7), to: () => getCurrentDate() },
  { label: 'Last 14 days', from: () => daysAgo(14), to: () => getCurrentDate() },
  { label: 'Last 30 days', from: () => daysAgo(30), to: () => getCurrentDate() },
  { label: 'This month', from: () => startOfMonth(), to: () => getCurrentDate() },
];

const StatusReportView = ({
  tasks,
  baseline,
  registers,
  tracker,
  statusReport,
  onUpdateStatusReport,
  onExportAiReport,
  onGenerateAiReport,
  onGenerateEmailDigest,
  aiConfigured,
  onAiSettingsChange,
  projectName
}) => {
  // Date range state
  const [dateFrom, setDateFrom] = useState(daysAgo(14));
  const [dateTo, setDateTo] = useState(getCurrentDate());
  const [activePreset, setActivePreset] = useState('Last 14 days');
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [aiExporting, setAiExporting] = useState(false);
  const [showAiHelp, setShowAiHelp] = useState(false);
  const [copyPromptState, setCopyPromptState] = useState('Copy Prompt');
  const [showAiNotesModal, setShowAiNotesModal] = useState(false);
  const [aiUserNotes, setAiUserNotes] = useState('');
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [showEmailDigest, setShowEmailDigest] = useState(false);

  const handlePreset = (preset) => {
    setDateFrom(preset.from());
    setDateTo(preset.to());
    setActivePreset(preset.label);
  };

  const handleCustomFrom = (val) => {
    setDateFrom(val);
    setActivePreset('Custom');
  };

  const handleCustomTo = (val) => {
    setDateTo(val);
    setActivePreset('Custom');
  };

  // Calculate overall project completion
  const projectCompletion = useMemo(() => {
    if (!tasks || tasks.length === 0) return 0;
    const totalPct = tasks.reduce((sum, t) => sum + (t.pct || 0), 0);
    return Math.round(totalPct / tasks.length);
  }, [tasks]);

  // Task stats
  const taskStats = useMemo(() => {
    if (!tasks || tasks.length === 0) return { total: 0, completed: 0, inProgress: 0, notStarted: 0, milestones: 0 };
    return {
      total: tasks.length,
      completed: tasks.filter(t => t.pct === 100).length,
      inProgress: tasks.filter(t => t.pct > 0 && t.pct < 100).length,
      notStarted: tasks.filter(t => t.pct === 0).length,
      milestones: tasks.filter(t => t.type === 'Milestone').length
    };
  }, [tasks]);

  // ==================== PERIOD ACTIVITY (date-filtered) ====================

  const periodActivity = useMemo(() => {
    const result = {
      newTasks: [],
      updatedTasks: [],
      newRisks: [],
      updatedRisks: [],
      newIssues: [],
      updatedIssues: [],
      newActions: [],
      completedActions: [],
      newChanges: [],
      trackerUpdates: []
    };

    // Tasks created in period
    result.newTasks = (tasks || []).filter(t => isInRange(t.createdAt, dateFrom, dateTo));
    // Tasks updated in period (but not newly created — avoid duplicates)
    result.updatedTasks = (tasks || []).filter(t =>
      isInRange(t.updatedAt, dateFrom, dateTo) && !isInRange(t.createdAt, dateFrom, dateTo)
    );

    // Risks
    const risks = registers?.risks || [];
    result.newRisks = risks.filter(r => isInRange(r.createdAt, dateFrom, dateTo));
    result.updatedRisks = risks.filter(r =>
      isInRange(r.updatedAt, dateFrom, dateTo) && !isInRange(r.createdAt, dateFrom, dateTo)
    );

    // Issues
    const issues = registers?.issues || [];
    result.newIssues = issues.filter(i => isInRange(i.createdAt, dateFrom, dateTo));
    result.updatedIssues = issues.filter(i =>
      isInRange(i.updatedAt, dateFrom, dateTo) && !isInRange(i.createdAt, dateFrom, dateTo)
    );

    // Actions
    const actions = registers?.actions || [];
    result.newActions = actions.filter(a => isInRange(a.createdAt, dateFrom, dateTo));
    result.completedActions = actions.filter(a => {
      const status = (a.status || '').toLowerCase();
      return (status === 'completed' || status === 'closed') && isInRange(a.updatedAt, dateFrom, dateTo);
    });

    // Changes
    const changes = registers?.changes || [];
    result.newChanges = changes.filter(c => isInRange(c.createdAt, dateFrom, dateTo));

    // Tracker
    result.trackerUpdates = (tracker || []).filter(t => isInRange(t.updatedAt, dateFrom, dateTo));

    return result;
  }, [tasks, registers, tracker, dateFrom, dateTo]);

  // Total activity count
  const totalActivity = useMemo(() => {
    return periodActivity.newTasks.length + periodActivity.updatedTasks.length +
      periodActivity.newRisks.length + periodActivity.updatedRisks.length +
      periodActivity.newIssues.length + periodActivity.updatedIssues.length +
      periodActivity.newActions.length + periodActivity.completedActions.length +
      periodActivity.newChanges.length + periodActivity.trackerUpdates.length;
  }, [periodActivity]);

  // Milestone comparison (baseline vs actual)
  const milestoneComparison = useMemo(() => {
    const milestones = tasks.filter(t => t.type === 'Milestone');
    if (!milestones.length) return [];
    const baselineMap = baseline ? new Map(baseline.map(b => [b.id, b])) : new Map();
    return milestones.map(ms => {
      const bl = baselineMap.get(ms.id);
      const actualStart = ms.start;
      const actualFinish = getFinishDate(ms.start, ms.dur);
      const baselineStart = bl ? bl.start : '—';
      const baselineFinish = bl ? bl.finish || getFinishDate(bl.start, bl.dur) : '—';
      const varianceDays = bl ? getBusinessDayVariance(bl.start, actualStart) : null;
      return { id: ms.id, name: ms.name, baselineStart, baselineFinish, actualStart, actualFinish, varianceDays, pct: ms.pct };
    });
  }, [tasks, baseline]);

  // Top open risks
  const topRisks = useMemo(() => {
    if (!registers?.risks) return [];
    return registers.risks.filter(r => r.level && r.level.toString().toLowerCase() !== 'closed').slice(0, 5);
  }, [registers]);

  // Top open issues
  const topIssues = useMemo(() => {
    if (!registers?.issues) return [];
    return registers.issues.filter(i => {
      const status = (i.status || '').toLowerCase();
      return status !== 'closed' && status !== 'completed';
    }).slice(0, 5);
  }, [registers]);

  const ragStyle = RAG_STYLES[statusReport.overallRag] || RAG_STYLES.Green;
  const handleFieldChange = (key, value) => onUpdateStatusReport(key, value);

  const handleExportAiFile = async (notes = '') => {
    if (!onExportAiReport || aiExporting) return;
    setAiExporting(true);
    const result = await onExportAiReport({ dateFrom, dateTo, userNotes: notes });
    setAiExporting(false);
    if (result?.ok) {
      setShowAiHelp(true);
      setAiUserNotes('');
    }
  };

  const handleOpenAiNotesModal = () => {
    if (aiExporting) return;
    setShowAiNotesModal(true);
  };

  const handleCancelAiNotesModal = () => {
    if (aiExporting) return;
    setShowAiNotesModal(false);
    setAiUserNotes('');
  };

  const handleConfirmAiNotesModal = async () => {
    const notes = aiUserNotes.trim();
    setShowAiNotesModal(false);
    await handleExportAiFile(notes);
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_REPORT_TRIGGER_PROMPT);
      setCopyPromptState('Copied');
      setTimeout(() => setCopyPromptState('Copy Prompt'), 1600);
    } catch {
      setCopyPromptState('Copy failed');
      setTimeout(() => setCopyPromptState('Copy Prompt'), 1600);
    }
  };

  // Activity row component
  const ActivityRow = ({ label, newItems, updatedItems, icon, color }) => {
    const newCount = newItems?.length || 0;
    const updatedCount = updatedItems?.length || 0;
    if (newCount === 0 && updatedCount === 0) return null;
    return (
      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 text-[12px]">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="font-medium text-slate-700">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {newCount > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${color} bg-opacity-10`}>
              +{newCount} new
            </span>
          )}
          {updatedCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-500 bg-slate-200">
              {updatedCount} updated
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full bg-slate-50 p-6 overflow-auto">
      <div className="max-w-[1200px] mx-auto space-y-5">

        {/* Date Range Picker */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reporting Period</span>
              <div className="flex gap-1 ml-2">
                {PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => handlePreset(preset)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      activePreset === preset.label
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-slate-400 font-medium">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleCustomFrom(e.target.value)}
                className="text-[11px] border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-indigo-300"
              />
              <span className="text-[10px] text-slate-400 font-medium">To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => handleCustomTo(e.target.value)}
                className="text-[11px] border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-indigo-300"
              />
              <button
                onClick={handleOpenAiNotesModal}
                disabled={aiExporting}
                className={`text-[11px] font-medium px-2.5 py-1.5 rounded-md border transition-all ${
                  aiExporting
                    ? 'text-slate-300 border-slate-200 bg-slate-50 cursor-not-allowed'
                    : 'text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100'
                }`}
                title="Download one AI-ready Excel file for your company LLM workspace"
              >
                {aiExporting ? 'Preparing file...' : 'Download AI Report File'}
              </button>
              {aiConfigured && (
                <button
                  onClick={() => setShowEmailDigest(true)}
                  className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border transition-all text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                  title="Generate a concise status email for senior leadership"
                >
                  📧 Email Digest
                </button>
              )}
            </div>
          </div>
        </div>

        {showAiHelp && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-widest mb-2">AI Upload Steps</div>
                <div className="text-[12px] text-indigo-900 leading-relaxed">
                  1. Open your company-approved LLM workspace.
                  <br />
                  2. Upload the downloaded file.
                  <br />
                  3. If the tool asks for a prompt, paste the line below.
                </div>
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    readOnly
                    value={AI_REPORT_TRIGGER_PROMPT}
                    className="flex-1 min-w-0 bg-white border border-indigo-200 rounded-md px-3 py-2 text-[12px] text-indigo-900"
                  />
                  <button
                    onClick={handleCopyPrompt}
                    className="text-[11px] font-medium text-indigo-700 border border-indigo-200 bg-white hover:bg-indigo-100 px-2.5 py-1.5 rounded-md transition-all"
                  >
                    {copyPromptState}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowAiHelp(false)}
                className="text-[11px] font-medium text-indigo-500 hover:text-indigo-700"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {showAiNotesModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center px-4">
            <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl p-5">
              <div className="text-[12px] font-bold text-slate-700 uppercase tracking-widest mb-2">
                AI Export Notes (Optional)
              </div>
              <p className="text-[12px] text-slate-500 mb-3">
                Add short context for this report period. This note is included in the export file.
              </p>
              <textarea
                value={aiUserNotes}
                onChange={(e) => setAiUserNotes(e.target.value)}
                maxLength={600}
                placeholder="Example: Highlight vendor dependency risk and focus next period on UAT closure."
                className="w-full h-28 border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-700 outline-none focus:border-indigo-300 resize-none"
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">{aiUserNotes.length}/600</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancelAiNotesModal}
                    className="text-[11px] font-medium text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 rounded-md transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmAiNotesModal}
                    className="text-[11px] font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1.5 rounded-md transition-all"
                  >
                    Continue Download
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Report Generator Panel */}
        <AiReportPanel
          isConfigured={aiConfigured}
          onOpenSettings={() => setShowAiSettings(true)}
          onGenerate={onGenerateAiReport}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />

        {showAiSettings && (
          <AiSettingsModal
            onClose={() => setShowAiSettings(false)}
            onSettingsChange={onAiSettingsChange}
          />
        )}

        {showEmailDigest && (
          <EmailDigestModal
            onClose={() => setShowEmailDigest(false)}
            onGenerate={onGenerateEmailDigest}
            projectName={projectName}
          />
        )}

        {/* Header Row: RAG + Completion + Task Stats */}
        <div className="grid grid-cols-12 gap-4">
          {/* Overall RAG */}
          <div className="col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col items-center justify-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Overall Status</div>
            <div className={`w-20 h-20 rounded-full ${ragStyle.bg} ring-4 ${ragStyle.ring} flex items-center justify-center mb-3 shadow-lg`}>
              <span className="text-white font-black text-lg">{statusReport.overallRag}</span>
            </div>
            <div className="flex gap-1.5 mt-1">
              {RAG_OPTIONS.map(rag => (
                <button
                  key={rag}
                  onClick={() => handleFieldChange('overallRag', rag)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    statusReport.overallRag === rag
                      ? `${RAG_STYLES[rag].bg} border-slate-800 scale-110`
                      : `${RAG_STYLES[rag].bg} border-transparent opacity-40 hover:opacity-70`
                  }`}
                  title={rag}
                />
              ))}
            </div>
          </div>

          {/* Project Completion */}
          <div className="col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col items-center justify-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Project Completion</div>
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" stroke="#e2e8f0" strokeWidth="8" fill="none" />
                <circle cx="50" cy="50" r="42"
                  stroke={projectCompletion === 100 ? '#10b981' : '#6366f1'}
                  strokeWidth="8" fill="none" strokeLinecap="round"
                  strokeDasharray={`${projectCompletion * 2.64} ${264 - projectCompletion * 2.64}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-black text-slate-800">{projectCompletion}%</span>
              </div>
            </div>
          </div>

          {/* Task Stats */}
          <div className="col-span-6 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Task Summary</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-[11px] text-slate-500">Total Tasks</span>
                <span className="text-lg font-black text-slate-800">{taskStats.total}</span>
              </div>
              <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2">
                <span className="text-[11px] text-emerald-600">Completed</span>
                <span className="text-lg font-black text-emerald-700">{taskStats.completed}</span>
              </div>
              <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                <span className="text-[11px] text-blue-600">In Progress</span>
                <span className="text-lg font-black text-blue-700">{taskStats.inProgress}</span>
              </div>
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-[11px] text-slate-500">Not Started</span>
                <span className="text-lg font-black text-slate-600">{taskStats.notStarted}</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-grow h-2.5 bg-slate-200 rounded-full overflow-hidden flex">
                <div className="bg-emerald-500 h-full" style={{ width: `${taskStats.total ? (taskStats.completed / taskStats.total) * 100 : 0}%` }} />
                <div className="bg-blue-500 h-full" style={{ width: `${taskStats.total ? (taskStats.inProgress / taskStats.total) * 100 : 0}%` }} />
              </div>
              <span className="text-[10px] text-slate-400 flex-shrink-0">{taskStats.milestones} milestones</span>
            </div>
          </div>
        </div>

        {/* Period Activity Summary */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Period Activity — {formatDateDisplay(dateFrom)} to {formatDateDisplay(dateTo)}
            </label>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              totalActivity > 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'
            }`}>
              {totalActivity} total changes
            </span>
          </div>

          {totalActivity > 0 ? (
            <div className="space-y-1.5">
              <ActivityRow label="Tasks" icon="📋" color="text-indigo-600" newItems={periodActivity.newTasks} updatedItems={periodActivity.updatedTasks} />
              <ActivityRow label="Risks" icon="⚠️" color="text-amber-600" newItems={periodActivity.newRisks} updatedItems={periodActivity.updatedRisks} />
              <ActivityRow label="Issues" icon="🔴" color="text-rose-600" newItems={periodActivity.newIssues} updatedItems={periodActivity.updatedIssues} />
              <ActivityRow label="Actions" icon="✅" color="text-emerald-600" newItems={periodActivity.newActions} updatedItems={periodActivity.completedActions} />
              <ActivityRow label="Changes" icon="🔄" color="text-blue-600" newItems={periodActivity.newChanges} updatedItems={[]} />
              <ActivityRow label="Tracker Items" icon="📌" color="text-purple-600" newItems={[]} updatedItems={periodActivity.trackerUpdates} />
            </div>
          ) : (
            <div className="text-center py-6 text-slate-300 text-sm">
              No activity recorded in this period
            </div>
          )}
        </div>

        {/* Narrative Section */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Overall Status Narrative</label>
            <textarea
              value={statusReport.overallNarrative}
              onChange={(e) => handleFieldChange('overallNarrative', e.target.value)}
              placeholder="Describe the current project status, key achievements, and concerns..."
              className="w-full h-28 border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-indigo-300 resize-none transition-colors"
            />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Additional Notes</label>
            <textarea
              value={statusReport.additionalNotes}
              onChange={(e) => handleFieldChange('additionalNotes', e.target.value)}
              placeholder="Any other notes, escalations, or decisions needed..."
              className="w-full h-28 border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-indigo-300 resize-none transition-colors"
            />
          </div>
        </div>

        {/* Deliverables Section */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Key Deliverables This Period</label>
            <textarea
              value={statusReport.deliverablesThisPeriod}
              onChange={(e) => handleFieldChange('deliverablesThisPeriod', e.target.value)}
              placeholder="What was delivered or achieved this reporting period..."
              className="w-full h-24 border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-indigo-300 resize-none transition-colors"
            />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Key Deliverables Next Period</label>
            <textarea
              value={statusReport.deliverablesNextPeriod}
              onChange={(e) => handleFieldChange('deliverablesNextPeriod', e.target.value)}
              placeholder="Planned deliverables and milestones for next period..."
              className="w-full h-24 border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-indigo-300 resize-none transition-colors"
            />
          </div>
        </div>

        {/* Risks & Issues */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Main Risks</label>
              {topRisks.length > 0 && (
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{topRisks.length} open</span>
              )}
            </div>
            {topRisks.length > 0 && (
              <div className="space-y-2 mb-3">
                {topRisks.map((risk, i) => (
                  <div key={risk._id || i} className="flex items-start gap-2 text-[11px] bg-slate-50 rounded-lg px-3 py-2">
                    <span className="text-amber-500 font-bold flex-shrink-0">R{risk.number}</span>
                    <span className="text-slate-600 flex-grow">{risk.riskdetails || risk.description || '—'}</span>
                    {risk.level && (
                      <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        risk.level.toLowerCase() === 'high' ? 'bg-rose-100 text-rose-600' :
                        risk.level.toLowerCase() === 'medium' ? 'bg-amber-100 text-amber-600' :
                        'bg-emerald-100 text-emerald-600'
                      }`}>{risk.level}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <textarea
              value={statusReport.mainRisks}
              onChange={(e) => handleFieldChange('mainRisks', e.target.value)}
              placeholder="Additional risk commentary..."
              className="w-full h-16 border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-indigo-300 resize-none transition-colors"
            />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Main Issues</label>
              {topIssues.length > 0 && (
                <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">{topIssues.length} open</span>
              )}
            </div>
            {topIssues.length > 0 && (
              <div className="space-y-2 mb-3">
                {topIssues.map((issue, i) => (
                  <div key={issue._id || i} className="flex items-start gap-2 text-[11px] bg-slate-50 rounded-lg px-3 py-2">
                    <span className="text-rose-500 font-bold flex-shrink-0">I{issue.number}</span>
                    <span className="text-slate-600 flex-grow">{issue.description || '—'}</span>
                    {issue.status && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500">{issue.status}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <textarea
              value={statusReport.mainIssues}
              onChange={(e) => handleFieldChange('mainIssues', e.target.value)}
              placeholder="Additional issue commentary..."
              className="w-full h-16 border border-slate-200 rounded-lg px-3 py-2 text-[12.5px] text-slate-700 outline-none focus:border-indigo-300 resize-none transition-colors"
            />
          </div>
        </div>

        {/* Milestone Comparison Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Milestone Comparison — Baseline vs Actual</label>
          {milestoneComparison.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                  <tr>
                    <th className="px-4 py-3 border-b">Milestone</th>
                    <th className="px-4 py-3 border-b text-center">Baseline Start</th>
                    <th className="px-4 py-3 border-b text-center">Baseline Finish</th>
                    <th className="px-4 py-3 border-b text-center">Actual Start</th>
                    <th className="px-4 py-3 border-b text-center">Actual Finish</th>
                    <th className="px-4 py-3 border-b text-center">Variance (Days)</th>
                    <th className="px-4 py-3 border-b text-center">Progress</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {milestoneComparison.map(ms => (
                    <tr key={ms.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700 text-[12px]">
                        <span className="text-amber-500 mr-1.5">◆</span>{ms.name}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-[11px] text-slate-400">{formatDateDisplay(ms.baselineStart)}</td>
                      <td className="px-4 py-3 text-center font-mono text-[11px] text-slate-400">{formatDateDisplay(ms.baselineFinish)}</td>
                      <td className="px-4 py-3 text-center font-mono text-[11px] text-slate-600">{formatDateDisplay(ms.actualStart)}</td>
                      <td className="px-4 py-3 text-center font-mono text-[11px] text-slate-600">{formatDateDisplay(ms.actualFinish)}</td>
                      <td className="px-4 py-3 text-center">
                        {ms.varianceDays !== null ? (
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                            ms.varianceDays === 0 ? 'text-emerald-600 bg-emerald-50' :
                            ms.varianceDays > 0 ? 'text-rose-600 bg-rose-50' : 'text-blue-600 bg-blue-50'
                          }`}>
                            {ms.varianceDays === 0 ? 'On Track' : ms.varianceDays > 0 ? `+${ms.varianceDays}d late` : `${ms.varianceDays}d early`}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300">No baseline</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[11px] font-bold ${ms.pct === 100 ? 'text-emerald-600' : 'text-slate-400'}`}>{ms.pct}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-300 text-sm">
              No milestones in the Project Plan. Add milestone tasks to see the comparison table.
            </div>
          )}
          {!baseline && milestoneComparison.length > 0 && (
            <div className="mt-3 text-center text-[11px] text-amber-500 bg-amber-50 rounded-lg py-2">
              Set a baseline in the Project Plan tab to enable variance tracking
            </div>
          )}
        </div>

        {/* Collapsible Period Detail — at bottom */}
        {totalActivity > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <button
              onClick={() => setDetailsExpanded(!detailsExpanded)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-xl"
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-slate-400 text-[12px] transition-transform"
                  style={{ display: 'inline-block', transform: detailsExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  ▶
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Period Detail — {formatDateDisplay(dateFrom)} to {formatDateDisplay(dateTo)}
                </span>
              </div>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                {totalActivity} items
              </span>
            </button>

            {detailsExpanded && (
              <div className="px-5 pb-5 space-y-4">
                {periodActivity.newTasks.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">New Tasks This Period</div>
                    {periodActivity.newTasks.map(t => (
                      <div key={t.id} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-indigo-300">
                        {t.name} <span className="text-slate-300 ml-1">({t.pct}%)</span>
                      </div>
                    ))}
                  </div>
                )}
                {periodActivity.updatedTasks.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Updated Tasks This Period</div>
                    {periodActivity.updatedTasks.map(t => (
                      <div key={t.id} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-slate-300">
                        {t.name} <span className="text-slate-300 ml-1">({t.pct}%)</span>
                      </div>
                    ))}
                  </div>
                )}
                {periodActivity.newRisks.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">New Risks This Period</div>
                    {periodActivity.newRisks.map((r, i) => (
                      <div key={r._id || i} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-amber-300">
                        R{r.number}: {r.riskdetails || r.description || '—'}
                      </div>
                    ))}
                  </div>
                )}
                {periodActivity.updatedRisks.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Updated Risks This Period</div>
                    {periodActivity.updatedRisks.map((r, i) => (
                      <div key={r._id || i} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-amber-200">
                        R{r.number}: {r.riskdetails || r.description || '—'}
                      </div>
                    ))}
                  </div>
                )}
                {periodActivity.newIssues.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">New Issues This Period</div>
                    {periodActivity.newIssues.map((item, idx) => (
                      <div key={item._id || idx} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-rose-300">
                        I{item.number}: {item.description || '—'}
                      </div>
                    ))}
                  </div>
                )}
                {periodActivity.updatedIssues.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Updated Issues This Period</div>
                    {periodActivity.updatedIssues.map((item, idx) => (
                      <div key={item._id || idx} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-rose-200">
                        I{item.number}: {item.description || '—'}
                      </div>
                    ))}
                  </div>
                )}
                {periodActivity.newActions.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">New Actions This Period</div>
                    {periodActivity.newActions.map((a, i) => (
                      <div key={a._id || i} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-emerald-300">
                        A{a.number}: {a.description || '—'}
                      </div>
                    ))}
                  </div>
                )}
                {periodActivity.completedActions.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Actions Completed This Period</div>
                    {periodActivity.completedActions.map((a, i) => (
                      <div key={a._id || i} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-emerald-200">
                        A{a.number}: {a.description || '—'}
                      </div>
                    ))}
                  </div>
                )}
                {periodActivity.newChanges.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">New Changes This Period</div>
                    {periodActivity.newChanges.map((c, i) => (
                      <div key={c._id || i} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-blue-300">
                        C{c.number}: {c.description || '—'}
                      </div>
                    ))}
                  </div>
                )}
                {periodActivity.trackerUpdates.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Tracker Items Updated This Period</div>
                    {periodActivity.trackerUpdates.map((t, i) => (
                      <div key={t._id || i} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-purple-300">
                        {t.taskName} — <span className="text-slate-400">{t.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default React.memo(StatusReportView);
