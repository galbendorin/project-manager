import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getCurrentDate } from '../utils/helpers';
import {
  getCaptureRouteMeta,
  splitSmartCaptureInput,
  suggestCaptureRoute,
  summarizeCaptureRoutes,
} from '../utils/smartCapture';

export function useWorkspaceQuickCapture({
  activeTab,
  currentUserName,
  isMobile,
  isOnline,
  launchShortcut,
  projectId,
  addTodo,
  addRegisterItems,
  deleteRegisterItem,
  deleteTodo,
  setUndoAction,
  setActiveTab,
  setActiveSubView,
}) {
  const appliedLaunchShortcutRef = useRef('');
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [quickCaptureMode, setQuickCaptureMode] = useState('smart');
  const [quickCaptureText, setQuickCaptureText] = useState('');
  const [quickCaptureSaving, setQuickCaptureSaving] = useState(false);
  const [quickCaptureStatus, setQuickCaptureStatus] = useState('');

  useEffect(() => {
    if (!quickCaptureStatus) return undefined;
    const timeoutId = window.setTimeout(() => setQuickCaptureStatus(''), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [quickCaptureStatus]);

  const quickCaptureItems = useMemo(
    () => splitSmartCaptureInput(
      quickCaptureText,
      activeTab === 'actions' ? 'action' : 'task',
      { today: getCurrentDate(), selfOwnerName: currentUserName }
    ),
    [activeTab, currentUserName, quickCaptureText]
  );

  const quickCaptureSuggestion = useMemo(
    () => quickCaptureItems[0] || suggestCaptureRoute(
      quickCaptureText,
      activeTab === 'actions' ? 'action' : 'task',
      { today: getCurrentDate(), selfOwnerName: currentUserName }
    ),
    [activeTab, currentUserName, quickCaptureItems, quickCaptureText]
  );

  const activeCaptureRoute = useMemo(
    () => (quickCaptureMode === 'smart'
      ? quickCaptureSuggestion
      : {
          ...quickCaptureSuggestion,
          type: quickCaptureMode,
          reason: '',
          viaPrefix: false,
          meta: getCaptureRouteMeta(quickCaptureMode),
        }),
    [quickCaptureMode, quickCaptureSuggestion]
  );

  const quickCaptureRouteBreakdown = useMemo(
    () => (quickCaptureMode === 'smart' && quickCaptureItems.length > 1 ? summarizeCaptureRoutes(quickCaptureItems) : ''),
    [quickCaptureItems, quickCaptureMode]
  );

  const handleOpenQuickCapture = useCallback(() => {
    setQuickCaptureMode('smart');
    setQuickCaptureStatus('');
    setIsQuickCaptureOpen(true);
  }, []);

  const handleCloseQuickCapture = useCallback(() => {
    if (quickCaptureSaving) return;
    setIsQuickCaptureOpen(false);
    setQuickCaptureText('');
  }, [quickCaptureSaving]);

  useEffect(() => {
    if (!launchShortcut?.key || !projectId) return;

    const intentKey = `${projectId}:${launchShortcut.key}`;
    if (appliedLaunchShortcutRef.current === intentKey) return;

    if (launchShortcut.initialTab) {
      setActiveTab(launchShortcut.initialTab);
      setActiveSubView(null);
    }

    if (launchShortcut.openQuickCapture && isMobile) {
      setQuickCaptureMode('smart');
      setQuickCaptureStatus('');
      setIsQuickCaptureOpen(true);
    }

    appliedLaunchShortcutRef.current = intentKey;
  }, [isMobile, launchShortcut, projectId, setActiveSubView, setActiveTab]);

  const handleSubmitQuickCapture = useCallback(async () => {
    const captureEntries = (quickCaptureMode === 'smart' ? quickCaptureItems : [activeCaptureRoute])
      .map((item) => ({
        ...item,
        cleanedText: String(item?.cleanedText || '').trim(),
      }))
      .filter((item) => item.cleanedText);

    if (captureEntries.length === 0 || quickCaptureSaving || !projectId) return;

    setQuickCaptureSaving(true);

    try {
      const today = getCurrentDate();
      const ts = new Date().toISOString();
      const registerDrafts = {
        actions: [],
        risks: [],
        issues: [],
        decisions: [],
        minutes: [],
      };
      const createdForUndo = [];

      for (const item of captureEntries) {
        const routeType = item.type;
        const captureDueDate = ['task', 'action', 'issue'].includes(routeType)
          ? (item.dueDate || '')
          : '';
        const captureOwner = ['task', 'action', 'issue', 'risk', 'decision'].includes(routeType)
          ? (item.ownerText || '')
          : '';

        if (routeType === 'task') {
          const savedTodo = await addTodo({
            title: item.cleanedText,
            dueDate: captureDueDate,
            owner: captureOwner,
            projectId,
          });
          if (savedTodo?._id) {
            createdForUndo.push({ kind: 'task', item: savedTodo });
          }
          continue;
        }

        if (routeType === 'action') {
          registerDrafts.actions.push({
            _id: `quick_action_${Date.now()}_${registerDrafts.actions.length}`,
            visible: true,
            public: true,
            rowColor: null,
            category: 'Quick capture',
            actionassignedto: captureOwner,
            description: item.cleanedText,
            currentstatus: 'Captured on mobile',
            status: 'Open',
            raised: today,
            target: captureDueDate,
            update: today,
            completed: '',
            createdAt: ts,
            updatedAt: ts,
          });
          continue;
        }

        if (routeType === 'risk') {
          registerDrafts.risks.push({
            _id: `quick_risk_${Date.now()}_${registerDrafts.risks.length}`,
            visible: true,
            public: true,
            rowColor: null,
            category: 'Quick capture',
            riskdetails: item.cleanedText,
            mitigationaction: '',
            notes: 'Captured on mobile',
            raised: today,
            owner: captureOwner,
            level: 'Medium',
            createdAt: ts,
            updatedAt: ts,
          });
          continue;
        }

        if (routeType === 'issue') {
          registerDrafts.issues.push({
            _id: `quick_issue_${Date.now()}_${registerDrafts.issues.length}`,
            visible: true,
            public: true,
            rowColor: null,
            issueassignedto: captureOwner,
            description: item.cleanedText,
            currentstatus: 'Captured on mobile',
            status: 'Open',
            raised: today,
            target: captureDueDate,
            update: today,
            completed: '',
            createdAt: ts,
            updatedAt: ts,
          });
          continue;
        }

        if (routeType === 'decision') {
          registerDrafts.decisions.push({
            _id: `quick_decision_${Date.now()}_${registerDrafts.decisions.length}`,
            visible: true,
            public: true,
            rowColor: null,
            decision: item.cleanedText,
            decidedby: captureOwner,
            dateraised: today,
            datedecided: '',
            rationale: '',
            impact: '',
            status: 'Open',
            createdAt: ts,
            updatedAt: ts,
          });
          continue;
        }

        registerDrafts.minutes.push({
          _id: `quick_meeting_${Date.now()}_${registerDrafts.minutes.length}`,
          visible: true,
          public: true,
          rowColor: null,
          dateraised: today,
          minutedescription: item.cleanedText,
          status: 'Open',
          createdAt: ts,
          updatedAt: ts,
        });
      }

      Object.entries(registerDrafts).forEach(([registerType, entries]) => {
        if (!entries.length) return;
        const created = addRegisterItems(registerType, entries);
        created.forEach((item) => {
          createdForUndo.push({ kind: 'register', registerType, item });
        });
      });

      if (createdForUndo.length > 0) {
        setUndoAction({
          message: createdForUndo.length === 1
            ? 'Item captured.'
            : `${createdForUndo.length} items captured.`,
          actionLabel: 'Undo',
          onUndo: async () => {
            for (const created of [...createdForUndo].reverse()) {
              if (created.kind === 'task') {
                await deleteTodo(created.item._id);
              } else if (created.kind === 'register') {
                deleteRegisterItem(created.registerType, created.item._id);
              }
            }
            setQuickCaptureStatus('Capture undone.');
            setUndoAction(null);
          },
        });
      }

      const statusBase = quickCaptureMode === 'smart' && quickCaptureItems.length > 1
        ? `Captured ${quickCaptureRouteBreakdown}.`
        : isOnline
          ? `${activeCaptureRoute.meta.label} added to ${activeCaptureRoute.meta.destination}.`
          : `${activeCaptureRoute.meta.label} saved offline. It will sync when your connection returns.`;

      setQuickCaptureStatus(
        isOnline || quickCaptureMode !== 'smart' || quickCaptureItems.length <= 1
          ? statusBase
          : `Saved offline: ${quickCaptureRouteBreakdown}.`
      );

      setQuickCaptureText('');
      setIsQuickCaptureOpen(false);
    } finally {
      setQuickCaptureSaving(false);
    }
  }, [
    activeCaptureRoute,
    addRegisterItems,
    addTodo,
    deleteRegisterItem,
    deleteTodo,
    isOnline,
    projectId,
    quickCaptureItems,
    quickCaptureMode,
    quickCaptureRouteBreakdown,
    quickCaptureSaving,
    setUndoAction,
  ]);

  return {
    activeCaptureRoute,
    handleCloseQuickCapture,
    handleOpenQuickCapture,
    handleSubmitQuickCapture,
    isQuickCaptureOpen,
    quickCaptureMode,
    quickCaptureRouteBreakdown,
    quickCaptureSaving,
    quickCaptureStatus,
    quickCaptureSuggestion,
    quickCaptureText,
    setQuickCaptureMode,
    setQuickCaptureText,
  };
}
