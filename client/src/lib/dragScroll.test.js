import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDragScrollMove,
  bindClickSuppressor,
  createDragScrollSession,
  DRAG_SCROLL_THRESHOLD_PX,
  isFormControlDragTarget,
} from "./dragScroll.js";

function fakeNode(tag, { closestMatch = false } = {}) {
  return {
    tagName: tag,
    closest(selector) {
      if (!closestMatch) return null;
      const tokens = String(selector)
        .split(",")
        .map((s) => s.trim().toLowerCase());
      return tokens.includes(tag.toLowerCase()) ? this : null;
    },
  };
}

describe("isFormControlDragTarget", () => {
  it("ignores empty or non-element targets", () => {
    assert.equal(isFormControlDragTarget(null), false);
    assert.equal(isFormControlDragTarget({}), false);
  });

  it("treats inputs as form controls", () => {
    assert.equal(isFormControlDragTarget(fakeNode("input", { closestMatch: true })), true);
    assert.equal(isFormControlDragTarget(fakeNode("div", { closestMatch: false })), false);
  });
});

describe("createDragScrollSession", () => {
  it("starts a horizontal session for a primary mouse press", () => {
    const session = createDragScrollSession({
      pointerType: "mouse",
      button: 0,
      startX: 40,
      startY: 10,
      scrollLeft: 120,
    });
    assert.ok(session);
    assert.equal(session.axis, "x");
    assert.equal(session.scrollLeft, 120);
    assert.equal(session.moved, false);
  });

  it("ignores touch, non-primary buttons, and form fields", () => {
    assert.equal(
      createDragScrollSession({ pointerType: "touch", startX: 1, startY: 1 }),
      null
    );
    assert.equal(
      createDragScrollSession({ pointerType: "mouse", button: 2, startX: 1, startY: 1 }),
      null
    );
    assert.equal(
      createDragScrollSession({
        pointerType: "mouse",
        startX: 1,
        startY: 1,
        target: fakeNode("input", { closestMatch: true }),
      }),
      null
    );
  });
});

describe("applyDragScrollMove", () => {
  it("stays idle until the pointer crosses the threshold", () => {
    const session = createDragScrollSession({
      pointerType: "mouse",
      startX: 100,
      startY: 20,
      scrollLeft: 80,
    });
    const idle = applyDragScrollMove(session, {
      clientX: 100 + DRAG_SCROLL_THRESHOLD_PX - 1,
      clientY: 20,
    });
    assert.deepEqual(idle, { began: false, moved: false });
    assert.equal(session.moved, false);
  });

  it("pans horizontally opposite the pointer once dragging", () => {
    const session = createDragScrollSession({
      pointerType: "mouse",
      startX: 100,
      startY: 20,
      scrollLeft: 80,
      scrollTop: 4,
    });
    const next = applyDragScrollMove(session, { clientX: 40, clientY: 28 });
    assert.equal(next.moved, true);
    assert.equal(next.scrollLeft, 140);
    assert.equal(next.scrollTop, 4);
    assert.equal(session.moved, true);
  });

  it("can pan both axes when requested", () => {
    const session = createDragScrollSession({
      axis: "both",
      pointerType: "mouse",
      startX: 10,
      startY: 10,
      scrollLeft: 0,
      scrollTop: 0,
    });
    const next = applyDragScrollMove(session, { clientX: 0, clientY: 0 });
    assert.equal(next.scrollLeft, 10);
    assert.equal(next.scrollTop, 10);
  });
});

describe("bindClickSuppressor", () => {
  it("stops the next click in capture phase, then unbinds", () => {
    const listeners = new Map();
    const el = {
      addEventListener(type, fn, opts) {
        listeners.set(type, { fn, opts });
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
    };
    const cleanup = bindClickSuppressor(el, { timeoutMs: 10_000 });
    assert.equal(listeners.get("click").opts, true);
    const event = {
      prevented: false,
      stopped: false,
      preventDefault() {
        this.prevented = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
    };
    listeners.get("click").fn(event);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
    assert.equal(listeners.has("click"), false);
    cleanup();
  });
});
