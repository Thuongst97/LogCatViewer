// Chromium clamps any single element's rendered height at 33,554,428px. The
// virtualizer sizes its scroll spacer to row count × row height, so past
// roughly 1.4M rows (at a 24px row height) the spacer stops actually growing
// — the browser's own scrollable range silently stops matching the row math,
// and every row beyond that point becomes unreachable no matter how far the
// scrollbar is dragged. Measured against a real 3.79M-line file: only the
// first ~1.6M lines could ever be scrolled to.
//
// The fix is to stop asking the DOM for a scroll range it can't represent.
// The spacer is capped at a safe height, and scroll positions are rescaled
// between the DOM's (compressed) coordinate space and the virtualizer's own
// (true) row space: reading the real scrollTop back out multiplied up, and
// dividing back down whenever the virtualizer asks to scroll somewhere. The
// scrollbar then covers the whole buffer at reduced precision — a wheel tick
// travels proportionally further — in exchange for every row being reachable.
//
// Three things make this fiddlier than it looks, and all three are load-bearing:
//
//  1. The virtualizer subscribes to scrolling exactly once, the first time its
//     scroll element is attached (`_willUpdate` in @tanstack/virtual-core). It
//     does NOT re-subscribe when the `observeElementOffset` option changes on
//     a later render. A table mounts empty, so a function built around
//     "current" scale would be captured at scale 1 and never replaced. Hence
//     one stable function identity that reads the live scale from a ref.
//  2. `getMaxScrollOffset()` reads `scrollHeight - clientHeight` straight off
//     the DOM and is used to clamp scroll targets. Left alone it clamps to the
//     compressed range while everything else works in true space, so
//     scrollToIndex (and therefore autoscroll) lands short. It's an own
//     property on the instance, so it can be wrapped after construction.
//  3. Below the safe size, every one of these is an exact no-op — scale is 1
//     and the original functions run untouched.
import { useRef } from 'react';
import { elementScroll, observeElementOffset, type Virtualizer } from '@tanstack/react-virtual';

/** A little headroom under Chromium's real 33,554,428px ceiling. */
const SAFE_ELEMENT_SIZE = 33_000_000;

type AnyVirtualizer = Virtualizer<HTMLDivElement, Element>;

export interface ScaledVirtualizerScroll {
  /** Use as the spacer's CSS height in place of the virtualizer's getTotalSize(). */
  safeTotalSize: number;
  /**
   * Subtract from each row's `virtualRow.start` when positioning it.
   *
   * The virtualizer reports row offsets in true space (which runs to tens of
   * millions), but the spacer they sit in is capped at the compressed size —
   * so a row placed at its raw `start` would land far outside its own
   * container and nothing would be visible. This shift re-anchors the
   * rendered window onto the DOM's actual scroll position: it works out to
   * `scrollTop - trueOffset`, so a row lands at `scrollTop + (start -
   * trueOffset)` — i.e. exactly where it belongs relative to the viewport,
   * still spaced a full row height apart so rows never overlap. Zero when
   * nothing is being scaled.
   */
  rowOffsetShift: number;
  scrollToFn: (
    offset: number,
    options: { adjustments?: number; behavior?: ScrollBehavior },
    instance: AnyVirtualizer
  ) => void;
  observeElementOffset: (
    instance: AnyVirtualizer,
    cb: (offset: number, isScrolling: boolean) => void
  ) => void | (() => void);
  /** Call with the instance right after useVirtualizer(); idempotent. */
  patchMaxScrollOffset: (instance: AnyVirtualizer) => void;
}

/**
 * `trueTotalSize` is row count × row height, which for these fixed-height
 * lists is exactly what the virtualizer's own getTotalSize() reports. It's
 * computed by the caller because these options are needed at construction
 * time, before an instance exists.
 */
export function useScaledVirtualizerScroll(trueTotalSize: number): ScaledVirtualizerScroll {
  // Assigned every render and read at scroll time, so the stable functions
  // below always act on the current size without being rebuilt.
  const trueTotalRef = useRef(0);
  trueTotalRef.current = trueTotalSize;
  // Updated on every scroll event below, read during the render that the same
  // event triggers — see rowOffsetShift's doc comment.
  const shiftRef = useRef(0);

  // Scale is derived from the element's live metrics rather than from total
  // size alone, because what has to line up is the *scrollable range* at each
  // end, and both ranges are short by one viewport: the DOM can only scroll to
  // `scrollHeight - clientHeight`, and the last row sits at
  // `trueTotal - clientHeight`. Dividing the totals instead leaves the final
  // screenful unreachable — measured as the last ~45 rows of a 3.79M-line
  // buffer never coming into view.
  const scaleFor = (instance: AnyVirtualizer): number => {
    const el = instance.scrollElement;
    if (!el || trueTotalRef.current <= SAFE_ELEMENT_SIZE) return 1;
    const viewport = el.clientHeight;
    const domRange = el.scrollHeight - viewport;
    const trueRange = trueTotalRef.current - viewport;
    if (domRange <= 0 || trueRange <= 0) return 1;
    return trueRange / domRange;
  };

  const fns = useRef<Omit<ScaledVirtualizerScroll, 'safeTotalSize' | 'rowOffsetShift'>>({
    scrollToFn: (offset, { adjustments = 0, behavior }, instance) => {
      const scale = scaleFor(instance);
      const target = scale === 1 ? offset + adjustments : (offset + adjustments) / scale;
      elementScroll(target, { adjustments: 0, behavior }, instance);
    },
    observeElementOffset: (instance, cb) =>
      observeElementOffset(instance, (offset, isScrolling) => {
        const trueOffset = offset * scaleFor(instance);
        // `offset` is the DOM scrollTop, `trueOffset` is where the virtualizer
        // thinks it is; the gap between them is what rows have to be pulled
        // back by to land in the compressed spacer.
        shiftRef.current = trueOffset - offset;
        cb(trueOffset, isScrolling);
      }),
    patchMaxScrollOffset: (instance) => {
      // `getMaxScrollOffset` is marked private in the typings, but it's an own
      // property assigned in the constructor (not a prototype method), so
      // wrapping it per-instance is well-defined at runtime. There's no public
      // option for it, and leaving it unwrapped is what makes scrollToIndex —
      // and therefore autoscroll — stop short of the end. Pinned to the
      // installed @tanstack/react-virtual; revisit on a major upgrade.
      const patchable = instance as unknown as {
        getMaxScrollOffset: () => number;
        __scaledMaxPatched?: boolean;
      };
      if (patchable.__scaledMaxPatched) return;
      patchable.__scaledMaxPatched = true;
      const original = patchable.getMaxScrollOffset;
      patchable.getMaxScrollOffset = () => original.call(instance) * scaleFor(instance);
    }
  }).current;

  return {
    safeTotalSize: Math.min(trueTotalSize, SAFE_ELEMENT_SIZE),
    rowOffsetShift: trueTotalSize <= SAFE_ELEMENT_SIZE ? 0 : shiftRef.current,
    scrollToFn: fns.scrollToFn,
    observeElementOffset: fns.observeElementOffset,
    patchMaxScrollOffset: fns.patchMaxScrollOffset
  };
}
