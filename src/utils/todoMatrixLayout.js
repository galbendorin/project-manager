import { MATRIX_QUADRANTS } from './todoEisenhower.js';
export const matrixHeightLimits = (isMobile) => ({ min: 240, max: isMobile ? 600 : 720, initial: isMobile ? 340 : 420 });
export function normalizeMatrixHeights(values, isMobile) {
  const { min, max, initial } = matrixHeightLimits(isMobile);
  return Object.fromEntries(MATRIX_QUADRANTS.map(({ id }) => {
    const value = values?.[id];
    return [id, typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : initial];
  }));
}
