import { filterBySearch, keyGen, parseDateValue } from './helpers.js';

const STATUS_COLUMNS = ['Status', 'Current Status'];
const OWNER_COLUMNS = [
  'Action Assigned to',
  'Issue Assigned to',
  'Assigned to',
  'Owner',
  'Name',
  'Audience',
  'Raised By',
  'Decided By',
  'Accepted by',
  'To be charged to'
];
const CATEGORY_COLUMNS = ['Category', 'Type', 'Phase'];
const DATE_COLUMNS = [
  'Target',
  'Date',
  'Date Raised',
  'Date Decided',
  'Raised',
  'Updated',
  'Update',
  'Completed',
  'Complete'
];

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
});

const hasValue = (value) => String(value ?? '').trim().length > 0;
const isPublicItem = (item) => item?.public !== false;

const pickPreferredColumn = (columns = [], preferredColumns = []) => {
  const available = new Set(columns);
  return preferredColumns.find((column) => available.has(column)) || '';
};

export const getRegisterFieldValue = (item, column) => {
  if (!item || !column) return '';
  const key = keyGen(column);
  return item[key] ?? item[column] ?? '';
};

const compareText = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''));

const compareDateValues = (a, b) => {
  const aDate = parseDateValue(a);
  const bDate = parseDateValue(b);

  if (aDate && bDate) return aDate.getTime() - bDate.getTime();
  if (aDate) return -1;
  if (bDate) return 1;
  return 0;
};

const buildOptionList = (items, column) => {
  if (!column) return [];
  const unique = new Set();

  items.forEach((item) => {
    const value = getRegisterFieldValue(item, column);
    if (hasValue(value)) {
      unique.add(String(value).trim());
    }
  });

  return [...unique].sort(compareText);
};

export const getRegisterViewConfig = (schema, items = [], isExternalView = false) => {
  const scopedItems = (isExternalView ? items.filter(isPublicItem) : items).filter(Boolean);
  const schemaColumns = schema?.cols || [];
  const statusColumn = pickPreferredColumn(schemaColumns, STATUS_COLUMNS);
  const ownerColumn = pickPreferredColumn(schemaColumns, OWNER_COLUMNS);
  const categoryColumn = pickPreferredColumn(schemaColumns, CATEGORY_COLUMNS);
  const dateColumn = pickPreferredColumn(schemaColumns, DATE_COLUMNS);
  const hasNumberColumn = schemaColumns.includes('Number');

  const sortOptions = [];
  if (dateColumn) {
    sortOptions.push(
      { value: 'dateAsc', label: `${dateColumn}: soonest first` },
      { value: 'dateDesc', label: `${dateColumn}: latest first` }
    );
  }
  if (hasNumberColumn) {
    sortOptions.push({ value: 'numberAsc', label: 'Number' });
  }
  if (statusColumn) {
    sortOptions.push({ value: 'statusAsc', label: statusColumn });
  }
  if (ownerColumn) {
    sortOptions.push({ value: 'ownerAsc', label: ownerColumn });
  }
  if (categoryColumn) {
    sortOptions.push({ value: 'categoryAsc', label: categoryColumn });
  }
  if (sortOptions.length === 0) {
    sortOptions.push({ value: 'default', label: 'Default order' });
  }

  return {
    statusColumn,
    ownerColumn,
    categoryColumn,
    dateColumn,
    statusOptions: buildOptionList(scopedItems, statusColumn),
    ownerOptions: buildOptionList(scopedItems, ownerColumn),
    categoryOptions: buildOptionList(scopedItems, categoryColumn),
    sortOptions,
    defaultSort: dateColumn ? 'dateAsc' : hasNumberColumn ? 'numberAsc' : 'default'
  };
};

const sortRegisterItemsForView = (items, sortKey, config) => {
  if (!sortKey || sortKey === 'default') return items;

  const sorted = [...items];
  sorted.sort((a, b) => {
    let comparison = 0;

    switch (sortKey) {
      case 'dateAsc':
        comparison = compareDateValues(
          getRegisterFieldValue(a, config.dateColumn),
          getRegisterFieldValue(b, config.dateColumn)
        );
        break;
      case 'dateDesc':
        comparison = compareDateValues(
          getRegisterFieldValue(b, config.dateColumn),
          getRegisterFieldValue(a, config.dateColumn)
        );
        break;
      case 'statusAsc':
        comparison = compareText(
          getRegisterFieldValue(a, config.statusColumn),
          getRegisterFieldValue(b, config.statusColumn)
        );
        break;
      case 'ownerAsc':
        comparison = compareText(
          getRegisterFieldValue(a, config.ownerColumn),
          getRegisterFieldValue(b, config.ownerColumn)
        );
        break;
      case 'categoryAsc':
        comparison = compareText(
          getRegisterFieldValue(a, config.categoryColumn),
          getRegisterFieldValue(b, config.categoryColumn)
        );
        break;
      case 'numberAsc':
      default:
        comparison = compareText(
          getRegisterFieldValue(a, 'Number'),
          getRegisterFieldValue(b, 'Number')
        );
        break;
    }

    if (comparison !== 0) return comparison;
    return compareText(
      getRegisterFieldValue(a, 'Number'),
      getRegisterFieldValue(b, 'Number')
    );
  });

  return sorted;
};

export const applyRegisterView = ({
  items = [],
  searchQuery = '',
  isExternalView = false,
  statusFilter = 'all',
  ownerFilter = 'all',
  categoryFilter = 'all',
  sortKey = 'default',
  config
}) => {
  let scopedItems = filterBySearch(items, searchQuery).filter((item) => (
    isExternalView ? isPublicItem(item) : true
  ));

  if (statusFilter !== 'all' && config?.statusColumn) {
    scopedItems = scopedItems.filter((item) => getRegisterFieldValue(item, config.statusColumn) === statusFilter);
  }
  if (ownerFilter !== 'all' && config?.ownerColumn) {
    scopedItems = scopedItems.filter((item) => getRegisterFieldValue(item, config.ownerColumn) === ownerFilter);
  }
  if (categoryFilter !== 'all' && config?.categoryColumn) {
    scopedItems = scopedItems.filter((item) => getRegisterFieldValue(item, config.categoryColumn) === categoryFilter);
  }

  return sortRegisterItemsForView(scopedItems, sortKey, config);
};
