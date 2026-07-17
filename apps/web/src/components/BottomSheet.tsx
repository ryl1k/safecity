'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/** Sheet sizes, smallest first — the order arrow-key resizing walks through. */
export type SheetSnap = 'peek' | 'half' | 'full';
const SNAP_ORDER: SheetSnap[] = ['peek', 'half', 'full'];

/** Collapsed height: the grab handle plus roughly one line, so the sheet stays
 *  findable without hiding the map. */
const PEEK_PX = 84;
const FULL_FRACTION = 0.9;
const HALF_FRACTION = 0.5;
/** Pointer travel (px) past which a drag is real and the trailing click is suppressed. */
const DRAG_SLOP = 4;

function snapPx(snap: SheetSnap, containerH: number): number {
  if (snap === 'full') return Math.round(containerH * FULL_FRACTION);
  if (snap === 'half') return Math.round(containerH * HALF_FRACTION);
  return PEEK_PX;
}

function nearestSnap(height: number, containerH: number): SheetSnap {
  return SNAP_ORDER.reduce((best, s) =>
    Math.abs(snapPx(s, containerH) - height) < Math.abs(snapPx(best, containerH) - height) ? s : best,
  );
}

function stepSnap(snap: SheetSnap, delta: 1 | -1): SheetSnap {
  const i = SNAP_ORDER.indexOf(snap);
  return SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, Math.max(0, i + delta))] ?? snap;
}

/**
 * The shared map panel shell: a left side panel on desktop, a drag-resizable
 * bottom sheet on phones (matching the 760px breakpoint in globals.css).
 *
 * Dragging is deliberately limited to the grab handle. The body scrolls
 * natively, so a pull-to-resize gesture on the content would have to fight it —
 * `touch-action: none` on the handle alone keeps both behaviours predictable.
 *
 * `snap` is controlled so callers can react to size (and re-snap when, say, a
 * route is drawn and the map needs to be visible).
 */
export function BottomSheet({
  ariaLabel,
  ariaModal,
  hidden,
  snap,
  onSnapChange,
  panelRef,
  padded,
  children,
}: {
  ariaLabel: string;
  ariaModal?: boolean;
  hidden?: boolean;
  snap: SheetSnap;
  onSnapChange: (s: SheetSnap) => void;
  panelRef?: RefObject<HTMLDivElement | null>;
  /** Apply the standard panel padding to the body (off for content that pads itself). */
  padded?: boolean;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isSheet, setIsSheet] = useState(false);
  const [containerH, setContainerH] = useState(0);
  const [dragH, setDragH] = useState<number | null>(null);
  const startRef = useRef({ y: 0, h: 0, moved: false });

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const sync = () => setIsSheet(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Snap sizes are fractions of the map area, not the viewport — the panel is
  // absolutely positioned inside <main>, which already excludes header/bottom nav.
  useEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    const sync = () => setContainerH(parent.clientHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      rootRef.current = el;
      if (panelRef) panelRef.current = el;
    },
    [panelRef],
  );

  const height = dragH ?? snapPx(snap, containerH);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!isSheet || !containerH) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { y: e.clientY, h: height, moved: false };
    setDragH(height);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (dragH === null) return;
    const dy = startRef.current.y - e.clientY; // dragging up grows the sheet
    if (Math.abs(dy) > DRAG_SLOP) startRef.current.moved = true;
    const max = Math.round(containerH * FULL_FRACTION);
    setDragH(Math.min(max, Math.max(PEEK_PX, startRef.current.h + dy)));
  }

  function endDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (dragH === null) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const target = nearestSnap(dragH, containerH);
    setDragH(null);
    if (target !== snap) onSnapChange(target);
  }

  function onHandleClick() {
    // A drag ends with a click on the handle; only treat a genuine tap as a toggle.
    if (startRef.current.moved) { startRef.current.moved = false; return; }
    onSnapChange(snap === 'full' ? 'half' : 'full');
  }

  function onHandleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const next =
      e.key === 'ArrowUp' ? stepSnap(snap, 1)
      : e.key === 'ArrowDown' ? stepSnap(snap, -1)
      : e.key === 'Home' ? 'full'
      : e.key === 'End' ? 'peek'
      : null;
    if (!next) return;
    e.preventDefault();
    onSnapChange(next);
  }

  return (
    <div
      ref={setRefs}
      role="dialog"
      aria-modal={ariaModal}
      aria-label={ariaLabel}
      className={`sc-map-panel${hidden ? ' sc-map-panel--hidden' : ''}${dragH !== null ? ' sc-map-panel--dragging' : ''}`}
      style={isSheet && containerH ? { height } : undefined}
    >
      <button
        type="button"
        className="sc-map-panel__grab sc-foc"
        aria-label={`Розмір панелі: ${snap === 'full' ? 'повний' : snap === 'half' ? 'половина' : 'згорнуто'}. Стрілками вгору/вниз змінити розмір`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={onHandleClick}
        onKeyDown={onHandleKeyDown}
      >
        <span className="sc-map-panel__grabline" aria-hidden />
      </button>
      <div className={`sc-map-panel__body${padded ? ' sc-map-panel__body--pad' : ''}`}>
        {children}
      </div>
    </div>
  );
}
