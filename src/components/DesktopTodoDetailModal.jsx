import React from 'react';
import TodoDetailDialog from './TodoDetailDialog';
export default function DesktopTodoDetailModal(props) {
  return <TodoDetailDialog {...props} isMobile={false} />;
}
