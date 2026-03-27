import React, { useRef, useState, useEffect, useCallback } from 'react';
import { TABS } from '../utils/constants';
import { usePlan } from '../contexts/PlanContext';

const Navigation = ({ activeTab, onTabChange }) => {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const { hasTabAccess } = usePlan();

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
      const elRect = el.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      if (btnRect.left < elRect.left || btnRect.right > elRect.right) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
    setTimeout(checkScroll, 300);
  }, [activeTab, checkScroll]);

  return (
    <div className="relative flex-none z-20">
      {/* Left fade */}
      {canScrollLeft && (
        <div
          className="absolute left-0 top-0 bottom-0 z-10 w-10 pointer-events-none"
          style={{ background: 'linear-gradient(to right, var(--pm-shell-bg-solid), transparent)' }}
        />
      )}
      {/* Right fade */}
      {canScrollRight && (
        <div
          className="absolute right-0 top-0 bottom-0 z-10 w-10 pointer-events-none"
          style={{ background: 'linear-gradient(to left, var(--pm-shell-bg-solid), transparent)' }}
        />
      )}

      <nav ref={scrollRef} className="nav-tabs">
        {TABS.map(tab => {
          const unlocked = hasTabAccess(tab.id);
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              data-active={isActive ? 'true' : undefined}
              onClick={() => onTabChange(tab.id)}
              className={`nav-tab ${isActive ? 'active' : ''} ${
                !unlocked ? 'opacity-60' : ''
              }`}
              title={!unlocked ? `${tab.label} — Pro feature` : tab.label}
            >
              {tab.label}
              {!unlocked && (
                <svg
                  className="inline-block w-3 h-3 ml-1 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default Navigation;
