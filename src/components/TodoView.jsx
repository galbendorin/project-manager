import React, { useMemo, useState } from 'react';
import { filterBySearch, collectDerivedTodos, bucketByDeadline, formatDate } from '../utils/helpers';
import { ICONS } from '../utils/constants';

const STATUS_OPTIONS = ['Open', 'Done'];

const statusClass = (status) => {
  if (status === 'Done') return 'text-emerald-700 bg-emerald-50 border border-emerald-100';
  return 'text-amber-700 bg-amber-50 border border-amber-100';
};

const recurrenceLabel = (recurrence) => {
  const type = String(recurrence?.type || '').toLowerCase();
  if (!type) return 'One-time';
  if (type === 'weekdays') return 'Weekdays';
  if (type === 'weekly') return 'Weekly';
  if (type === 'monthly') return 'Monthly';
  if (type === 'yearly') return 'Yearly';
  return 'One-time';
};

const TodoView = ({
  todos,
  projectData,
  registers,
  tracker,
  isExternalView,
  onUpdateTodo,
  onDeleteTodo
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const mergedTodos = useMemo(() => {
    const manualTodos = (todos || []).map(item => ({
      ...item,
      isDerived: false,
      source: 'Manual',
      public: item.public !== false
    }));
    const derivedTodos = collectDerivedTodos(projectData, registers, tracker);
    return [...manualTodos, ...derivedTodos];
  }, [todos, projectData, registers, tracker]);

  const filteredTodos = useMemo(() => {
    const searched = filterBySearch(mergedTodos, searchQuery);
    if (!isExternalView) return searched;
    return searched.filter(item => item.public !== false);
  }, [mergedTodos, searchQuery, isExternalView]);

  const buckets = useMemo(
    () => bucketByDeadline(filteredTodos),
    [filteredTodos]
  );

  return (
    <div className="w-full h-full bg-slate-50 p-6 overflow-auto">
      <div className="max-w-[1280px] mx-auto bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col min-h-[500px]">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-t-xl">
          <div>
            <h2 className="text-lg font-black text-slate-800 tracking-tight">ToDo</h2>
            <p className="text-[11px] text-slate-400 mt-1">
              One merged action list from manual ToDos, logs, and tracking data. Recurring manual items auto-generate the next item when marked done.
            </p>
          </div>
          <input
            type="text"
            placeholder="Search todos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-4 py-2 text-sm border border-slate-200 rounded-xl w-full sm:w-72 outline-none"
          />
        </div>

        <div className="px-5 py-4 space-y-4">
          {buckets.map((bucket) => (
            <section key={bucket.key} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-[12px] font-semibold text-slate-700 uppercase tracking-wide">{bucket.label}</h3>
                <span className="text-[11px] text-slate-500">{bucket.items.length}</span>
              </div>

              {bucket.items.length === 0 ? (
                <div className="px-4 py-5 text-[12px] text-slate-400">No items</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-white text-[10px] uppercase font-bold text-slate-400 border-b">
                      <tr>
                        <th className="px-4 py-3 border-b w-[36%]">Title</th>
                        <th className="px-4 py-3 border-b w-[15%]">Due Date</th>
                        <th className="px-4 py-3 border-b w-[16%]">Owner</th>
                        <th className="px-4 py-3 border-b w-[15%]">Recurring</th>
                        <th className="px-4 py-3 border-b w-[12%]">Status</th>
                        <th className="px-4 py-3 border-b w-[6%] text-center">Act</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs">
                      {bucket.items.map((todo) => {
                        const isManualEditable = !isExternalView && !todo.isDerived;
                        return (
                          <tr key={todo._id} className="border-b border-slate-100 hover:bg-slate-50 transition-all">
                            <td className="px-4 py-2.5 align-top">
                              {isManualEditable ? (
                                <input
                                  type="text"
                                  value={todo.title || ''}
                                  onChange={(e) => onUpdateTodo(todo._id, 'title', e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                                />
                              ) : (
                                <div className="text-[12px] text-slate-700">
                                  <div className={todo.status === 'Done' ? 'line-through text-slate-400' : ''}>{todo.title || 'Untitled'}</div>
                                  {todo.source && (
                                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                      {todo.source}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              {isManualEditable ? (
                                <input
                                  type="date"
                                  value={todo.dueDate || ''}
                                  onChange={(e) => onUpdateTodo(todo._id, 'dueDate', e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                                />
                              ) : (
                                <span className="text-[12px] text-slate-600">{todo.dueDate ? formatDate(todo.dueDate) : 'No deadline'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              {isManualEditable ? (
                                <input
                                  type="text"
                                  value={todo.owner || ''}
                                  onChange={(e) => onUpdateTodo(todo._id, 'owner', e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                                />
                              ) : (
                                <span className="text-[12px] text-slate-600">{todo.owner || 'Unassigned'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              {isManualEditable ? (
                                <select
                                  value={todo.recurrence?.type || 'none'}
                                  onChange={(e) => onUpdateTodo(
                                    todo._id,
                                    'recurrence',
                                    e.target.value === 'none' ? null : { type: e.target.value, interval: 1 }
                                  )}
                                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                                >
                                  <option value="none">One-time</option>
                                  <option value="weekdays">Weekdays</option>
                                  <option value="weekly">Weekly</option>
                                  <option value="monthly">Monthly</option>
                                  <option value="yearly">Yearly</option>
                                </select>
                              ) : (
                                <span className="text-[12px] text-slate-600">{recurrenceLabel(todo.recurrence)}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              {isManualEditable ? (
                                <select
                                  value={todo.status || 'Open'}
                                  onChange={(e) => onUpdateTodo(todo._id, 'status', e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                                >
                                  {STATUS_OPTIONS.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium ${statusClass(todo.status)}`}>
                                  {todo.status || 'Open'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center align-top">
                              {isManualEditable && (
                                <button
                                  onClick={() => onDeleteTodo(todo._id)}
                                  className="text-slate-300 hover:text-rose-500"
                                  title="Delete ToDo"
                                  dangerouslySetInnerHTML={{ __html: ICONS.trash }}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}

          {filteredTodos.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm">
              No ToDo items found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TodoView;
