import React from 'react';
import TodoDetailDialog from './TodoDetailDialog';
export default function MobileTodoDetailSheet(props) {
  return <TodoDetailDialog {...props} isMobile={true} />;
}
