import React from 'react';
import { TABS } from '../utils/constants';

const Navigation = ({ activeTab, onTabChange }) => {
  return (
    <nav className="nav-tabs flex-none z-20">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
};

export default Navigation;
