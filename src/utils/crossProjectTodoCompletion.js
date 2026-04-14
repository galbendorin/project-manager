import { patchRegisterItemInState } from '../hooks/projectData/registers.js';

export const buildCrossProjectTodoUpdateData = (project, completion, nowIso) => {
  if (!project || !completion?.kind) return null;

  if (completion.kind === 'register') {
    const nextRegisters = patchRegisterItemInState(
      project.registers || {},
      completion.registerType,
      completion.itemId,
      completion.patch,
      nowIso
    );

    return {
      nextProject: {
        ...project,
        registers: nextRegisters,
        updated_at: nowIso,
      },
      updateData: {
        registers: nextRegisters,
        updated_at: nowIso,
      },
    };
  }

  if (completion.kind === 'tracker') {
    const nextTracker = (project.tracker || []).map((item) => (
      item._id === completion.trackerId
        ? { ...item, ...completion.patch }
        : item
    ));

    return {
      nextProject: {
        ...project,
        tracker: nextTracker,
        updated_at: nowIso,
      },
      updateData: {
        tracker: nextTracker,
        updated_at: nowIso,
      },
    };
  }

  if (completion.kind === 'schedule') {
    const nextTasks = (project.tasks || []).map((task) => (
      task.id === completion.taskId
        ? { ...task, ...completion.patch, updatedAt: nowIso }
        : task
    ));

    return {
      nextProject: {
        ...project,
        tasks: nextTasks,
        updated_at: nowIso,
      },
      updateData: {
        tasks: nextTasks,
        updated_at: nowIso,
      },
    };
  }

  return null;
};
