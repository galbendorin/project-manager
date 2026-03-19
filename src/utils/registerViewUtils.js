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
const LEVEL_RANK = {
  low: 1,
  medium: 2,
  high: 3,
};

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
const compareLevelValues = (a, b) => {
  const aRank = LEVEL_RANK[String(a || '').trim().toLowerCase()] || 0;
  const bRank = LEVEL_RANK[String(b || '').trim().toLowerCase()] || 0;
  if (aRank !== bRank) return aRank - bRank;
  return compareText(a, b);
};

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

const getUniqueColumns = (columns = []) => [...new Set(columns.filter(Boolean))];

const buildSortConfig = ({ schemaColumns, dateColumn, statusColumn, ownerColumn, categoryColumn, levelColumn }) => {
  const sortDefinitions = {};
  const sortOptions = [{ value: 'default', label: 'Default order' }];
  const sortOptionsByColumn = {};

  const addSortPair = (column, type, ascValue, ascLabel, descValue, descLabel) => {
    if (!column || !schemaColumns.includes(column)) return;
    sortDefinitions[ascValue] = { column, type, direction: 'asc' };
    sortDefinitions[descValue] = { column, type, direction: 'desc' };
    sortOptions.push(
      { value: ascValue, label: ascLabel },
      { value: descValue, label: descLabel }
    );
    sortOptionsByColumn[column] = [
      { value: ascValue, label: ascLabel.replace(`${column}: `, '') },
      { value: descValue, label: descLabel.replace(`${column}: `, '') }
    ];
  };

  addSortPair(dateColumn, 'date', 'dateAsc', `${dateColumn}: soonest first`, 'dateDesc', `${dateColumn}: latest first`);
  if (schemaColumns.includes('Number')) {
    addSortPair('Number', 'text', 'numberAsc', 'Number: low to high', 'numberDesc', 'Number: high to low');
  }
  addSortPair(statusColumn, 'text', 'statusAsc', `${statusColumn}: A-Z`, 'statusDesc', `${statusColumn}: Z-A`);
  addSortPair(ownerColumn, 'text', 'ownerAsc', `${ownerColumn}: A-Z`, 'ownerDesc', `${ownerColumn}: Z-A`);
  addSortPair(categoryColumn, 'text', 'categoryAsc', `${categoryColumn}: A-Z`, 'categoryDesc', `${categoryColumn}: Z-A`);
  addSortPair(levelColumn, 'level', 'levelAsc', 'Level: low to high', 'levelDesc', 'Level: high to low');

  return { sortDefinitions, sortOptions, sortOptionsByColumn };
};

export const getRegisterViewConfig = (schema, items = [], isExternalView = false) => {
  const scopedItems = (isExternalView ? items.filter(isPublicItem) : items).filter(Boolean);
  const schemaColumns = schema?.cols || [];
  const statusColumn = pickPreferredColumn(schemaColumns, STATUS_COLUMNS);
  const ownerColumn = pickPreferredColumn(schemaColumns, OWNER_COLUMNS);
  const categoryColumn = pickPreferredColumn(schemaColumns, CATEGORY_COLUMNS);
  const dateColumn = pickPreferredColumn(schemaColumns, DATE_COLUMNS);
  const levelColumn = schemaColumns.includes('Level') ? 'Level' : '';
  const filterColumns = getUniqueColumns([
    statusColumn,
    ownerColumn,
    categoryColumn,
    ...(schema?.extraFilterColumns || [])
  ]).filter((column) => schemaColumns.includes(column));
  const filterOptionsByColumn = Object.fromEntries(
    filterColumns.map((column) => [column, buildOptionList(scopedItems, column)])
  );
  const { sortDefinitions, sortOptions, sortOptionsByColumn } = buildSortConfig({
    schemaColumns,
    dateColumn,
    statusColumn,
    ownerColumn,
    categoryColumn,
    levelColumn: (schema?.extraSortColumns || []).includes('Level') ? levelColumn : ''
  });

  return {
    statusColumn,
    ownerColumn,
    categoryColumn,
    dateColumn,
    levelColumn,
    filterColumns,
    filterOptionsByColumn,
    defaultFilters: Object.fromEntries(filterColumns.map((column) => [column, 'all'])),
    statusOptions: filterOptionsByColumn[statusColumn] || [],
    ownerOptions: filterOptionsByColumn[ownerColumn] || [],
    categoryOptions: filterOptionsByColumn[categoryColumn] || [],
    sortOptions,
    sortOptionsByColumn,
    sortDefinitions,
    defaultSort: dateColumn ? 'dateAsc' : schemaColumns.includes('Number') ? 'numberAsc' : 'default'
  };
};

const sortRegisterItemsForView = (items, sortKey, config) => {
  if (!sortKey || sortKey === 'default') return items;

  const sorted = [...items];
  sorted.sort((a, b) => {
    const sortDefinition = config?.sortDefinitions?.[sortKey];
    if (!sortDefinition) {
      return compareText(
        getRegisterFieldValue(a, 'Number'),
        getRegisterFieldValue(b, 'Number')
      );
    }

    const left = getRegisterFieldValue(a, sortDefinition.column);
    const right = getRegisterFieldValue(b, sortDefinition.column);
    let comparison = 0;

    if (sortDefinition.type === 'date') {
      comparison = compareDateValues(left, right);
    } else if (sortDefinition.type === 'level') {
      comparison = compareLevelValues(left, right);
    } else {
      comparison = compareText(left, right);
    }

    if (sortDefinition.direction === 'desc') comparison *= -1;

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
  columnFilters = {},
  statusFilter = 'all',
  ownerFilter = 'all',
  categoryFilter = 'all',
  sortKey = 'default',
  config
}) => {
  let scopedItems = filterBySearch(items, searchQuery).filter((item) => (
    isExternalView ? isPublicItem(item) : true
  ));

  const mergedFilters = {
    ...(config?.defaultFilters || {}),
    ...(config?.statusColumn ? { [config.statusColumn]: statusFilter } : {}),
    ...(config?.ownerColumn ? { [config.ownerColumn]: ownerFilter } : {}),
    ...(config?.categoryColumn ? { [config.categoryColumn]: categoryFilter } : {}),
    ...columnFilters
  };

  Object.entries(mergedFilters).forEach(([column, value]) => {
    if (value === 'all' || !column) return;
    scopedItems = scopedItems.filter((item) => getRegisterFieldValue(item, column) === value);
  });

  return sortRegisterItemsForView(scopedItems, sortKey, config);
};
