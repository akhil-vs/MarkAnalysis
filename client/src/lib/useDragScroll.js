import { useCallback, useRef, useState } from "react";
import {
  applyDragScrollMove,
  bindClickSuppressor,
  createDragScrollSession,
  DRAG_SCROLL_THRESHOLD_PX,
} from "./dragScroll.js";

/**
 * Click-and-drag panning for an overflow scroll container (mouse / pen).
 * Clicks on links and buttons still work unless the pointer actually dragged.
 *
 * @param {{ axis?: "x" | "y" | "both", threshold?: number }} [options]
 */
export function useDragScroll({ axis = "x", threshold = DRAG_SCROLL_THRESHOLD_PX } = {}) {
  const ref = useRef(null);
  const sessionRef = useRef(null);
  const pointerIdRef = useRef(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (event) => {
      const el = ref.current;
      if (!el) return;
      const session = createDragScrollSession({
        axis,
        threshold,
        pointerType: event.pointerType,
        button: event.button,
        target: event.target,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      });
      if (!session) return;
      sessionRef.current = session;
      pointerIdRef.current = event.pointerId;
    },
    [axis, threshold]
  );

  const onPointerMove = useCallback((event) => {
    const session = sessionRef.current;
    const el = ref.current;
    if (!session || !el || event.pointerId !== pointerIdRef.current) return;
    const next = applyDragScrollMove(session, { clientX: event.clientX, clientY: event.clientY });
    if (!next?.moved) return;
    if (!draggingRef.current) {
      draggingRef.current = true;
      setDragging(true);
      try {
        el.setPointerCapture?.(event.pointerId);
      } catch {
        /* capture is optional */
      }
    }
    if (next.scrollLeft != null) el.scrollLeft = next.scrollLeft;
    if (next.scrollTop != null) el.scrollTop = next.scrollTop;
    event.preventDefault();
  }, []);

  const endDrag = useCallback((event) => {
    const session = sessionRef.current;
    if (!session) return;
    if (event?.pointerId != null && pointerIdRef.current != null && event.pointerId !== pointerIdRef.current) {
      return;
    }
    const el = ref.current;
    if (session.moved && el) bindClickSuppressor(el);
    if (el && event?.pointerId != null) {
      try {
        el.releasePointerCapture?.(event.pointerId);
      } catch {
        /* already released */
      }
    }
    sessionRef.current = null;
    pointerIdRef.current = null;
    draggingRef.current = false;
    setDragging(false);
  }, []);

  return {
    dragging,
    containerProps: {
      ref,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
      onDragStart: (event) => event.preventDefault(),
    },
  };
}
