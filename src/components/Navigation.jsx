import React, { useRef, useState, useEffect, useCallback } from 'react';
import { TABS } from '../utils/constants';

const Navigation = ({ activeTab, onTabChange }) => {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeLabel = TABS.find(t => t.id === activeTab)?.label || 'Select';

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  // Scroll active tab into view on mount / tab change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeBtn = el.querySelector('[data-active="true"]');
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    // Recheck after scroll
    setTimeout(checkScroll, 300);
  }, [activeTab, checkScroll]);

  const handleTabChange = (id) => {
    onTabChange(id);
    setMobileOpen(false);
  };

  return (
    <nav className="flex-none z-20 bg-white border-b border-slate-200">
      {/* ── Mobile: dropdown ── */}
      <div className="md:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] font-semibold text-indigo-600"
        >
          <span>{activeLabel}</span>
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            className={`transition-transform ${mobileOpen ? 'rotate-180' : ''}`}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>

        {mobileOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMobileOpen(false)} />
            <div className="absolute left-0 right-0 z-50 bg-white border-b border-slate-200 shadow-lg max-h-[70vh] overflow-y-auto">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`w-full text-left px-4 py-2.5 text-[13px] font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'text-indigo-600 bg-indigo-50'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Desktop: scrollable tabs with fade indicators ── */}
      <div className="hidden md:block relative">
        {/* Left fade */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
        )}
        {/* Right fade */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
        )}

        <div
          ref={scrollRef}
          className="flex overflow-x-auto no-scrollbar px-2"
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              data-active={activeTab === tab.id ? 'true' : undefined}
              onClick={() => onTabChange(tab.id)}
              className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
