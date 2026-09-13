// Fast, non-DOM text width measurement via a single reused offscreen canvas —
// used to auto-fit the Message column to whatever's actually on screen (see
// LogTable/SearchResultsDock), without laying out real DOM nodes just to find
// out how wide a string would render.
let canvas: HTMLCanvasElement | null = null;

export function measureTextWidth(text: string, font: string): number {
  if (!canvas) canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
}
