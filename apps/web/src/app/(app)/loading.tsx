import { Skeleton } from "@nitap/ui/components/skeleton";

/** Renders inside the member shell, so navigating between member pages never flashes public chrome. */
export default function MemberLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6"
    >
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-2/3" />
    </div>
  );
}
