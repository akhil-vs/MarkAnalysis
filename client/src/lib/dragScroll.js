/** Movement (px) before a pointer-down becomes a drag-to-scroll. */
export const DRAG_SCROLL_THRESHOLD_PX = 6;

/** Clicks after a drag are swallowed for this long so links/buttons do not fire. */
export const DRAG_SCROLL_CLICK_SUPPRESS_MS = 50;

/**
 * Form fields keep their native pointer behavior; everything else can start a drag.
 * @param {EventTarget | null | undefined} target
 */
export function isFormControlDragTarget(target) {
  if (!target || typeof target.closest !== "function") return false;
  return Boolean(target.closest("input, select, textarea, option, [contenteditable='true']"));
}

/**
 * Start a drag-to-scroll session, or return null when this pointer should be ignored.
 * Touch is left to native scrolling.
 */
export function createDragScrollSession({
  axis = "x",
  threshold = DRAG_SCROLL_THRESHOLD_PX,
  pointerType,
  button = 0,
  target,
  startX,
  startY,
  scrollLeft = 0,
  scrollTop = 0,
} = {}) {
  if (pointerType === "touch") return null;
  if (button !== 0) return null;
  if (isFormControlDragTarget(target)) return null;
  if (!Number.isFinite(startX) || !Number.isFinite(startY)) return null;
  return {
    axis: axis === "y" ? "y" : axis === "both" ? "both" : "x",
    threshold,
    startX,
    startY,
    scrollLeft: Number(scrollLeft) || 0,
    scrollTop: Number(scrollTop) || 0,
    moved: false,
  };
}

/**
 * Apply a pointer move to an existing session.
 * @returns {{ began: boolean, moved: boolean, scrollLeft?: number, scrollTop?: number } | null}
 */
export function applyDragScrollMove(session, { clientX, clientY } = {}) {
  if (!session) return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const dx = clientX - session.startX;
  const dy = clientY - session.startY;
  if (!session.moved && Math.hypot(dx, dy) < session.threshold) {
    return { began: false, moved: false };
  }
  session.moved = true;
  const applyX = session.axis !== "y";
  const applyY = session.axis !== "x";
  return {
    began: true,
    moved: true,
    scrollLeft: session.scrollLeft - (applyX ? dx : 0),
    scrollTop: session.scrollTop - (applyY ? dy : 0),
  };
}

/**
 * Swallow the click that follows a completed drag so cells with links still stay clickable
 * when the pointer never moved past the threshold.
 * @returns {() => void} cleanup
 */
export function bindClickSuppressor(el, { timeoutMs = DRAG_SCROLL_CLICK_SUPPRESS_MS } = {}) {
  if (!el || typeof el.addEventListener !== "function") return () => {};
  const suppress = (event) => {
    event.preventDefault();
    event.stopPropagation();
    cleanup();
  };
  let timer = null;
  const cleanup = () => {
    el.removeEventListener("click", suppress, true);
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  el.addEventListener("click", suppress, true);
  timer = setTimeout(cleanup, timeoutMs);
  return cleanup;
}
