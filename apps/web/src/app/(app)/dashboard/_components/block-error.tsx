import Link from "next/link";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@nitap/ui/components/alert";

/** Recoverable error, in place of one block only. */
export function BlockError({ what }: { what: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Couldn&apos;t load {what}</AlertTitle>
      <AlertDescription>
        <Link href="/dashboard" className="underline">
          Try again
        </Link>
      </AlertDescription>
    </Alert>
  );
}
