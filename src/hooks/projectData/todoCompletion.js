export const getTodoCompletionDescriptor = (todo, currentDate, nowIso) => {
  if (!todo) return null;

  if (!todo.isDerived) {
    return {
      kind: 'manual',
      todoId: todo._id,
      key: 'status',
      value: 'Done'
    };
  }

  if (todo.originType === 'register' && todo.originRegisterType && todo.originItemId) {
    if (todo.originRegisterType === 'actions') {
      return {
        kind: 'register',
        registerType: 'actions',
        itemId: todo.originItemId,
        patch: {
          status: 'Completed',
          completed: currentDate,
          update: currentDate
        }
      };
    }

    if (todo.originRegisterType === 'issues') {
      return {
        kind: 'register',
        registerType: 'issues',
        itemId: todo.originItemId,
        patch: {
          status: 'Resolved',
          completed: currentDate,
          update: currentDate
        }
      };
    }

    if (todo.originRegisterType === 'changes') {
      return {
        kind: 'register',
        registerType: 'changes',
        itemId: todo.originItemId,
        patch: {
          status: 'Implemented',
          complete: currentDate,
          updated: currentDate
        }
      };
    }
  }

  if (todo.originType === 'tracker' && todo.originItemId) {
    return {
      kind: 'tracker',
      trackerId: todo.originItemId,
      patch: {
        status: 'Completed',
        lastUpdated: currentDate,
        updatedAt: nowIso
      }
    };
  }

  if (todo.originType === 'schedule' && todo.originTaskId !== null && todo.originTaskId !== undefined) {
    return {
      kind: 'schedule',
      taskId: todo.originTaskId,
      patch: {
        pct: 100
      }
    };
  }

  return null;
};
