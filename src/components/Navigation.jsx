import React from 'react';
import { TABS } from '../utils/constants';

const Navigation = ({ activeTab, onTabChange }) => {
  return (
    <nav className="flex border-b border-slate-200 bg-white px-6 pt-1 z-20 overflow-x-auto no-scrollbar gap-1">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`nav-tab ${
            activeTab === tab.id
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400'
          } whitespace-nowrap px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-widest border-b-2 transition-all hover:text-indigo-600`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
};

export default Navigation;
