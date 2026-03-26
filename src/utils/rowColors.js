export const ROW_COLOR_META = {
  red: {
    label: 'Red',
    background: '#fee2e2',
    border: '#fecaca',
    dot: '#ef4444',
  },
  amber: {
    label: 'Amber',
    background: '#fef3c7',
    border: '#fcd34d',
    dot: '#f59e0b',
  },
  brown: {
    label: 'Brown',
    background: '#d6c5b0',
    border: '#b89a74',
    dot: '#8b6b45',
  },
};

export const ROW_COLOR_OPTIONS = [
  { value: null, label: 'Default' },
  ...Object.entries(ROW_COLOR_META).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
];

export const getRowColorMeta = (rowColor) => {
  if (!rowColor) return null;
  return ROW_COLOR_META[rowColor] || null;
};

export const getRowColorBackground = (rowColor) => {
  const meta = getRowColorMeta(rowColor);
  return meta?.background || null;
};

export const getRowColorSurfaceStyle = (rowColor) => {
  const meta = getRowColorMeta(rowColor);
  if (!meta) return null;
  return {
    backgroundColor: meta.background,
    borderColor: meta.border,
  };
};
