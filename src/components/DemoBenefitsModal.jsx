import React from 'react';

const BENEFIT_SECTIONS = [
  {
    title: 'Program Delivery Control',
    points: [
      'End-to-end SD-WAN and Ethernet delivery plan in one timeline.',
      'Dependency logic (FS/SS/FF/SF and multi-dependency gates) for realistic sequencing.',
      'Milestones and parent roll-ups to explain critical path decisions.'
    ]
  },
  {
    title: 'Operational Visibility',
    points: [
      'Master Tracker links live schedule tasks with RAG, owners, and next actions.',
      'Status Report summarizes progress, period activity, and top risks/issues.',
      'Register tabs keep actions, issues, changes, and comms audit-ready.'
    ]
  },
  {
    title: 'Team Collaboration',
    points: [
      'Members can update tasks, logs, and tracker entries in near real time.',
      'External view supports stakeholder communication with controlled visibility.',
      'Import/export to Excel helps fit existing enterprise reporting workflows.'
    ]
  }
];

const DemoBenefitsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] bg-slate-900/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-3xl rounded-xl border border-slate-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-800">SD-WAN Demo Benefits</h3>
            <p className="text-sm text-slate-500 mt-1">
              Quick client-facing value summary for this delivery management workspace.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {BENEFIT_SECTIONS.map((section) => (
            <div key={section.title} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
              <h4 className="text-sm font-semibold text-slate-800 mb-2">{section.title}</h4>
              <ul className="space-y-2 text-xs text-slate-600">
                {section.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span className="text-indigo-500 mt-0.5">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DemoBenefitsModal;
