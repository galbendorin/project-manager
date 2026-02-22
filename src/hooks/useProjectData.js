import { useState, useCallback, useEffect, useRef } from 'react';
import { calculateSchedule, getNextId, getCurrentDate, getFinishDate, keyGen } from '../utils/helpers';
import { DEFAULT_TASK, SCHEMAS, DEFAULT_STATUS_REPORT } from '../utils/constants';
import { supabase } from '../lib/supabase';

// Helper: get ISO timestamp
const now = () => new Date().toISOString();

/**
 * Custom hook for managing project data (tasks, registers, tracker, and status report)
 * With Supabase persistence, baseline support, and timestamps
 */
export const useProjectData = (projectId, userId = null) => {
  const [projectData, setProjectData] = useState([]);
  const [registers, setRegisters] = useState({
    risks: [],
    issues: [],
    actions: [],
    minutes: [],
    costs: [],
    changes: [],
    comms: []
  });
  const [tracker, setTracker] = useState([]);
  const [statusReport, setStatusReport] = useState({ ...DEFAULT_STATUS_REPORT });
  const [baseline, setBaselineState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [saveConflict, setSaveConflict] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const initialLoadDone = useRef(false);
  const saveTimeoutRef = useRef(null);
  const projectVersionRef = useRef(1);

  // Load project data from Supabase
  const loadProject = useCallback(async () => {
    if (!projectId) return;

    setLoadingData(true);
    initialLoadDone.current = false;
    setSaveConflict(false);
    setSaveError(null);

    let loadQuery = supabase
      .from('projects')
      .select('tasks, registers, baseline, tracker, status_report, version')
      .eq('id', projectId);
    if (userId) loadQuery = loadQuery.eq('user_id', userId);
    const { data, error } = await loadQuery.single();

    if (!error && data) {
      // Backfill timestamps on load for any items missing them
      const backfillTimestamps = (items) => {
        if (!items || !Array.isArray(items)) return items;
        return items.map(item => ({
          ...item,
          createdAt: item.createdAt || item.dateAdded || now(),
          updatedAt: item.updatedAt || item.lastUpdated || now()
        }));
      };

      const backfillTasks = (tasks) => {
        if (!tasks || !Array.isArray(tasks)) return tasks;
        return tasks.map(t => ({
          ...t,
          createdAt: t.createdAt || now(),
          updatedAt: t.updatedAt || now()
        }));
      };

      const loadedRegisters = data.registers || {
        risks: [], issues: [], actions: [],
        minutes: [], costs: [], changes: [], comms: []
      };

      // Backfill all registers
      const backfilledRegisters = {};
      Object.keys(loadedRegisters).forEach(key => {
        backfilledRegisters[key] = backfillTimestamps(loadedRegisters[key]);
      });

      setProjectData(backfillTasks(data.tasks || []));
      setRegisters(backfilledRegisters);
      setBaselineState(data.baseline || null);
      setTracker(backfillTimestamps(data.tracker || []));
      setStatusReport(data.status_report || { ...DEFAULT_STATUS_REPORT });
      projectVersionRef.current = Number.isInteger(data.version) ? data.version : 1;
    } else if (error) {
      setSaveError(`Unable to load project: ${error.message}`);
    }

    setLoadingData(false);
    setTimeout(() => {
      initialLoadDone.current = true;
    }, 500);
  }, [projectId, userId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Auto-save to Supabase (debounced)
  useEffect(() => {
    if (!projectId || !initialLoadDone.current || saveConflict) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      setSaveError(null);
      const updateData = {
        tasks: projectData,
        registers: registers,
        tracker: tracker,
        status_report: statusReport,
        updated_at: new Date().toISOString()
      };
      if (baseline !== undefined) {
        updateData.baseline = baseline;
      }

      const expectedVersion = projectVersionRef.current;

      let saveQuery = supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId)
        .eq('version', expectedVersion)
        .select('version');
      if (userId) saveQuery = saveQuery.eq('user_id', userId);
      const { data, error } = await saveQuery.maybeSingle();

      if (!error && data && Number.isInteger(data.version)) {
        projectVersionRef.current = data.version;
        setLastSaved(new Date());
        setSaveConflict(false);
      } else if (!error && !data) {
        setSaveConflict(true);
        setSaveError('Save conflict detected. This project was changed in another tab or session. Click Reload Latest.');
      } else if (error) {
        setSaveError(`Save failed: ${error.message}`);
      }

      setSaving(false);
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [projectData, registers, tracker, statusReport, baseline, projectId, userId, saveConflict]);

  const reloadProject = useCallback(async () => {
    await loadProject();
  }, [loadProject]);

  // Set baseline
  const setBaseline = useCallback(() => {
    const baselineData = projectData.map(task => ({
      id: task.id,
      start: task.start,
      dur: task.dur,
      finish: getFinishDate(task.start, task.dur)
    }));
    setBaselineState(baselineData);
  }, [projectData]);

  const clearBaseline = useCallback(() => {
    setBaselineState(null);
  }, []);

  // Add a new task — with timestamps
  const addTask = useCallback((taskData, insertAfterId = null) => {
    setProjectData(prev => {
      const newTask = {
        ...DEFAULT_TASK,
        ...taskData,
        id: getNextId(prev),
        createdAt: now(),
        updatedAt: now()
      };

      if (insertAfterId !== null) {
        const idx = prev.findIndex(t => t.id === insertAfterId);
        const newData = [...prev];
        newData.splice(idx + 1, 0, newTask);
        return calculateSchedule(newData);
      }

      return calculateSchedule([...prev, newTask]);
    });
  }, []);

  // Update a task — stamp updatedAt
  const updateTask = useCallback((taskId, updates) => {
    setProjectData(prev => {
      const newData = prev.map(task =>
        task.id === taskId ? { ...task, ...updates, updatedAt: now() } : task
      );
      return calculateSchedule(newData);
    });

    // Also update tracker if this task is tracked
    setTracker(prev => {
      const trackerItem = prev.find(t => t.taskId === taskId);
      if (!trackerItem) return prev;
      return prev.map(item => {
        if (item.taskId === taskId) {
          const updatedItem = { ...item, updatedAt: now(), lastUpdated: getCurrentDate() };
          if (updates.name) updatedItem.taskName = updates.name;
          if (updates.pct !== undefined) {
            if (updates.pct === 100) updatedItem.status = 'Completed';
            else if (updates.pct > 0 && updatedItem.status === 'Not Started') updatedItem.status = 'In Progress';
          }
          return updatedItem;
        }
        return item;
      });
    });
  }, []);

  // Delete a task
  const deleteTask = useCallback((taskId) => {
    setProjectData(prev => prev.filter(t => t.id !== taskId));
    setRegisters(prev => ({
      ...prev,
      actions: prev.actions.filter(a => a._id !== `track_${taskId}`)
    }));
    setTracker(prev => prev.filter(t => t.taskId !== taskId));
  }, []);

  // Modify hierarchy — stamp updatedAt
  const modifyHierarchy = useCallback((taskId, delta) => {
    setProjectData(prev => {
      return prev.map(task => {
        if (task.id === taskId) {
          return {
            ...task,
            indent: Math.max(0, (task.indent || 0) + delta),
            updatedAt: now()
          };
        }
        return task;
      });
    });
  }, []);

  // Toggle task tracking (actions register)
  const toggleTrackTask = useCallback((taskId, isTracked) => {
    updateTask(taskId, { tracked: isTracked });
    
    const task = projectData.find(t => t.id === taskId);
    if (!task) return;

    const actionId = `track_${taskId}`;
    
    if (isTracked) {
      setRegisters(prev => {
        const exists = prev.actions.find(a => a._id === actionId);
        if (exists) return prev;
        return {
          ...prev,
          actions: [...prev.actions, {
            _id: actionId,
            number: "Lnk",
            visible: true,
            public: true,
            category: "Task",
            actionassignedto: "PM",
            description: task.name,
            currentstatus: "Tracked from Schedule",
            status: task.pct === 100 ? "Completed" : "In Progress",
            raised: task.start,
            target: getFinishDate(task.start, task.dur),
            update: getCurrentDate(),
            completed: "",
            createdAt: now(),
            updatedAt: now()
          }]
        };
      });
    } else {
      setRegisters(prev => ({
        ...prev,
        actions: prev.actions.filter(a => a._id !== actionId)
      }));
    }
  }, [projectData, updateTask]);

  // Update tracked actions
  const updateTrackedActions = useCallback((task) => {
    setRegisters(prev => {
      const actionId = `track_${task.id}`;
      const newActions = prev.actions.map(action => {
        if (action._id === actionId) {
          return {
            ...action,
            description: task.name,
            raised: task.start,
            target: getFinishDate(task.start, task.dur),
            status: task.pct === 100 ? "Completed" : "In Progress",
            updatedAt: now()
          };
        }
        return action;
      });
      return { ...prev, actions: newActions };
    });
  }, []);

  // ==================== TRACKER FUNCTIONS ====================

  const sendToTracker = useCallback((taskId) => {
    const task = projectData.find(t => t.id === taskId);
    if (!task) return;

    setTracker(prev => {
      if (prev.find(t => t.taskId === taskId)) return prev;
      return [...prev, {
        _id: `tracker_${taskId}_${Date.now()}`,
        taskId: taskId,
        taskName: task.name,
        notes: '',
        status: task.pct === 100 ? 'Completed' : task.pct > 0 ? 'In Progress' : 'Not Started',
        rag: 'Green',
        nextAction: '',
        owner: '',
        dateAdded: getCurrentDate(),
        lastUpdated: getCurrentDate(),
        createdAt: now(),
        updatedAt: now()
      }];
    });
  }, [projectData]);

  const removeFromTracker = useCallback((trackerId) => {
    setTracker(prev => prev.filter(t => t._id !== trackerId));
  }, []);

  const updateTrackerItem = useCallback((trackerId, key, value) => {
    setTracker(prev => prev.map(item =>
      item._id === trackerId
        ? { ...item, [key]: value, lastUpdated: getCurrentDate(), updatedAt: now() }
        : item
    ));
  }, []);

  const isInTracker = useCallback((taskId) => {
    return tracker.some(t => t.taskId === taskId);
  }, [tracker]);

  // ==================== STATUS REPORT FUNCTIONS ====================

  const updateStatusReport = useCallback((key, value) => {
    setStatusReport(prev => ({ ...prev, [key]: value }));
  }, []);

  // ==================== TEMPLATE ====================

  const loadTemplate = useCallback(() => {
    const ts = now();
    const templateStart = getCurrentDate();
    const templateData = [];
    let nextId = 1;

    const addTemplateTask = (overrides = {}) => {
      const task = {
        id: nextId++,
        name: 'New Task',
        type: 'Task',
        start: templateStart,
        dur: 1,
        pct: 0,
        parent: null,
        depType: 'FS',
        indent: 0,
        tracked: false,
        createdAt: ts,
        updatedAt: ts,
        ...overrides
      };
      templateData.push(task);
      return task.id;
    };

    // 1) Program Mobilization
    addTemplateTask({ name: 'Program Mobilization', indent: 0 });
    const contractSignatureId = addTemplateTask({
      name: 'Contract signature and commercial approval',
      type: 'Milestone',
      dur: 0,
      pct: 100,
      indent: 1
    });
    const kickoffId = addTemplateTask({
      name: 'Kickoff meeting with client, delivery, and carrier teams',
      type: 'Milestone',
      dur: 0,
      pct: 100,
      parent: contractSignatureId,
      depType: 'FS',
      indent: 1
    });
    addTemplateTask({
      name: 'Governance cadence, RAID ownership, and reporting cadence agreed',
      dur: 2,
      pct: 100,
      parent: kickoffId,
      depType: 'FS',
      indent: 1
    });

    // 2) Discovery and Design
    addTemplateTask({ name: 'Discovery and Design', indent: 0 });
    const siteDataPackId = addTemplateTask({
      name: 'Site data packs collected for 10 locations',
      dur: 5,
      pct: 60,
      rowColor: 'amber',
      parent: kickoffId,
      depType: 'FS',
      indent: 1
    });
    const hldApprovedId = addTemplateTask({
      name: 'High-level SD-WAN design approved',
      type: 'Milestone',
      dur: 0,
      pct: 25,
      parent: siteDataPackId,
      depType: 'FS',
      indent: 1
    });
    const securityPolicyApprovedId = addTemplateTask({
      name: 'Security and segmentation policy approved',
      type: 'Milestone',
      dur: 0,
      pct: 0,
      parent: hldApprovedId,
      depType: 'FS',
      indent: 1
    });
    const orchestratorTemplateId = addTemplateTask({
      name: 'SD-WAN controller templates and policy objects built',
      dur: 4,
      pct: 0,
      parent: securityPolicyApprovedId,
      depType: 'FS',
      indent: 1,
      tracked: true
    });

    // 3) Carrier Ordering
    addTemplateTask({ name: 'Carrier Ordering', indent: 0 });
    const submitOrdersId = addTemplateTask({
      name: 'Submit 10 Ethernet circuit orders',
      type: 'Milestone',
      dur: 0,
      pct: 0,
      parent: hldApprovedId,
      depType: 'FS',
      indent: 1
    });
    const orderValidationId = addTemplateTask({
      name: 'Validate order references, addresses, and target RFS dates',
      dur: 3,
      pct: 0,
      rowColor: 'brown',
      parent: submitOrdersId,
      depType: 'FS',
      indent: 1,
      tracked: true
    });

    // 4) Ethernet Circuit Delivery (10 sites)
    addTemplateTask({ name: 'Ethernet Circuit Delivery (10 sites)', indent: 0 });
    const circuitInstallIds = [];

    for (let i = 1; i <= 10; i++) {
      const surveyId = addTemplateTask({
        name: `Site ${i} - Access survey and LOA confirmed`,
        dur: 2,
        pct: 0,
        parent: orderValidationId,
        depType: 'FS',
        indent: 1
      });

      const installId = addTemplateTask({
        name: `Site ${i} - Ethernet circuit install and light-level test`,
        dur: 3,
        pct: i === 1 ? 100 : i === 2 ? 45 : 0,
        rowColor: i === 4 ? 'red' : undefined,
        parent: surveyId,
        depType: 'FS',
        indent: 1,
        tracked: true
      });

      circuitInstallIds.push(installId);
    }

    const circuitsDeliveredId = addTemplateTask({
      name: 'All 10 Ethernet circuits delivered',
      type: 'Milestone',
      dur: 0,
      pct: 0,
      indent: 1,
      dependencies: circuitInstallIds.map((installId) => ({ parentId: installId, depType: 'FS' })),
      depLogic: 'ALL'
    });

    // 5) SD-WAN Migration and Handover
    addTemplateTask({ name: 'SD-WAN Migration and Handover', indent: 0 });
    const migrationReadinessId = addTemplateTask({
      name: 'Migration readiness gate (templates + circuits complete)',
      type: 'Milestone',
      dur: 0,
      pct: 0,
      indent: 1,
      dependencies: [
        { parentId: orchestratorTemplateId, depType: 'FS' },
        { parentId: circuitsDeliveredId, depType: 'FS' }
      ],
      depLogic: 'ALL'
    });
    const pilotCutoverId = addTemplateTask({
      name: 'Pilot site cutover and rollback validation',
      dur: 2,
      pct: 0,
      parent: migrationReadinessId,
      depType: 'FS',
      indent: 1,
      tracked: true
    });
    const waveOneCutoverId = addTemplateTask({
      name: 'Cutover Wave 1 (4 sites)',
      dur: 4,
      pct: 0,
      parent: pilotCutoverId,
      depType: 'FS',
      indent: 1,
      tracked: true
    });
    const waveTwoCutoverId = addTemplateTask({
      name: 'Cutover Wave 2 (6 sites)',
      dur: 6,
      pct: 0,
      parent: waveOneCutoverId,
      depType: 'FS',
      indent: 1,
      tracked: true
    });
    const serviceAcceptanceId = addTemplateTask({
      name: 'Service acceptance signed by customer',
      type: 'Milestone',
      dur: 0,
      pct: 0,
      parent: waveTwoCutoverId,
      depType: 'FS',
      indent: 1
    });
    addTemplateTask({
      name: 'Hypercare complete and handover to BAU operations',
      type: 'Milestone',
      dur: 0,
      pct: 0,
      parent: serviceAcceptanceId,
      depType: 'FS',
      indent: 1
    });

    setProjectData(calculateSchedule(templateData));
  }, [setProjectData]);

  const loadDemoDataAllTabs = useCallback(() => {
    const ts = now();
    const today = getCurrentDate();
    const plusDays = (days) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    const makeRegisterItem = (id, data) => ({
      _id: id,
      public: true,
      visible: true,
      createdAt: ts,
      updatedAt: ts,
      ...data
    });

    // Reuse the SD-WAN schedule demo template
    loadTemplate();

    setRegisters({
      risks: [
        makeRegisterItem('risk_demo_1', {
          number: 1,
          category: 'Carrier',
          riskdetails: 'RFS dates for 3 circuits may slip due to access permit constraints at customer sites.',
          mitigationaction: 'Escalate permits weekly and hold backup cutover windows in migration plan.',
          notes: 'Top risk for delivery timeline.',
          raised: today,
          owner: 'Delivery Manager',
          level: 'High'
        }),
        makeRegisterItem('risk_demo_2', {
          number: 2,
          category: 'Technical',
          riskdetails: 'Incorrect LAN segmentation mapping could impact policy rollout consistency.',
          mitigationaction: 'Run design checkpoint and pre-cutover policy validation in lab.',
          notes: 'Linked to design sign-off.',
          raised: plusDays(1),
          owner: 'Network Architect',
          level: 'Medium'
        }),
        makeRegisterItem('risk_demo_3', {
          number: 3,
          category: 'Operational',
          riskdetails: 'Local site contacts may be unavailable during planned change windows.',
          mitigationaction: 'Confirm contacts in Comms Plan and send 72h/24h reminders.',
          notes: 'Can delay same-day cutovers.',
          raised: plusDays(2),
          owner: 'Project Manager',
          level: 'Medium'
        })
      ],
      issues: [
        makeRegisterItem('issue_demo_1', {
          number: 1,
          issueassignedto: 'Carrier Service Desk',
          description: 'Site 4 handoff device delivered with wrong port profile.',
          currentstatus: 'Replacement requested and ETA confirmed.',
          status: 'In Progress',
          raised: today,
          target: plusDays(3),
          update: plusDays(1),
          completed: ''
        }),
        makeRegisterItem('issue_demo_2', {
          number: 2,
          issueassignedto: 'Customer Firewall Team',
          description: 'NAT exemption missing for orchestrator API reachability from pilot site.',
          currentstatus: 'Change request approved and scheduled.',
          status: 'Open',
          raised: plusDays(1),
          target: plusDays(4),
          update: plusDays(2),
          completed: ''
        }),
        makeRegisterItem('issue_demo_3', {
          number: 3,
          issueassignedto: 'Field Engineer',
          description: 'Site 2 CPE rack space blocked by legacy equipment.',
          currentstatus: 'Relocation completed and install resumed.',
          status: 'Completed',
          raised: plusDays(-2),
          target: today,
          update: today,
          completed: today
        })
      ],
      actions: [
        makeRegisterItem('action_demo_1', {
          number: 1,
          category: 'Delivery',
          actionassignedto: 'PMO',
          description: 'Publish weekly circuit readiness dashboard to steering team.',
          currentstatus: 'Drafted',
          status: 'In Progress',
          raised: today,
          target: plusDays(2),
          update: plusDays(1),
          completed: ''
        }),
        makeRegisterItem('action_demo_2', {
          number: 2,
          category: 'Design',
          actionassignedto: 'Network Architect',
          description: 'Finalize QoS profile mapping for voice and business-critical apps.',
          currentstatus: 'Awaiting customer confirmation.',
          status: 'Open',
          raised: plusDays(1),
          target: plusDays(5),
          update: plusDays(1),
          completed: ''
        }),
        makeRegisterItem('action_demo_3', {
          number: 3,
          category: 'Cutover',
          actionassignedto: 'Operations Lead',
          description: 'Run pilot rollback drill and evidence capture.',
          currentstatus: 'Executed in lab.',
          status: 'Completed',
          raised: plusDays(-1),
          target: today,
          update: today,
          completed: today
        })
      ],
      minutes: [
        makeRegisterItem('minutes_demo_1', {
          number: 1,
          dateraised: today,
          minutedescription: 'Steering committee approved two-wave migration model and freeze window.',
          status: 'Approved'
        }),
        makeRegisterItem('minutes_demo_2', {
          number: 2,
          dateraised: plusDays(2),
          minutedescription: 'Carrier confirmed expedited delivery for Sites 1, 2, and 3.',
          status: 'Noted'
        })
      ],
      costs: [
        makeRegisterItem('cost_demo_1', {
          number: 1,
          costdescription: 'Out-of-hours migration support - Wave 1',
          dateraised: today,
          sitename: 'Regional Hub',
          cost: '1800',
          tobechargedto: 'Project Budget',
          acceptedby: 'Finance Controller',
          date: plusDays(2),
          billing: 'Pending'
        }),
        makeRegisterItem('cost_demo_2', {
          number: 2,
          costdescription: 'Additional site survey visit',
          dateraised: plusDays(1),
          sitename: 'Site 4',
          cost: '450',
          tobechargedto: 'Change Budget',
          acceptedby: 'Project Sponsor',
          date: plusDays(3),
          billing: 'Approved'
        }),
        makeRegisterItem('cost_demo_3', {
          number: 3,
          costdescription: 'Temporary LTE backup during circuit delay',
          dateraised: plusDays(2),
          sitename: 'Site 7',
          cost: '320',
          tobechargedto: 'Operations',
          acceptedby: 'Service Manager',
          date: plusDays(4),
          billing: 'In Review'
        })
      ],
      changes: [
        makeRegisterItem('change_demo_1', {
          number: 1,
          category: 'Scope',
          assignedto: 'Project Manager',
          description: 'Include guest Wi-Fi breakout policy in phase 2 rollout.',
          impactstatus: 'Low time impact, medium design impact.',
          status: 'Under Review',
          raised: today,
          target: plusDays(5),
          updated: plusDays(1),
          complete: ''
        }),
        makeRegisterItem('change_demo_2', {
          number: 2,
          category: 'Schedule',
          assignedto: 'Delivery Manager',
          description: 'Move Wave 2 cutover from Friday to Sunday maintenance window.',
          impactstatus: 'No cost impact, improved business continuity.',
          status: 'Approved',
          raised: plusDays(1),
          target: plusDays(6),
          updated: plusDays(2),
          complete: ''
        }),
        makeRegisterItem('change_demo_3', {
          number: 3,
          category: 'Technical',
          assignedto: 'Network Architect',
          description: 'Raise underlay MTU baseline from 1500 to 1600 for encapsulation overhead.',
          impactstatus: 'Requires edge validation at 2 pilot sites.',
          status: 'Implemented',
          raised: plusDays(-1),
          target: today,
          updated: today,
          complete: today
        })
      ],
      comms: [
        makeRegisterItem('comms_demo_1', {
          company: 'Customer IT',
          name: 'Emma Lewis',
          position: 'Program Sponsor',
          mobile: '+44 7700 900101',
          phone: '+44 20 7000 0001',
          email: 'emma.lewis@example.com'
        }),
        makeRegisterItem('comms_demo_2', {
          company: 'Carrier One',
          name: 'Amit Patel',
          position: 'Service Delivery Lead',
          mobile: '+44 7700 900102',
          phone: '+44 20 7000 0002',
          email: 'amit.patel@example.com'
        }),
        makeRegisterItem('comms_demo_3', {
          company: 'Delivery Partner',
          name: 'Sara Ahmed',
          position: 'Project Manager',
          mobile: '+44 7700 900103',
          phone: '+44 20 7000 0003',
          email: 'sara.ahmed@example.com'
        })
      ]
    });

    setTracker([
      {
        _id: 'tracker_demo_1',
        taskId: 9,
        taskName: 'SD-WAN controller templates and policy objects built',
        notes: 'Policy package v0.9 ready for customer review.',
        status: 'In Progress',
        rag: 'Amber',
        nextAction: 'Close open app-priority mapping questions.',
        owner: 'Network Architect',
        dateAdded: today,
        lastUpdated: plusDays(1),
        createdAt: ts,
        updatedAt: ts
      },
      {
        _id: 'tracker_demo_2',
        taskId: 15,
        taskName: 'Site 1 - Ethernet circuit install and light-level test',
        notes: 'Waiting for carrier final acceptance report.',
        status: 'On Hold',
        rag: 'Red',
        nextAction: 'Carrier escalation on delayed closure note.',
        owner: 'Carrier Delivery Lead',
        dateAdded: plusDays(-1),
        lastUpdated: today,
        createdAt: ts,
        updatedAt: ts
      },
      {
        _id: 'tracker_demo_3',
        taskId: 37,
        taskName: 'Pilot site cutover and rollback validation',
        notes: 'Cutover checklist approved by CAB.',
        status: 'Not Started',
        rag: 'Green',
        nextAction: 'Run pre-check 24h before pilot window.',
        owner: 'Operations Lead',
        dateAdded: plusDays(1),
        lastUpdated: plusDays(1),
        createdAt: ts,
        updatedAt: ts
      }
    ]);

    setStatusReport({
      ...DEFAULT_STATUS_REPORT,
      overallRag: 'Amber',
      overallNarrative: 'Program is on track with active carrier dependency management across remaining circuits.',
      mainRisks: 'Access permit and carrier RFS variability remain the key schedule risks.',
      mainIssues: 'One pilot-site hardware mismatch and one firewall policy dependency are being managed.',
      deliverablesThisPeriod: 'Design sign-off, ordering validation, and first install completions.',
      deliverablesNextPeriod: 'Complete remaining installs and execute pilot cutover.',
      additionalNotes: 'Demo dataset loaded for client walkthrough.'
    });

    setBaselineState(null);
  }, [loadTemplate]);

  const resetDemoData = useCallback(() => {
    setProjectData([]);
    setRegisters({
      risks: [],
      issues: [],
      actions: [],
      minutes: [],
      costs: [],
      changes: [],
      comms: []
    });
    setTracker([]);
    setStatusReport({ ...DEFAULT_STATUS_REPORT });
    setBaselineState(null);
  }, []);

  // ==================== REGISTER FUNCTIONS ====================

  // Add register item — with timestamps
  const addRegisterItem = useCallback((registerType, itemData = {}) => {
    setRegisters(prev => {
      const schema = SCHEMAS[registerType];
      if (!schema) return prev;
      
      const newItem = {
        _id: Date.now().toString(),
        public: true,
        visible: true,
        createdAt: now(),
        updatedAt: now()
      };

      schema.cols.forEach(col => {
        const key = keyGen(col);
        if (col === "Visible") return;
        if (col === "Number") {
          newItem[key] = prev[registerType].length + 1;
        } else if (col.toLowerCase().includes("date") || col.toLowerCase().includes("raised")) {
          newItem[key] = getCurrentDate();
        } else {
          newItem[key] = itemData[key] || "...";
        }
      });

      return {
        ...prev,
        [registerType]: [...prev[registerType], newItem]
      };
    });
  }, []);

  // Update register item — stamp updatedAt
  const updateRegisterItem = useCallback((registerType, itemId, key, value) => {
    setRegisters(prev => ({
      ...prev,
      [registerType]: prev[registerType].map(item =>
        item._id === itemId ? { ...item, [key]: value, updatedAt: now() } : item
      )
    }));
  }, []);

  const deleteRegisterItem = useCallback((registerType, itemId) => {
    setRegisters(prev => ({
      ...prev,
      [registerType]: prev[registerType].filter(item => item._id !== itemId)
    }));
  }, []);

  const toggleItemPublic = useCallback((registerType, itemId) => {
    setRegisters(prev => ({
      ...prev,
      [registerType]: prev[registerType].map(item =>
        item._id === itemId ? { ...item, public: !item.public, updatedAt: now() } : item
      )
    }));
  }, []);

  return {
    projectData,
    registers,
    tracker,
    statusReport,
    baseline,
    saving,
    lastSaved,
    loadingData,
    saveConflict,
    saveError,
    addTask,
    updateTask,
    deleteTask,
    modifyHierarchy,
    toggleTrackTask,
    updateTrackedActions,
    loadTemplate,
    loadDemoDataAllTabs,
    resetDemoData,
    setBaseline,
    clearBaseline,
    addRegisterItem,
    updateRegisterItem,
    deleteRegisterItem,
    toggleItemPublic,
    sendToTracker,
    removeFromTracker,
    updateTrackerItem,
    isInTracker,
    updateStatusReport,
    reloadProject,
    setProjectData,
    setRegisters,
    setTracker
  };
};
