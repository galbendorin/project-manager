import React, { useState } from 'react';
import { SCHEMAS, ICONS } from '../utils/constants';
import { keyGen, filterBySearch } from '../utils/helpers';

// Columns that are short/fixed — don't need clamp/tooltip
const SHORT_COLS = ['visible', 'number', 'status', 'level', 'raised', 'target', 'completed', 'date', 'updated', 'complete', 'cost', 'billing', 'mobile', 'phone'];

const isLongTextCol = (colName) => {
  const k = colName.toLowerCase().replace(/[^a-z]/g, '');
  // Don't apply special rendering to short columns
  // But "Current Status" and "Issue Assigned to" etc should get the treatment
  if (k === 'status' || k === 'number' || k === 'visible' || k === 'level' || k === 'complete') return false;
  return !SHORT_COLS.some(s => s !== 'status' && k.includes(s));
};

const RegisterView = ({ 
  registerType,
  items,
  isExternalView,
  onUpdateItem,
  onDeleteItem,
  onTogglePublic
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCell, setEditingCell] = useState(null);

  const schema = SCHEMAS[registerType];
  if (!schema) return null;

  const visibleCols = isExternalView 
    ? schema.cols.filter(c => c !== "Visible") 
    : schema.cols;

  const filteredItems = filterBySearch(items, searchQuery).filter(item =>
    isExternalView ? item.public : true
  );

  const handleCellEdit = (itemId, key, value) => {
    onUpdateItem(registerType, itemId, key, value);
    setEditingCell(null);
  };

  const EditableCell = ({ item, colName }) => {
    const key = keyGen(colName);
    const cellId = `${item._id}-${key}`;
    const isEditing = editingCell === cellId;
    const value = item[key];
    const textValue = value || '...';
    const isLong = isLongTextCol(colName);
    const hasContent = value && value !== '...' && value.length > 30;

    if (colName === "Visible") {
      return (
        <td className="px-8 py-3 text-center">
          <button
            onClick={() => onTogglePublic(registerType, item._id)}
            className="hover:text-indigo-600"
            dangerouslySetInnerHTML={{ 
              __html: item.public ? ICONS.eyeOpen : ICONS.eyeClosed 
            }}
          />
        </td>
      );
    }

    if (colName === "Number") {
      return (
        <td className="px-8 py-3 font-mono text-slate-300 font-bold">
          {textValue}
        </td>
      );
    }

    const handleClick = () => {
      setEditingCell(cellId);
    };

    const handleBlur = (e) => {
      handleCellEdit(item._id, key, e.target.value);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    };

    if (isEditing) {
      return (
        <td className="px-8 py-3">
          <input
            autoFocus
            type="text"
            defaultValue={value === "..." ? "" : value}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="editing-input bg-indigo-50"
          />
        </td>
      );
    }

    if (isLong) {
      return (
        <td
          className="px-8 py-3 editable relative group/cell"
          onClick={handleClick}
        >
          <div 
            className="overflow-hidden text-ellipsis"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              lineHeight: '1.4em',
              maxHeight: '2.8em'
            }}
          >
            {textValue}
          </div>
          {hasContent && (
            <div 
              className="absolute invisible group-hover/cell:visible hover:visible left-0 top-full mt-1 z-[9999] bg-slate-800 text-white text-xs rounded-lg shadow-xl p-3 min-w-[200px] max-w-[500px] overflow-y-auto cursor-text"
              style={{ 
                whiteSpace: 'normal', 
                wordWrap: 'break-word', 
                maxHeight: '400px',
                lineHeight: '1.5'
              }}
            >
              {value}
            </div>
          )}
        </td>
      );
    }

    return (
      <td
        className="px-8 py-3 editable"
        onClick={handleClick}
      >
        {textValue}
      </td>
    );
  };

  return (
    <div className="w-full h-full bg-slate-50 p-6 overflow-auto">
      <div className="max-w-[1650px] mx-auto bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col min-h-[500px]">
        <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center rounded-t-xl">
          <h2 className="text-lg font-black text-slate-800 tracking-tight">
            {schema.title}
          </h2>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-4 py-2 text-sm border border-slate-200 rounded-xl w-72 outline-none"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 border-b">
              <tr>
                {visibleCols.map(col => (
                  <th
                    key={col}
                    className={`px-8 py-4 border-b ${col === 'Visible' ? 'w-10' : ''}`}
                  >
                    {col === 'Visible' ? (
                      <div dangerouslySetInnerHTML={{ __html: ICONS.eyeOpen }} />
                    ) : (
                      col
                    )}
                  </th>
                ))}
                <th className="px-8 py-4 border-b w-24 text-center">Act</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {filteredItems.map(item => (
                <tr
                  key={item._id}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition-all ${
                    !item.public ? 'bg-slate-50/50' : ''
                  }`}
                >
                  {visibleCols.map(col => (
                    <EditableCell key={col} item={item} colName={col} />
                  ))}
                  <td className="px-8 py-3 text-center">
                    <button
                      onClick={() => onDeleteItem(registerType, item._id)}
                      className="text-slate-300 hover:text-rose-500"
                      dangerouslySetInnerHTML={{ __html: ICONS.trash }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredItems.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              No entries found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegisterView;
