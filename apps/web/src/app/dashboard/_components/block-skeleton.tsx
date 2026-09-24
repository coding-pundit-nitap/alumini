import { Skeleton } from "@nitap/ui/components/skeleton";

export function BlockSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
