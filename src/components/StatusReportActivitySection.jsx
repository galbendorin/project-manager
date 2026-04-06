import React from 'react';

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

const StatusReportActivitySection = ({
  dateFromLabel,
  dateToLabel,
  detailsExpanded,
  hideRegisterSignals,
  onToggleDetails,
  periodActivity,
  totalActivity,
}) => {
  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Period Activity — {dateFromLabel} to {dateToLabel}
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
            {!hideRegisterSignals && (
              <ActivityRow label="Risks" icon="⚠️" color="text-amber-600" newItems={periodActivity.newRisks} updatedItems={periodActivity.updatedRisks} />
            )}
            {!hideRegisterSignals && (
              <ActivityRow label="Issues" icon="🔴" color="text-rose-600" newItems={periodActivity.newIssues} updatedItems={periodActivity.updatedIssues} />
            )}
            {!hideRegisterSignals && (
              <ActivityRow label="Actions" icon="✅" color="text-emerald-600" newItems={periodActivity.newActions} updatedItems={periodActivity.completedActions} />
            )}
            {!hideRegisterSignals && (
              <ActivityRow label="Changes" icon="🔄" color="text-blue-600" newItems={periodActivity.newChanges} updatedItems={[]} />
            )}
            <ActivityRow label="Tracker Items" icon="📌" color="text-purple-600" newItems={[]} updatedItems={periodActivity.trackerUpdates} />
          </div>
        ) : (
          <div className="text-center py-6 text-slate-300 text-sm">
            No activity recorded in this period
          </div>
        )}
      </div>

      {totalActivity > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <button
            onClick={onToggleDetails}
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
                Period Detail — {dateFromLabel} to {dateToLabel}
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
              {!hideRegisterSignals && periodActivity.newRisks.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">New Risks This Period</div>
                  {periodActivity.newRisks.map((r, i) => (
                    <div key={r._id || i} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-amber-300">
                      R{r.number}: {r.riskdetails || r.description || '—'}
                    </div>
                  ))}
                </div>
              )}
              {!hideRegisterSignals && periodActivity.updatedRisks.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Updated Risks This Period</div>
                  {periodActivity.updatedRisks.map((r, i) => (
                    <div key={r._id || i} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-amber-200">
                      R{r.number}: {r.riskdetails || r.description || '—'}
                    </div>
                  ))}
                </div>
              )}
              {!hideRegisterSignals && periodActivity.newIssues.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">New Issues This Period</div>
                  {periodActivity.newIssues.map((item, idx) => (
                    <div key={item._id || idx} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-rose-300">
                      I{item.number}: {item.description || '—'}
                    </div>
                  ))}
                </div>
              )}
              {!hideRegisterSignals && periodActivity.updatedIssues.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Updated Issues This Period</div>
                  {periodActivity.updatedIssues.map((item, idx) => (
                    <div key={item._id || idx} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-rose-200">
                      I{item.number}: {item.description || '—'}
                    </div>
                  ))}
                </div>
              )}
              {!hideRegisterSignals && periodActivity.newActions.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">New Actions This Period</div>
                  {periodActivity.newActions.map((a, i) => (
                    <div key={a._id || i} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-emerald-300">
                      A{a.number}: {a.description || '—'}
                    </div>
                  ))}
                </div>
              )}
              {!hideRegisterSignals && periodActivity.completedActions.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Actions Completed This Period</div>
                  {periodActivity.completedActions.map((a, i) => (
                    <div key={a._id || i} className="text-[11px] text-slate-600 py-0.5 pl-3 border-l-2 border-emerald-200">
                      A{a.number}: {a.description || '—'}
                    </div>
                  ))}
                </div>
              )}
              {!hideRegisterSignals && periodActivity.newChanges.length > 0 && (
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
    </>
  );
};

export default React.memo(StatusReportActivitySection);
