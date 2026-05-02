import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TABS } from '../utils/constants';
import { usePlan } from '../contexts/PlanContext';

const PHONE_BREAKPOINT = 640;

const LockIcon = () => (
  <svg
    className="h-3.5 w-3.5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

const ChevronDownIcon = ({ open = false }) => (
  <svg
    className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const Navigation = ({ activeTab, onTabChange }) => {
  const navShellRef = useRef(null);
  const measureRef = useRef(null);
  const moreButtonRef = useRef(null);
  const moreMenuRef = useRef(null);
  const [isCompact, setIsCompact] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { hasTabAccess } = usePlan();

  const compactPrimaryTabs = useMemo(
    () => TABS.filter((tab) => tab.compactPrimary),
    []
  );
  const compactOverflowTabs = useMemo(
    () => TABS.filter((tab) => !tab.compactPrimary),
    []
  );
  const activeInOverflow = compactOverflowTabs.some((tab) => tab.id === activeTab);

  const updateLayout = useCallback(() => {
    if (typeof window === 'undefined') return;

    const shellWidth = navShellRef.current?.clientWidth ?? 0;
    const requiredWidth = measureRef.current?.offsetWidth ?? 0;
    const nextIsPhone = window.innerWidth <= PHONE_BREAKPOINT;
    const nextCompact = nextIsPhone || requiredWidth > shellWidth;

    setIsPhone(nextIsPhone);
    setIsCompact(nextCompact);
  }, []);

  useEffect(() => {
    updateLayout();

    if (typeof window === 'undefined') return undefined;

    let frameId = null;
    const handleResize = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(updateLayout);
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(handleResize)
      : null;

    if (resizeObserver) {
      if (navShellRef.current) resizeObserver.observe(navShellRef.current);
      if (measureRef.current) resizeObserver.observe(measureRef.current);
    }

    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, [updateLayout]);

  useEffect(() => {
    setMoreOpen(false);
  }, [activeTab, isCompact]);

  useEffect(() => {
    if (!moreOpen) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (moreButtonRef.current?.contains(target)) return;
      if (moreMenuRef.current?.contains(target)) return;
      setMoreOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [moreOpen]);

  const handleTabSelect = useCallback((tabId) => {
    setMoreOpen(false);
    onTabChange(tabId);
  }, [onTabChange]);

  const renderTabButton = useCallback((tab, { compact = false, measuring = false } = {}) => {
    const unlocked = hasTabAccess(tab.id);
    const isActive = activeTab === tab.id;
    const classNames = [
      'nav-tab',
      compact ? 'nav-tab--compact' : '',
      measuring ? 'nav-tab--measure' : '',
      isActive ? 'active' : '',
      !unlocked ? 'nav-tab--locked' : '',
    ].filter(Boolean).join(' ');

    return (
      <button
        key={`${tab.id}-${compact ? 'compact' : 'full'}-${measuring ? 'measure' : 'visible'}`}
        type="button"
        data-active={isActive ? 'true' : undefined}
        onClick={measuring ? undefined : () => handleTabSelect(tab.id)}
        className={classNames}
        title={!unlocked ? `${tab.label} — Pro feature` : tab.label}
        tabIndex={measuring ? -1 : undefined}
      >
        <span className="nav-tab__label">{tab.label}</span>
        {!unlocked && (
          <span className="nav-tab__meta" aria-hidden="true">
            <LockIcon />
          </span>
        )}
      </button>
    );
  }, [activeTab, handleTabSelect, hasTabAccess]);

  const moreButtonClasses = [
    'nav-tab',
    'nav-tab--compact',
    'nav-tab--more',
    moreOpen || activeInOverflow ? 'active' : '',
  ].filter(Boolean).join(' ');

  const desktopMenu = moreOpen && !isPhone ? (
    <div ref={moreMenuRef} className="nav-more-menu" role="menu" aria-label="More project pages">
      {compactOverflowTabs.map((tab) => {
        const unlocked = hasTabAccess(tab.id);
        const isActive = activeTab === tab.id;
        return (
          <button
            key={`overflow-${tab.id}`}
            type="button"
            role="menuitem"
            onClick={() => handleTabSelect(tab.id)}
            className={`nav-more-menu__item ${isActive ? 'active' : ''}`}
            title={!unlocked ? `${tab.label} — Pro feature` : tab.label}
          >
            <span>{tab.label}</span>
            {!unlocked && (
              <span className="nav-more-menu__lock" aria-hidden="true">
                <LockIcon />
              </span>
            )}
          </button>
        );
      })}
    </div>
  ) : null;

  const mobileSheet = moreOpen && isPhone && typeof document !== 'undefined'
    ? createPortal(
        <div className="nav-sheet-backdrop">
          <button
            type="button"
            className="nav-sheet-backdrop__scrim"
            onClick={() => setMoreOpen(false)}
            aria-label="Close more project pages"
          />
          <div
            ref={moreMenuRef}
            className="nav-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More project pages"
          >
            <div className="nav-sheet__handle" />
            <div className="nav-sheet__header">
              <p className="nav-sheet__kicker">Project Pages</p>
              <button
                type="button"
                className="nav-sheet__close"
                onClick={() => setMoreOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="nav-sheet__list">
              {compactOverflowTabs.map((tab) => {
                const unlocked = hasTabAccess(tab.id);
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={`sheet-${tab.id}`}
                    type="button"
                    onClick={() => handleTabSelect(tab.id)}
                    className={`nav-sheet__item ${isActive ? 'active' : ''}`}
                    title={!unlocked ? `${tab.label} — Pro feature` : tab.label}
                  >
                    <span>{tab.label}</span>
                    {!unlocked && (
                      <span className="nav-sheet__lock" aria-hidden="true">
                        <LockIcon />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={navShellRef} className="nav-shell">
      <div ref={measureRef} className="nav-tabs nav-tabs--measure" aria-hidden="true">
        {TABS.map((tab) => renderTabButton(tab, { measuring: true }))}
      </div>

      {!isCompact ? (
        <nav className="nav-tabs nav-tabs--full" aria-label="Project pages">
          {TABS.map((tab) => renderTabButton(tab))}
        </nav>
      ) : (
        <div className="nav-compact-wrap">
          <nav className="nav-tabs nav-tabs--compact" aria-label="Project pages">
            {compactPrimaryTabs.map((tab) => renderTabButton(tab, { compact: true }))}
            <button
              ref={moreButtonRef}
              type="button"
              className={moreButtonClasses}
              onClick={() => setMoreOpen((prev) => !prev)}
              aria-haspopup={isPhone ? 'dialog' : 'menu'}
              aria-expanded={moreOpen ? 'true' : 'false'}
            >
              <span className="nav-tab__label">More</span>
              <span className="nav-tab__meta" aria-hidden="true">
                <ChevronDownIcon open={moreOpen} />
              </span>
            </button>
          </nav>
          {desktopMenu}
          {mobileSheet}
        </div>
      )}
    </div>
  );
};

export default Navigation;
