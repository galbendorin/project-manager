import React, { useMemo, useState } from 'react';
import { filterBySearch } from '../utils/helpers';
import { ICONS } from '../utils/constants';

const STATUS_OPTIONS = ['Open', 'Done'];

const sortTodos = (items = []) => {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'Open' ? -1 : 1;
    }
    if (a.dueDate && b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
};

const TodoView = ({
  todos,
  isExternalView,
  onUpdateTodo,
  onDeleteTodo
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTodos = useMemo(
    () => sortTodos(filterBySearch(todos || [], searchQuery)),
    [todos, searchQuery]
  );

  return (
    <div className="w-full h-full bg-slate-50 p-6 overflow-auto">
      <div className="max-w-[1200px] mx-auto bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col min-h-[500px]">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-t-xl">
          <div>
            <h2 className="text-lg font-black text-slate-800 tracking-tight">ToDo</h2>
            <p className="text-[11px] text-slate-400 mt-1">
              Manual action list (Step 4 skeleton). Aggregated log items will be added in next step.
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

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 border-b">
              <tr>
                <th className="px-6 py-4 border-b w-[42%]">Title</th>
                <th className="px-6 py-4 border-b w-[18%]">Due Date</th>
                <th className="px-6 py-4 border-b w-[20%]">Owner</th>
                <th className="px-6 py-4 border-b w-[14%]">Status</th>
                <th className="px-6 py-4 border-b w-[6%] text-center">Act</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {filteredTodos.map((todo) => (
                <tr key={todo._id} className="border-b border-slate-100 hover:bg-slate-50 transition-all">
                  <td className="px-6 py-3">
                    <input
                      type="text"
                      value={todo.title || ''}
                      disabled={isExternalView}
                      onChange={(e) => onUpdateTodo(todo._id, 'title', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </td>
                  <td className="px-6 py-3">
                    <input
                      type="date"
                      value={todo.dueDate || ''}
                      disabled={isExternalView}
                      onChange={(e) => onUpdateTodo(todo._id, 'dueDate', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </td>
                  <td className="px-6 py-3">
                    <input
                      type="text"
                      value={todo.owner || ''}
                      disabled={isExternalView}
                      onChange={(e) => onUpdateTodo(todo._id, 'owner', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </td>
                  <td className="px-6 py-3">
                    <select
                      value={todo.status || 'Open'}
                      disabled={isExternalView}
                      onChange={(e) => onUpdateTodo(todo._id, 'status', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-3 text-center">
                    {!isExternalView && (
                      <button
                        onClick={() => onDeleteTodo(todo._id)}
                        className="text-slate-300 hover:text-rose-500"
                        title="Delete ToDo"
                        dangerouslySetInnerHTML={{ __html: ICONS.trash }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredTodos.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              No ToDo items yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TodoView;
