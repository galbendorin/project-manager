import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function useTimesheetEntryContextMenu({
  currentUserId,
  onDuplicateEntry,
  onSelectEntry,
}) {
  const contextMenuRef = useRef(null);
  const [entryContextMenu, setEntryContextMenu] = useState(null);

  const closeEntryContextMenu = useCallback(() => {
    setEntryContextMenu(null);
  }, []);

  useEffect(() => {
    if (!entryContextMenu) return undefined;

    const handlePointerDown = (event) => {
      if (contextMenuRef.current?.contains(event.target)) return;
      closeEntryContextMenu();
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeEntryContextMenu();
      }
    };

    window.addEventListener('resize', closeEntryContextMenu);
    window.addEventListener('scroll', closeEntryContextMenu, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('resize', closeEntryContextMenu);
      window.removeEventListener('scroll', closeEntryContextMenu, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeEntryContextMenu, entryContextMenu]);

  const openEntryContextMenu = useCallback((event, entry) => {
    if (!entry || entry.user_id !== currentUserId) return;

    event.preventDefault();
    event.stopPropagation();
    onSelectEntry(entry);

    const menuWidth = 220;
    const menuHeight = 64;
    const left = Math.max(12, Math.min(event.clientX, window.innerWidth - menuWidth - 12));
    const top = Math.max(12, Math.min(event.clientY, window.innerHeight - menuHeight - 12));

    setEntryContextMenu({ entry, left, top });
  }, [currentUserId, onSelectEntry]);

  const handleDuplicateEntry = useCallback(() => {
    if (!entryContextMenu?.entry) return;
    onDuplicateEntry(entryContextMenu.entry);
    closeEntryContextMenu();
  }, [closeEntryContextMenu, entryContextMenu, onDuplicateEntry]);

  const entryContextMenuNode = entryContextMenu && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={contextMenuRef}
          className="fixed z-[90] w-[220px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_55px_-28px_rgba(15,23,42,0.35)]"
          style={{ left: `${entryContextMenu.left}px`, top: `${entryContextMenu.top}px` }}
        >
          <button
            type="button"
            onClick={handleDuplicateEntry}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-indigo-50"
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">Duplicate entry</div>
              <div className="text-xs text-slate-500">Create a copy and move it to another slot</div>
            </div>
            <span className="text-indigo-600">+</span>
          </button>
        </div>,
        document.body
      )
    : null;

  return {
    closeEntryContextMenu,
    entryContextMenu,
    entryContextMenuNode,
    openEntryContextMenu,
  };
}
