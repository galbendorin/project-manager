import React, { useState } from 'react';
import { SCHEMAS } from '../utils/constants';
import { keyGen, filterBySearch } from '../utils/helpers';
import { IconEyeOpen, IconEyeClosed, IconTrash } from './Icons';
import { useMediaQuery } from '../hooks/useMediaQuery';
import MobileRegisterList from './mobile/MobileRegisterList';

const SUB_VIEWS = [
  { key: 'costs', label: 'Cost Register' },
  { key: 'changes', label: 'Change Control' },
  { key: 'assumptions', label: 'Assumptions & Dependencies' },
  { key: 'decisions', label: 'Decision Log' }
];

const FinancialsView = ({ registers, isExternalView, onUpdateItem, onDeleteItem, onTogglePublic, onSubViewChange }) => {
  const [activeView, setActiveView] = useState('costs');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCell, setEditingCell] = useState(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const handleViewChange = (v) => {
    setActiveView(v);
    setSearchQuery('');
    setEditingCell(null);
    if (onSubViewChange) onSubViewChange(v);
  };

  // Report initial view on mount
  React.useEffect(() => {
    if (onSubViewChange) onSubViewChange('costs');
  }, []);

  const schema = SCHEMAS[activeView];
  const items = registers[activeView] || [];
  const cols = isExternalView ? schema.cols.filter(c => c !== 'Visible') : schema.cols;
  const filteredItems = filterBySearch(items, searchQuery).filter(item => isExternalView ? item.public !== false : true);

  if (isMobile) {
    return (
      <div className="flex h-full flex-col bg-slate-50">
        <div className="border-b border-slate-200 bg-white px-3 py-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {SUB_VIEWS.map((view) => {
              const count = (registers[view.key] || []).filter((item) => (isExternalView ? item.public !== false : true)).length;
              return (
                <button
                  key={view.key}
                  onClick={() => handleViewChange(view.key)}
                  className={`shrink-0 rounded-full border px-3 py-2 text-[11px] font-semibold transition ${
                    activeView === view.key
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  {view.label}
                  <span className="ml-1 opacity-80">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <MobileRegisterList
            schema={schema}
            items={items}
            isExternalView={isExternalView}
            onUpdateItem={(itemId, key, value) => onUpdateItem(activeView, itemId, key, value)}
            onDeleteItem={(itemId) => onDeleteItem(activeView, itemId)}
          />
        </div>
      </div>
    );
  }

  const handleCellEdit = (itemId, key, value) => {
    onUpdateItem(activeView, itemId, key, value);
    setEditingCell(null);
  };

  const EditableCell = ({ item, colName }) => {
    const key = keyGen(colName);
    const cellId = `${item._id}-${key}`;
    const isEditing = editingCell === cellId;
    const value = item[key];
    const textValue = value || '...';

    if (colName === "Visible") return (
      <td className="px-3 py-2.5 text-center w-12">
        <button onClick={() => onTogglePublic(activeView, item._id)} className="hover:text-indigo-600">
          {item.public ? <IconEyeOpen /> : <IconEyeClosed />}
        </button>
      </td>
    );
    if (colName === "Number") return <td className="px-3 py-2.5 font-mono text-slate-300 font-bold w-16 text-center">{textValue}</td>;

    if (isEditing) return (
      <td className="px-3 py-2.5">
        <input autoFocus type="text" defaultValue={value === "..." ? "" : value}
          onBlur={(e) => handleCellEdit(item._id, key, e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          className="editing-input bg-indigo-50" />
      </td>
    );

    return (
      <td className="px-3 py-2.5 cursor-pointer hover:bg-indigo-50/50 transition-colors" onClick={() => setEditingCell(cellId)}>
        <span className="text-[11px] text-slate-600 line-clamp-2">{textValue}</span>
      </td>
    );
  };

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden">
      <div className="flex-none px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {SUB_VIEWS.map(v => (
            <button key={v.key} onClick={() => handleViewChange(v.key)}
              className={`px-4 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                activeView === v.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>{v.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="text" placeholder="Search..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-[11px] border border-slate-200 rounded-lg px-3 py-1.5 w-48 outline-none focus:border-indigo-300" />
          <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full font-medium">{filteredItems.length} items</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b border-slate-200">
              {cols.map(col => (
                <th key={col} className="px-3 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{col}</th>
              ))}
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item, idx) => (
              <tr key={item._id} className={`border-b border-slate-100 hover:bg-indigo-50/30 transition-colors ${idx % 2 !== 0 ? 'bg-slate-50/40' : ''}`}>
                {cols.map(col => <EditableCell key={col} item={item} colName={col} />)}
                <td className="px-3 py-2.5 text-center">
                  <button onClick={() => onDeleteItem(activeView, item._id)} className="text-slate-300 hover:text-rose-500 transition-colors"><IconTrash /></button>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="px-4 py-12 text-center text-[12px] text-slate-400">
                No items yet. Click <strong>+ Add Entry</strong> to create one.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FinancialsView;
