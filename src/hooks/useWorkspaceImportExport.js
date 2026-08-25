import { useCallback } from 'react';
import { SCHEMAS } from '../utils/constants';
import {
  loadXLSX,
  parseScheduleSheet,
  parseTodoSheet,
  parseRegisterSheet,
  parseRaciSheet,
  parseStatusReportSheet,
  parseTrackerSheet,
  parseWorkspaceJsonImport,
  findSheet,
  REGISTER_IMPORT_COLUMN_MAPS,
  REGISTER_IMPORT_SHEET_CANDIDATES,
  RACI_IMPORT_SHEET_CANDIDATES,
  STATUS_REPORT_IMPORT_SHEET_CANDIDATES,
  TODO_IMPORT_SHEET_CANDIDATES,
  TRACKER_IMPORT_SHEET_CANDIDATES,
} from '../utils/importParsers';

export function useWorkspaceImportExport({
  addTodo,
  project,
  projectData,
  registers,
  setImportStatus,
  setProjectData,
  setRegisters,
  setStatusReport,
  setTracker,
  statusReport,
  todos,
  tracker,
}) {
  const handleImport = useCallback(async (file) => {
    try {
      setImportStatus('Importing...');

      if (String(file?.name || '').toLowerCase().endsWith('.json')) {
        const imported = parseWorkspaceJsonImport(JSON.parse(await file.text()));
        for (const todo of imported.todos) {
          await addTodo(todo);
        }
        setProjectData(imported.tasks);
        setRegisters(imported.registers);
        setTracker(imported.tracker);
        setStatusReport(imported.statusReport);

        const registerCount = Object.entries(imported.registers)
          .filter(([key]) => key !== '_raci')
          .reduce((total, [, items]) => total + items.length, 0);
        const raciCount = imported.registers._raci?.[0]?.assignments?._customTasks?.length || 0;
        setImportStatus(
          `✓ Imported full workspace: ${imported.tasks.length} tasks, ${registerCount} register items, ${imported.tracker.length} tracker items, ${imported.todos.length} todos, ${raciCount} RACI activities`
        );
        setTimeout(() => setImportStatus(null), 5000);
        return;
      }

      const XLSX = await loadXLSX();
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const sheetNames = workbook.SheetNames;

      const scheduleSheet = findSheet(sheetNames, ['Schedule', 'Tasks', 'Gantt', 'Sheet1']) || sheetNames[0];
      const scheduleRows = XLSX.utils.sheet_to_json(workbook.Sheets[scheduleSheet], { raw: false });

      if (scheduleRows.length === 0) {
        setImportStatus('No data found in file');
        setTimeout(() => setImportStatus(null), 3000);
        return;
      }

      const tasks = parseScheduleSheet(scheduleRows);
      let importedTodosCount = 0;
      let importedTrackerCount = 0;
      let importedStatusReport = false;

      const newRegisters = {
        risks: [], issues: [], actions: [],
        minutes: [], costs: [], changes: [],
        stakeholders: [], commsplan: [], assumptions: [],
        decisions: [], lessons: [], _raci: [],
      };

      const parseIntoRegister = (sheetCandidates, mapKey, targetKey) => {
        const sheet = findSheet(sheetNames, sheetCandidates);
        if (sheet) {
          newRegisters[targetKey] = parseRegisterSheet(
            XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { raw: false }),
            REGISTER_IMPORT_COLUMN_MAPS[mapKey]
          );
        }
      };

      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.risks, 'risks', 'risks');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.issues, 'issues', 'issues');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.actions, 'actions', 'actions');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.changes, 'changes', 'changes');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.minutes, 'minutes', 'minutes');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.costs, 'costs', 'costs');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.stakeholders, 'stakeholders', 'stakeholders');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.assumptions, 'assumptions', 'assumptions');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.decisions, 'decisions', 'decisions');
      parseIntoRegister(REGISTER_IMPORT_SHEET_CANDIDATES.lessons, 'lessons', 'lessons');

      const commsSheet = findSheet(sheetNames, REGISTER_IMPORT_SHEET_CANDIDATES.comms);
      if (commsSheet) {
        const parsedLegacyComms = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[commsSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.comms
        );
        if (newRegisters.commsplan.length === 0) {
          newRegisters.commsplan = parsedLegacyComms;
        }
      }

      const commsplanSheet = findSheet(sheetNames, ['Comms Plan', 'Communication Plan', 'Communications Plan']);
      if (commsplanSheet) {
        newRegisters.commsplan = parseRegisterSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[commsplanSheet], { raw: false }),
          REGISTER_IMPORT_COLUMN_MAPS.commsplan
        );
      }

      const raciSheet = findSheet(sheetNames, RACI_IMPORT_SHEET_CANDIDATES);
      if (raciSheet) {
        const parsedRaci = parseRaciSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[raciSheet], { raw: false })
        );
        if (parsedRaci) {
          newRegisters._raci = [{
            ...parsedRaci,
            updatedAt: new Date().toISOString(),
          }];
        }
      }

      const todoSheet = findSheet(sheetNames, TODO_IMPORT_SHEET_CANDIDATES);
      if (todoSheet) {
        const parsedTodos = parseTodoSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[todoSheet], { raw: false })
        );
        for (const todo of parsedTodos) {
          await addTodo(todo);
        }
        importedTodosCount = parsedTodos.length;
      }

      const trackerSheet = findSheet(sheetNames, TRACKER_IMPORT_SHEET_CANDIDATES);
      if (trackerSheet) {
        const parsedTracker = parseTrackerSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[trackerSheet], { raw: false })
        );
        if (parsedTracker.length > 0) {
          setTracker(parsedTracker);
          importedTrackerCount = parsedTracker.length;
        }
      }

      const statusReportSheet = findSheet(sheetNames, STATUS_REPORT_IMPORT_SHEET_CANDIDATES);
      if (statusReportSheet) {
        const parsedStatusReport = parseStatusReportSheet(
          XLSX.utils.sheet_to_json(workbook.Sheets[statusReportSheet], { raw: false })
        );
        if (parsedStatusReport) {
          setStatusReport((prev) => ({ ...prev, ...parsedStatusReport }));
          importedStatusReport = true;
        }
      }

      setProjectData(tasks);
      setRegisters((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(newRegisters).map(([key, val]) => [key, val.length > 0 ? val : prev[key]])
        ),
      }));

      const summary = [
        `${tasks.length} tasks`,
        newRegisters.risks.length > 0 ? `${newRegisters.risks.length} risks` : null,
        newRegisters.issues.length > 0 ? `${newRegisters.issues.length} issues` : null,
        newRegisters.actions.length > 0 ? `${newRegisters.actions.length} actions` : null,
        newRegisters.changes.length > 0 ? `${newRegisters.changes.length} changes` : null,
        newRegisters.minutes.length > 0 ? `${newRegisters.minutes.length} meeting log items` : null,
        newRegisters.costs.length > 0 ? `${newRegisters.costs.length} costs` : null,
        newRegisters.stakeholders?.length > 0 ? `${newRegisters.stakeholders.length} stakeholders` : null,
        newRegisters.commsplan?.length > 0 ? `${newRegisters.commsplan.length} comms items` : null,
        newRegisters.assumptions?.length > 0 ? `${newRegisters.assumptions.length} assumptions` : null,
        newRegisters.decisions?.length > 0 ? `${newRegisters.decisions.length} decisions` : null,
        newRegisters.lessons?.length > 0 ? `${newRegisters.lessons.length} lessons` : null,
        importedTodosCount > 0 ? `${importedTodosCount} todos` : null,
        importedTrackerCount > 0 ? `${importedTrackerCount} tracker items` : null,
        importedStatusReport ? 'status report' : null,
        newRegisters._raci?.[0]?.assignments?._customTasks?.length > 0
          ? `${newRegisters._raci[0].assignments._customTasks.length} RACI activities`
          : null,
      ].filter(Boolean).join(', ');

      setImportStatus(`✓ Imported: ${summary}`);
      setTimeout(() => setImportStatus(null), 5000);
    } catch (err) {
      console.error('Import error:', err);
      setImportStatus('Import failed — check file format');
      setTimeout(() => setImportStatus(null), 4000);
    }
  }, [addTodo, setImportStatus, setProjectData, setRegisters, setStatusReport, setTracker]);

  const handleExport = useCallback(async () => {
    try {
      setImportStatus('Exporting...');
      const XLSX = await loadXLSX();
      const wb = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectData), 'Schedule');

      if (tracker.length > 0) {
        const trackerExport = tracker.map((item) => ({
          ID: item._id,
          'Task ID': item.taskId,
          'Task Name': item.taskName,
          Notes: item.notes,
          Status: item.status,
          RAG: item.rag,
          'Next Action': item.nextAction,
          Owner: item.owner,
          'Date Added': item.dateAdded,
          'Last Updated': item.lastUpdated,
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trackerExport), 'Master Tracker');
      }

      if (statusReport) {
        const srExport = [{
          'Overall RAG': statusReport.overallRag,
          'Overall Narrative': statusReport.overallNarrative,
          'Main Risks': statusReport.mainRisks,
          'Main Issues': statusReport.mainIssues,
          'Deliverables This Period': statusReport.deliverablesThisPeriod,
          'Deliverables Next Period': statusReport.deliverablesNextPeriod,
          'Additional Notes': statusReport.additionalNotes,
        }];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(srExport), 'Status Report');
      }

      const raciData = registers?._raci?.[0];
      const raciRoles = Array.isArray(raciData?.roles)
        ? raciData.roles.map((role) => String(role || '').trim()).filter(Boolean)
        : [];
      const raciTasks = Array.isArray(raciData?.assignments?._customTasks)
        ? raciData.assignments._customTasks
        : [];

      if (raciRoles.length > 0 && raciTasks.length > 0) {
        const raciExport = raciTasks.map((taskName, idx) => {
          const row = { Activity: taskName };
          raciRoles.forEach((role) => {
            row[role] = raciData.assignments?.[`custom-${idx}::${role}`] || '';
          });
          return row;
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(raciExport), 'RACI');
      }

      const manualTodosExport = (todos || [])
        .filter((item) => !item.isDerived && (item.projectId || null) === project.id)
        .map((item) => ({
          ID: item._id,
          Title: item.title,
          'Due Date': item.dueDate,
          Owner: item.owner,
          Status: item.status,
          Recurrence: item.recurrence?.type || '',
        }));

      if (manualTodosExport.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(manualTodosExport), 'ToDo');
      }

      Object.keys(registers).forEach((key) => {
        if (registers[key].length > 0) {
          const schema = SCHEMAS[key];
          if (schema) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(registers[key]), schema.title);
          }
        }
      });

      const fileName = `${project.name}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      setImportStatus(`✓ Exported: ${fileName}`);
      setTimeout(() => setImportStatus(null), 3000);
    } catch (err) {
      console.error('Export error:', err);
      setImportStatus('Export failed');
      setTimeout(() => setImportStatus(null), 4000);
    }
  }, [project.id, project.name, projectData, registers, setImportStatus, statusReport, todos, tracker]);

  return {
    handleExport,
    handleImport,
  };
}
