// All entrypoints (typed, voice and Add again) share partial-failure recovery.
// A retained callback may outlive its account/session; fence both sides of await.
export function createShoppingAddEntry({ addItems, isCurrent, restoreFailed }) {
  return async items => {
    if (!isCurrent()) return { cancelled: true };
    const result = await addItems(items);
    if (!isCurrent()) return { cancelled: true };
    if (result?.failedItems?.length) restoreFailed(result.failedItems);
    return result;
  };
}
