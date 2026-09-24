import { Skeleton } from "@nitap/ui/components/skeleton";

export function BlockSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4" aria-hidden>
      <Skeleton className="h-4 w-32" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
