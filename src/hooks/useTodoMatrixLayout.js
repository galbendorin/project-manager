import { useCallback, useEffect, useRef, useState } from 'react';
import { readLocalJson, writeLocalJson } from '../utils/offlineState';
import { matrixHeightLimits, normalizeMatrixHeights } from '../utils/todoMatrixLayout';

export function useTodoMatrixLayout(currentUserId, isMobile) {
  const layout = isMobile ? 'phone' : 'desktop';
  const key = `pmworkspace:todo-matrix-layout:v1:${currentUserId}`;
  const context = `${key}:${layout}`;
  const [state, setState] = useState(() => ({ context, heights: normalizeMatrixHeights(readLocalJson(key, {})[layout], isMobile) }));
  const latest = useRef(context);
  latest.current = context;
  useEffect(() => { setState({ context, heights: normalizeMatrixHeights(readLocalJson(key, {})[layout], isMobile) }); }, [context, key, layout, isMobile]);
  const heights = state.context === context ? state.heights : normalizeMatrixHeights(null, isMobile);
  const latestHeights = useRef(heights);
  latestHeights.current = heights;
  const commit = useCallback((next) => {
    if (latest.current !== context) return;
    latestHeights.current = next;
    setState({ context, heights: next });
    if (currentUserId) writeLocalJson(key, { ...readLocalJson(key, {}), [layout]: next });
  }, [context, key, layout, currentUserId]);
  const setHeight = useCallback((id, value) => commit(normalizeMatrixHeights({ ...latestHeights.current, [id]: value }, isMobile)), [commit, isMobile]);
  const reset = useCallback(() => commit(normalizeMatrixHeights(null, isMobile)), [commit, isMobile]);
  return { heights, limits: matrixHeightLimits(isMobile), setHeight, reset };
}
