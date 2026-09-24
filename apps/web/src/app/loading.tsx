import { LoadingSpinner } from "@/components/feedback/loading-spinner";
import { PublicShell } from "@/components/common/public-shell";

export default function Loading() {
  return (
    <PublicShell signedIn={false}>
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8">
        <LoadingSpinner
          size="lg"
          label="Loading application..."
          className="border-brand dark:border-brand border-t-transparent dark:border-t-transparent"
        />
      </div>
    </PublicShell>
  );
}
