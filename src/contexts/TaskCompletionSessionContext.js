import { createContext, useContext } from 'react';

export const TaskCompletionSessionContext = createContext(null);

export const useTaskCompletionSession = () => useContext(TaskCompletionSessionContext);
