import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ChevronUp} from 'lucide-react';

export type SheetSnap = 'low' | 'mid' | 'high';
export type SheetTab = 'participants' | 'bars';

interface BottomSheetProps {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  activeTab: SheetTab;
  onTabChange: (tab: SheetTab) => void;
  participantsCount: number;
  barsCount: number;
  summaryText: string;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  footer: React.ReactNode;
  children: React.ReactNode;
}

function getSnapHeights(viewportH: number): Record<SheetSnap, number> {
  return {
    low: Math.max(152, Math.round(viewportH * 0.18)),
    mid: Math.max(320, Math.round(viewportH * 0.52)),
    high: Math.max(460, Math.round(viewportH * 0.9)),
  };
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  snap,
  onSnapChange,
  activeTab,
  onTabChange,
  participantsCount,
  barsCount,
  summaryText,
  scrollContainerRef,
  footer,
  children,
}) => {
  const [viewportH, setViewportH] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerHeight : 844
  );
  const [isDragging, setIsDragging] = useState(false);
  const [dragHeightPx, setDragHeightPx] = useState<number | null>(null);

  const dragStateRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    lastY: number;
    lastTime: number;
    velocityY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const onResize = () => {
      setViewportH(window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const snapHeights = getSnapHeights(viewportH);
  const currentHeightPx = dragHeightPx ?? snapHeights[snap];

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (window.innerWidth >= 1024) return;
      if ((e.target as HTMLElement).closest('button[data-no-drag="true"]')) {
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      const startHeight = snapHeights[snap];
      dragStateRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startHeight,
        lastY: e.clientY,
        lastTime: performance.now(),
        velocityY: 0,
        moved: false,
      };
      setIsDragging(true);
      setDragHeightPx(startHeight);
    },
    [snap, snapHeights]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const st = dragStateRef.current;
      if (!st || st.pointerId !== e.pointerId) return;

      const now = performance.now();
      const dt = Math.max(8, now - st.lastTime);
      st.velocityY = (st.lastY - e.clientY) / dt; // positive when dragging up
      st.lastY = e.clientY;
      st.lastTime = now;

      const deltaY = st.startY - e.clientY;
      if (Math.abs(deltaY) > 6) {
        st.moved = true;
      }

      const clamped = Math.max(
        snapHeights.low - 14,
        Math.min(snapHeights.high + 14, st.startHeight + deltaY)
      );
      setDragHeightPx(clamped);
    },
    [snapHeights]
  );

  const cycleSnapOnTap = useCallback(() => {
    if (snap === 'low') onSnapChange('mid');
    else if (snap === 'mid') onSnapChange('high');
    else onSnapChange('mid');
  }, [snap, onSnapChange]);

  const finishDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const st = dragStateRef.current;
      if (!st || st.pointerId !== e.pointerId) return;

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if already released
      }

      const finalHeight = dragHeightPx ?? st.startHeight;
      const wasMoved = st.moved;
      const velocityBoost = st.velocityY * 140;
      const projected = finalHeight + velocityBoost;

      dragStateRef.current = null;
      setIsDragging(false);
      setDragHeightPx(null);

      if (!wasMoved) {
        cycleSnapOnTap();
        return;
      }

      const entries: [SheetSnap, number][] = [
        ['low', snapHeights.low],
        ['mid', snapHeights.mid],
        ['high', snapHeights.high],
      ];
      let nearest: SheetSnap = snap;
      let bestDist = Infinity;
      for (const [key, h] of entries) {
        const dist = Math.abs(projected - h);
        if (dist < bestDist) {
          bestDist = dist;
          nearest = key;
        }
      }
      onSnapChange(nearest);
    },
    [dragHeightPx, snapHeights, snap, onSnapChange, cycleSnapOnTap]
  );

  return (
    <aside
      aria-label="Panneau participants et bars"
      style={{'--sheet-h': `${currentHeightPx}px`} as React.CSSProperties}
      className={`fixed inset-x-0 bottom-0 z-20 flex h-[var(--sheet-h)] flex-col rounded-t-[28px] border-t border-[var(--border-strong)] bg-[var(--bg-sheet)] shadow-2xl backdrop-blur-2xl lg:top-[84px] lg:bottom-4 lg:left-4 lg:right-auto lg:w-[440px] lg:h-auto lg:rounded-[28px] lg:border ${
        isDragging
          ? 'transition-none'
          : 'transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]'
      }`}
    >
      {/* Mobile Drag Handle + Collapsed Summary / Segmented Control */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        className="shrink-0 select-none touch-none px-4 pt-2.5 pb-2.5 lg:pt-3.5"
      >
        {/* Centered Grab Handle (mobile only) */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Glisser ou toucher pour redimensionner le tiroir"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              cycleSnapOnTap();
            }
          }}
          className="mx-auto mb-2.5 flex w-full cursor-grab items-center justify-center py-0.5 active:cursor-grabbing lg:hidden"
        >
          <span className="h-1.5 w-10 rounded-full bg-[var(--handle-color)]" />
        </div>

        {/* Low Snap: Compact 1-line summary */}
        {snap === 'low' && (
          <button
            type="button"
            data-no-drag="true"
            onClick={() => onSnapChange('mid')}
            className="flex min-h-[38px] w-full items-center justify-between gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-left lg:hidden"
          >
            <span className="truncate text-xs font-semibold text-[var(--text-primary)] tabular-nums">
              {summaryText}
            </span>
            <ChevronUp className="h-4 w-4 shrink-0 text-[#0A84FF]" aria-hidden="true" />
          </button>
        )}

        {/* iOS Segmented Control (visible in mid/high on mobile, always on desktop) */}
        <div
          className={`${
            snap === 'low' ? 'hidden lg:grid' : 'grid'
          } grid-cols-2 gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1`}
          role="tablist"
          aria-label="Navigation du tiroir"
        >
          <button
            type="button"
            data-no-drag="true"
            role="tab"
            aria-selected={activeTab === 'participants'}
            onClick={() => onTabChange('participants')}
            className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap tabular-nums ${
              activeTab === 'participants'
                ? 'bg-[#0A84FF] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Participants ({participantsCount})
          </button>

          <button
            type="button"
            data-no-drag="true"
            role="tab"
            aria-selected={activeTab === 'bars'}
            onClick={() => onTabChange('bars')}
            className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap tabular-nums ${
              activeTab === 'bars'
                ? 'bg-[#0A84FF] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Bars QG ({barsCount})
          </button>
        </div>
      </div>

      {/* Scrollable Sheet Content */}
      <div
        ref={scrollContainerRef}
        className={`${
          snap === 'low' ? 'hidden lg:block' : 'block'
        } min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 space-y-4`}
      >
        {children}
      </div>

      {/* Pinned Bottom Share & Calendar Bar */}
      {footer}
    </aside>
  );
};
