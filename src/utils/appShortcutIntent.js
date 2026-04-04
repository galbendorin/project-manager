const normalizeShortcutValue = (value = '') => String(value || '').trim().toLowerCase();

export const readAppShortcutIntent = (search = '') => {
  const params = new URLSearchParams(String(search || ''));
  const shortcut = normalizeShortcutValue(params.get('shortcut'));

  if (shortcut === 'tasks') {
    return {
      key: 'tasks',
      initialTab: 'todo',
      openQuickCapture: false,
    };
  }

  if (shortcut === 'capture') {
    return {
      key: 'capture',
      initialTab: 'todo',
      openQuickCapture: true,
    };
  }

  return null;
};
