import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AppError } from "@/lib/errors";
import {
  ReviewQueue,
  getActor,
  listPendingVerificationRequests,
} from "@/modules/auth";

import { decideVerificationAction } from "./actions";

export const metadata: Metadata = { title: "Verification requests" };

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function VerificationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fadmin%2Fverification");

  const cursor = first((await searchParams).cursor);
  let page;
  try {
    page = await listPendingVerificationRequests({ actor, cursor });
  } catch (error) {
    // The queue answers 404 to anyone without `alumni.verify`, so its existence is not revealed.
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Verification requests</h1>
      <ReviewQueue
        page={page}
        action={decideVerificationAction}
        nextHref={
          page.nextCursor
            ? `/admin/verification?cursor=${encodeURIComponent(page.nextCursor)}`
            : null
        }
      />
    </div>
  );
}
