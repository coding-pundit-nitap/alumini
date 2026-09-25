import { Skeleton } from "@nitap/ui/components/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-6 overflow-hidden rounded-xl border">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-none" />
        ))}
      </div>
    </div>
  );
}
