// All-project reads must not mistake the API's row cap for a complete result.
export async function readCompleteTodoRows(makeQuery, { pageSize = 500, maxRows = 100000 } = {}) {
  const rows = [];
  const seen = new Set();
  let expectedCount;
  try {
  while (true) {
    const result = await makeQuery().range(rows.length, rows.length + pageSize - 1);
    if (result.error) return result;
    if (!Number.isInteger(result.count) || result.count < 0 || result.count > maxRows) {
      return { error: new Error('The complete task list could not be confirmed. Retry loading.') };
    }
    if (expectedCount !== undefined && result.count !== expectedCount) {
      return { error: new Error('Tasks changed while loading. Retry loading.') };
    }
    expectedCount = result.count;
    if (!Array.isArray(result.data) || result.data.length > pageSize) {
      return { error: new Error('Task loading returned an incomplete response.') };
    }
    for (const row of result.data) {
      if (!row.id || seen.has(row.id)) return { error: new Error('Task loading changed while paging. Retry loading.') };
      seen.add(row.id);
      rows.push(row);
    }
    if (rows.length === expectedCount) return { data: rows, count: expectedCount, error: null };
    if (rows.length > expectedCount || !result.data.length) {
      return { error: new Error('Task loading was incomplete. Retry loading.') };
    }
  }
  } catch (error) {
    return { error };
  }
}
