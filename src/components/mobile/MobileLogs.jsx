import React, { useState, useMemo, useCallback } from 'react';
import { SCHEMAS } from '../../utils/constants';

const LOG_TYPES = [
  { id: 'risks', label: 'Risks' },
  { id: 'issues', label: 'Issues' },
  { id: 'actions', label: 'Actions' },
  { id: 'minutes', label: 'Minutes' },
  { id: 'costs', label: 'Costs' },
  { id: 'changes', label: 'Changes' },
  { id: 'comms', label: 'Comms' },
];

const statusColor = (s) => {
  const sl = (s || '').toLowerCase();
  if (sl.includes('complete') || sl.includes('closed')) return 'bg-emerald-100 text-emerald-700';
  if (sl.includes('progress') || sl.includes('open')) return 'bg-blue-100 text-blue-700';
  if (sl.includes('hold') || sl.includes('monitor')) return 'bg-amber-100 text-amber-700';
  if (sl.includes('overdue') || sl.includes('critical')) return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-600';
};

const levelColor = (l) => {
  const ll = (l || '').toLowerCase();
  if (ll.includes('high') || ll.includes('red')) return 'bg-rose-100 text-rose-700';
  if (ll.includes('med') || ll.includes('amber')) return 'bg-amber-100 text-amber-700';
  if (ll.includes('low') || ll.includes('green')) return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-100 text-slate-600';
};

const RegisterItemCard = ({ item, schema, onTap }) => {
  const cols = schema.cols;
  // First substantive text column as title (skip Visible, Number)
  const titleCol = cols.find(c => c !== 'Visible' && c !== 'Number' && c !== 'Status' && c !== 'Level');
  const title = item[titleCol] || item[cols[2]] || item[cols[3]] || 'Untitled';
  const number = item['Number'] || item.number || '';
  const status = item['Status'] || item['Current Status'] || '';
  const level = item['Level'] || '';
  const owner = item['Owner'] || item['Action Assigned to'] || item['Issue Assigned to'] || item['Assigned to'] || '';

  // Find a secondary detail field
  const detailCol = cols.find(c =>
    c !== 'Visible' && c !== 'Number' && c !== titleCol && c !== 'Status' && c !== 'Level' &&
    c !== 'Current Status' && c !== 'Owner' && item[c]
  );
  const detail = detailCol ? item[detailCol] : '';

  const isVisible = item['Visible'] !== false;
  if (!isVisible) return null;

  return (
    <div
      onClick={() => onTap(item)}
      className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm mb-2 active:scale-[0.98] transition-transform cursor-pointer"
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
          {level && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${levelColor(level)}`}>{level}</span>}
          {status && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${statusColor(status)}`}>{status}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {number && <span className="text-[10px] font-mono text-slate-400">#{number}</span>}
            <span className="text-[13px] font-semibold text-slate-800 truncate">{title}</span>
          </div>
          {detail && (
            <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">{detail}</div>
          )}
          {owner && (
            <div className="mt-1.5">
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{owner}</span>
            </div>
          )}
        </div>
        <span className="text-slate-300 text-sm flex-shrink-0">›</span>
      </div>
    </div>
  );
};

/* ── Register detail sheet ── */
const RegisterDetailSheet = ({ item, schema, onClose, onUpdate, onDelete }) => {
  const [editField, setEditField] = useState(null);
  const [tempValue, setTempValue] = useState('');
  const cols = schema.cols.filter(c => c !== 'Visible');

  const save = (col, val) => {
    onUpdate(item._id || item.id, col, val);
    setEditField(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative mt-10 flex-1 bg-white rounded-t-2xl flex flex-col overflow-hidden"
        style={{ animation: 'mobileSlideUp 0.3s ease-out' }}>
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>
        <div className="px-4 pb-3 border-b border-slate-100 flex items-center justify-between">
          <button onClick={onClose} className="text-sm font-semibold text-indigo-600">← Back</button>
          <span className="text-xs font-bold text-slate-800">{schema.title}</span>
          <button onClick={() => { if (window.confirm('Delete this item?')) { onDelete(item._id || item.id); onClose(); } }}
            className="text-xs text-rose-400 font-semibold">Delete</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {cols.map(col => {
            const val = item[col] ?? '';
            const isEditing = editField === col;

            // Status field — special
            const isStatus = col === 'Status' || col === 'Current Status';
            const statusOpts = isStatus ? ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'] : null;
            const isLevel = col === 'Level';
            const levelOpts = isLevel ? ['High', 'Medium', 'Low'] : null;
            const options = statusOpts || levelOpts;

            return (
              <div
                key={col}
                className="flex items-center justify-between px-4 py-3.5 border-b border-slate-50 active:bg-slate-50 cursor-pointer"
                onClick={() => { if (!isEditing) { setEditField(col); setTempValue(val); } }}
              >
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-28 flex-shrink-0">{col}</span>
                {isEditing && options ? (
                  <div className="flex gap-1 flex-wrap justify-end">
                    {options.map(o => (
                      <button key={o} onClick={e => { e.stopPropagation(); save(col, o); }}
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg ${val === o ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                      >{o}</button>
                    ))}
                  </div>
                ) : isEditing ? (
                  <textarea
                    autoFocus
                    defaultValue={val}
                    rows={val.length > 60 ? 4 : 1}
                    className="flex-1 text-sm text-slate-900 bg-indigo-50 px-3 py-1.5 rounded-lg outline-none ring-2 ring-indigo-300 ml-2 resize-none"
                    onBlur={e => save(col, e.target.value)}
                  />
                ) : (
                  <div className="flex items-center gap-2 flex-1 justify-end ml-2">
                    <span className={`text-sm font-medium text-right ${val ? 'text-slate-800' : 'text-slate-300'} line-clamp-2`}>
                      {val || '–'}
                    </span>
                    <span className="text-slate-300 text-xs flex-shrink-0">✏️</span>
                  </div>
                )}
              </div>
            );
          })}
          <div className="h-12" />
        </div>
      </div>
    </div>
  );
};

/* ── Main MobileLogs component ── */
const MobileLogs = ({ registers, isExternalView, onUpdateItem, onDeleteItem, onTogglePublic, onAddItem }) => {
  const [activeLog, setActiveLog] = useState('risks');
  const [selectedItem, setSelectedItem] = useState(null);

  const schema = SCHEMAS[activeLog];
  const items = registers[activeLog] || [];
  const visibleItems = items.filter(item => item['Visible'] !== false || !isExternalView);

  const handleUpdate = useCallback((itemId, col, value) => {
    onUpdateItem(activeLog, itemId, col, value);
    // Also update selected item locally
    setSelectedItem(prev => prev ? { ...prev, [col]: value } : prev);
  }, [activeLog, onUpdateItem]);

  const handleDelete = useCallback((itemId) => {
    onDeleteItem(activeLog, itemId);
  }, [activeLog, onDeleteItem]);

  return (
    <div className="flex flex-col h-full">
      {/* Pill selector */}
      <div className="px-3 py-2.5 flex gap-1.5 overflow-x-auto scrollbar-hide bg-white border-b border-slate-100 sticky top-0 z-10">
        {LOG_TYPES.map(l => (
          <button
            key={l.id}
            onClick={() => { setActiveLog(l.id); setSelectedItem(null); }}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-all flex-shrink-0 ${
              activeLog === l.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            {l.label}
            {(registers[l.id] || []).length > 0 && (
              <span className="ml-1 opacity-70">({(registers[l.id] || []).length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-3">
        {visibleItems.length > 0 ? (
          visibleItems.map((item, idx) => (
            <RegisterItemCard
              key={item._id || idx}
              item={item}
              schema={schema}
              onTap={setSelectedItem}
            />
          ))
        ) : (
          <div className="text-center py-12 text-sm text-slate-400">
            <div className="text-2xl mb-2">📋</div>
            No {schema.title.toLowerCase()} items
          </div>
        )}
      </div>

      {/* FAB to add */}
      <button
        onClick={() => onAddItem(activeLog)}
        className="fixed bottom-20 right-4 z-30 w-12 h-12 bg-indigo-600 active:bg-indigo-700 text-white rounded-full shadow-lg flex items-center justify-center text-xl transition-colors"
      >
        +
      </button>

      {/* Detail sheet */}
      {selectedItem && (
        <RegisterDetailSheet
          item={selectedItem}
          schema={schema}
          onClose={() => setSelectedItem(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
};

export default React.memo(MobileLogs);
