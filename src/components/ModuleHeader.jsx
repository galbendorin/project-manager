import React from 'react';
import { getModuleHeaderCountText } from '../utils/moduleHeader';

const ModuleHeader = ({ projectName, moduleType, count, className = '' }) => {
  const countText = getModuleHeaderCountText(moduleType, count);

  return (
    <div className={className}>
      <h1 className="text-sm font-semibold text-slate-800 leading-tight truncate">
        {projectName}
      </h1>
      {countText ? (
        <p className="text-[10px] text-slate-400 font-medium">
          {countText}
        </p>
      ) : null}
    </div>
  );
};

export default React.memo(ModuleHeader);
