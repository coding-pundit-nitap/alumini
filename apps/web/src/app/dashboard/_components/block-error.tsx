import Link from "next/link";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@nitap/ui/components/alert";

/** §4.1 recoverable error, in place of one block only (H-6). */
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
