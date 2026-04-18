import { useCallback } from 'react';
import { loadXLSX } from '../utils/importParsers';
import { buildAiReportExportData } from '../utils/aiReportExport';
import { generateAiContent } from '../utils/aiClient';
import {
  buildReportPrompt,
  getReportSystemPrompt,
  buildEmailDigestPrompt,
  getEmailDigestSystemPrompt,
} from '../utils/aiPrompts';

export function useWorkspaceAiActions({
  aiReady,
  aiSettings,
  canUseAiReport,
  effectivePlan,
  limits,
  project,
  projectData,
  refreshProfile,
  registers,
  setImportStatus,
  statusReport,
  todos,
  tracker,
  usePlatformKey,
}) {
  const handleExportAiReport = useCallback(async ({ dateFrom, dateTo, userNotes }) => {
    try {
      setImportStatus('Exporting AI report...');
      const XLSX = await loadXLSX();
      const reportData = buildAiReportExportData({
        project,
        tasks: projectData,
        registers,
        tracker,
        statusReport,
        todos,
        userNotes,
        dateFrom,
        dateTo,
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reportData.instructionsRows), '00_INSTRUCTIONS');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.metadataRows), '01_METADATA');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.thisPeriodCompletedRows), '02_THIS_PERIOD_COMPLETED');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.keyDeliverablesNextPeriodRows), '03_NEXT_PERIOD_OPEN');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.mainRisksAndIssuesRows), '04_RISK_SIGNALS');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.governanceContextRows), '05_GOVERNANCE_CONTEXT');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.controlSignalRows), '06_CONTROL_SIGNALS');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.projectContextRows), '07_PROJECT_CONTEXT');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.additionalNotesRows), '08_ADDITIONAL_NOTES');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportData.outputTemplateRows), '09_OUTPUT_TEMPLATE');

      const fileName = `${reportData.fileNameBase}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      setImportStatus(`✓ Exported: ${fileName}`);
      setTimeout(() => setImportStatus(null), 4000);
      return { ok: true, fileName };
    } catch (err) {
      console.error('AI report export error:', err);
      setImportStatus('AI report export failed');
      setTimeout(() => setImportStatus(null), 4000);
      return { ok: false, error: err?.message || 'Unknown export error' };
    }
  }, [project, projectData, registers, setImportStatus, statusReport, todos, tracker]);

  const handleGenerateAiReport = useCallback(async ({ dateFrom, dateTo, userNotes, signal, onChunk }) => {
    if (!aiReady) {
      return { ok: false, error: 'AI not configured. Please add your API key in settings.' };
    }

    if (!canUseAiReport) {
      return {
        ok: false,
        error: `You’ve reached your AI report limit (${limits.aiReportsPerMonth}/month) for your ${effectivePlan} plan. Upgrade for more reports.`,
      };
    }

    try {
      const userMessage = buildReportPrompt({
        project,
        tasks: projectData,
        registers,
        tracker,
        statusReport,
        todos,
        userNotes,
        dateFrom,
        dateTo,
      });

      const result = await generateAiContent({
        provider: aiSettings.provider,
        apiKey: aiSettings.apiKey,
        model: aiSettings.model,
        systemPrompt: getReportSystemPrompt(),
        userMessage,
        maxTokens: 4096,
        onChunk,
        signal,
        usePlatformKey,
      });

      await refreshProfile?.();

      return result;
    } catch (err) {
      return { ok: false, error: err?.message || 'AI generation failed' };
    }
  }, [
    aiReady,
    aiSettings,
    canUseAiReport,
    effectivePlan,
    limits,
    project,
    projectData,
    refreshProfile,
    registers,
    statusReport,
    todos,
    tracker,
    usePlatformKey,
  ]);

  const handleGenerateEmailDigest = useCallback(async ({ signal, onChunk }) => {
    if (!aiReady) {
      return { ok: false, error: 'AI not configured. Please add your API key in settings.' };
    }

    if (!canUseAiReport) {
      return {
        ok: false,
        error: `You’ve reached your AI report limit (${limits.aiReportsPerMonth}/month) for your ${effectivePlan} plan. Upgrade for more reports.`,
      };
    }

    try {
      const userMessage = buildEmailDigestPrompt({
        project,
        tasks: projectData,
        registers,
        tracker,
        statusReport,
        todos,
        dateFrom: null,
        dateTo: null,
      });

      const result = await generateAiContent({
        provider: aiSettings.provider,
        apiKey: aiSettings.apiKey,
        model: aiSettings.model,
        systemPrompt: getEmailDigestSystemPrompt(),
        userMessage,
        maxTokens: 2048,
        onChunk,
        signal,
        usePlatformKey,
      });

      await refreshProfile?.();

      return result;
    } catch (err) {
      return { ok: false, error: err?.message || 'Email digest generation failed' };
    }
  }, [
    aiReady,
    aiSettings,
    canUseAiReport,
    effectivePlan,
    limits,
    project,
    projectData,
    refreshProfile,
    registers,
    statusReport,
    todos,
    tracker,
    usePlatformKey,
  ]);

  return {
    handleExportAiReport,
    handleGenerateAiReport,
    handleGenerateEmailDigest,
  };
}
