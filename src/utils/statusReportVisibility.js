/**
 * A register row is client-facing unless it has explicitly been marked
 * private. This keeps older rows (which predate the public flag) visible.
 */
export const isPublicRegisterItem = (item) => Boolean(item) && item.public !== false;

export const scopeRegisterItemsForStatusReport = (items = [], isExternalView = false) => (
  (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .filter((item) => !isExternalView || isPublicRegisterItem(item))
);

export const getStatusReportRegisterSignals = (registers = {}, isExternalView = false) => ({
  risks: scopeRegisterItemsForStatusReport(registers?.risks, isExternalView),
  issues: scopeRegisterItemsForStatusReport(registers?.issues, isExternalView),
  actions: scopeRegisterItemsForStatusReport(registers?.actions, isExternalView),
  changes: scopeRegisterItemsForStatusReport(registers?.changes, isExternalView),
});
