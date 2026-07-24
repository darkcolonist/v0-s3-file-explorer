/** Matches grid: repeat(auto-fill, minmax(140px, 1fr)) with gap-4 */
const GRID_MIN_COLUMN_PX = 140;
const GRID_GAP_PX = 16;
const LIST_ROW_PX = 76;
const LIST_GAP_PX = 8;
/** App header, explorer toolbar, search, card header, and page padding */
const PAGE_CHROME_PX = 380;
const HORIZONTAL_INSET_PX = 96;
export const MIN_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 150;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getGridColumns(containerWidth: number): number {
  return Math.max(1, Math.floor((containerWidth + GRID_GAP_PX) / (GRID_MIN_COLUMN_PX + GRID_GAP_PX)));
}

export type ViewportSize = { width: number; height: number };

export function computePageSize(
  viewMode: 'list' | 'grid' | 'masonry',
  viewport: ViewportSize
): number {
  const containerWidth = Math.max(320, viewport.width - HORIZONTAL_INSET_PX);
  const listAreaHeight = Math.max(240, viewport.height - PAGE_CHROME_PX);

  if (viewMode === 'list') {
    let columns = 1;
    if (viewport.width >= 1024) {
      columns = 3;
    } else if (viewport.width >= 768) {
      columns = 2;
    }
    const rows = Math.ceil(listAreaHeight / (LIST_ROW_PX + LIST_GAP_PX));
    const nextSize = clamp(columns * (rows + 1), MIN_PAGE_SIZE, MAX_PAGE_SIZE);
    return Math.ceil(nextSize / columns) * columns;
  }

  const columns = getGridColumns(containerWidth);
  const columnWidth =
    (containerWidth - (columns - 1) * GRID_GAP_PX) / columns;
  const rowHeight = columnWidth + GRID_GAP_PX;
  const rows = Math.ceil(listAreaHeight / rowHeight);
  // One extra row so wide screens don't stop short of the fold
  return clamp(columns * (rows + 1), MIN_PAGE_SIZE, MAX_PAGE_SIZE);
}

export function getViewportSize(): ViewportSize {
  if (typeof window === 'undefined') {
    return { width: 1024, height: 768 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}
