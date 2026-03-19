export const toggleMultiFilterValue = (selectedValues = [], value) => {
  if (!value) return [...selectedValues];
  return selectedValues.includes(value)
    ? selectedValues.filter((entry) => entry !== value)
    : [...selectedValues, value];
};

export const matchesProjectSelection = (selectedValues = [], item) => {
  if (!selectedValues.length) return true;
  return selectedValues.some((value) => {
    if (value === 'other') return !item.projectId;
    return item.projectId === value;
  });
};

export const matchesSourceSelection = (selectedValues = [], item, sourceFilterKeyForItem) => {
  if (!selectedValues.length) return true;
  return selectedValues.some((value) => {
    if (value === 'manual') return !item.isDerived;
    if (value === 'derived') return item.isDerived;
    return sourceFilterKeyForItem(item) === value;
  });
};

export const matchesOwnerSelection = (selectedValues = [], item) => {
  if (!selectedValues.length) return true;
  return selectedValues.includes(item.owner || '');
};

export const matchesRecurrenceSelection = (selectedValues = [], item) => {
  if (!selectedValues.length) return true;
  return selectedValues.some((value) => {
    if (value === 'none') {
      return !item.isDerived && !item.recurrence;
    }
    return !item.isDerived && item.recurrence?.type === value;
  });
};

export const matchesBucketSelection = (selectedValues = [], bucketKey) => {
  if (!selectedValues.length) return true;
  return selectedValues.includes(bucketKey);
};

export const getMultiFilterSummary = (selectedValues = [], options = [], allLabel) => {
  if (!selectedValues.length) return allLabel;

  const labelMap = new Map(options.map((option) => [option.value, option.label]));
  const resolvedLabels = selectedValues
    .map((value) => labelMap.get(value))
    .filter(Boolean);

  if (resolvedLabels.length === 1) return resolvedLabels[0];
  if (resolvedLabels.length === 2) return resolvedLabels.join(' + ');
  return `${resolvedLabels.length} selected`;
};
