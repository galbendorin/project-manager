import React from 'react';
import { keyGen } from '../utils/helpers';
import { IconEyeClosed, IconEyeOpen } from './Icons';

const SHORT_COLS = ['visible', 'number', 'status', 'level', 'raised', 'target', 'completed', 'date', 'updated', 'complete', 'cost', 'billing', 'mobile', 'phone'];

const isLongTextCol = (colName) => {
  const key = colName.toLowerCase().replace(/[^a-z]/g, '');
  if (key === 'status' || key === 'number' || key === 'visible' || key === 'level' || key === 'complete') return false;
  return !SHORT_COLS.some((value) => value !== 'status' && key.includes(value));
};

export default function RegisterEditableCell({
  item,
  colName,
  registerType,
  editingCell,
  expandedCell,
  onSetEditingCell,
  onSetExpandedCell,
  onCommitCell,
  onTogglePublic,
}) {
  const key = keyGen(colName);
  const cellId = `${item._id}-${key}`;
  const isEditing = editingCell === cellId;
  const value = item[key];
  const textValue = value || '...';
  const isLong = isLongTextCol(colName);
  const hasContent = value && value !== '...' && value.length > 40;
  const isExpanded = expandedCell === cellId;

  if (colName === 'Visible') {
    return (
      <td className="px-3 py-2.5 text-center w-12">
        <button
          onClick={() => onTogglePublic(registerType, item._id)}
          className="hover:text-indigo-600"
        >
          {item.public ? <IconEyeOpen /> : <IconEyeClosed />}
        </button>
      </td>
    );
  }

  if (colName === 'Number') {
    return (
      <td className="px-3 py-2.5 font-mono text-slate-300 font-bold w-16 text-center">
        {textValue}
      </td>
    );
  }

  const handleClick = () => {
    if (expandedCell === cellId) {
      onSetExpandedCell(null);
      return;
    }
    onSetEditingCell(cellId);
  };

  const handleBlur = (event) => {
    onCommitCell(item._id, key, event.target.value);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.target.blur();
    }
  };

  const handleExpand = (event) => {
    event.stopPropagation();
    onSetExpandedCell(isExpanded ? null : cellId);
  };

  if (isEditing) {
    return (
      <td className="px-3 py-2.5">
        <input
          autoFocus
          type="text"
          defaultValue={value === '...' ? '' : value}
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
        className="px-3 py-2.5 editable relative"
        onClick={handleClick}
      >
        <div className="flex items-start gap-1.5">
          <div
            className="overflow-hidden text-ellipsis flex-1 min-w-0"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              lineHeight: '1.4em',
              maxHeight: '2.8em',
            }}
          >
            {textValue}
          </div>
          {hasContent && (
            <button
              onClick={handleExpand}
              className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors mt-0.5"
              title="Expand"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {isExpanded ? <path d="M4 10l4-4 4 4" /> : <path d="M6 4l4 4-4 4" />}
              </svg>
            </button>
          )}
        </div>

        {isExpanded && (
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words shadow-sm">
            {value}
          </div>
        )}
      </td>
    );
  }

  return (
    <td
      className="px-3 py-2.5 editable"
      onClick={handleClick}
    >
      {textValue}
    </td>
  );
}
