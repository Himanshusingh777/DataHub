import { Skeleton } from "@/components/ui/skeleton";

// Shown by the App Router while a dashboard route segment's RSC payload and
// JS chunk are in flight, so navigation shows something immediately instead
// of a blank pane — every page under (dashboard) is a client component, so
// without this the pane was just empty until hydration.
export default function DashboardRouteLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
