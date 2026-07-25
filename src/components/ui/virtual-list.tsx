"use client";

/**
 * VirtualList — windowed rendering for long lists (audit logs, job queues,
 * run history, flow lists). Renders only the rows currently in (or just
 * outside) the visible viewport instead of the whole array, so a list of
 * 10,000 rows costs the same DOM weight as a list of 20.
 *
 * Deliberately dependency-free (no react-window/react-virtual) to avoid
 * adding a package this build can't `npm install`. The algorithm is the
 * standard fixed-row-height windowing technique: track scrollTop, compute
 * which index range is visible, render only that slice inside a spacer
 * whose height reserves room for the rows above and below.
 *
 * Usage:
 *   <VirtualList items={auditEntries} rowHeight={48} height={480}
 *     renderRow={(entry) => <AuditRow entry={entry} />} />
 */

import React from "react";

export interface VirtualListProps<T> {
  items: T[];
  rowHeight: number;
  height: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
  getKey?: (item: T, index: number) => React.Key;
  emptyState?: React.ReactNode;
}

export function VirtualList<T>({
  items, rowHeight, height, renderRow, overscan = 6, className, getKey, emptyState,
}: VirtualListProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);

  const onScroll = React.useCallback(() => {
    if (containerRef.current) setScrollTop(containerRef.current.scrollTop);
  }, []);

  const totalHeight = items.length * rowHeight;
  const visibleCount = Math.ceil(height / rowHeight);

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);

  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;

  if (!items.length && emptyState) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={className}
      style={{ height, overflowY: "auto", position: "relative" }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, i) => {
            const index = startIndex + i;
            const key = getKey ? getKey(item, index) : index;
            return (
              <div key={key} style={{ height: rowHeight }}>
                {renderRow(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Memoized row wrapper — pairs naturally with VirtualList: since only the
 * visible slice re-renders on scroll, wrapping each row's content component
 * in React.memo means a scroll event that doesn't change which rows are
 * visible triggers zero re-renders of row content, only the windowing math.
 */
export function memoRow<P extends object>(Component: React.ComponentType<P>) {
  return React.memo(Component) as React.ComponentType<P>;
}
