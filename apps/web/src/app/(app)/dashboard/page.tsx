import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getActor } from "@/modules/auth";

import { BlockSkeleton } from "./_components/block-skeleton";
import {
  Attention,
  Events,
  FirstRun,
  Jobs,
  ProfileHeader,
  RoleBlock,
} from "./_components/data";

export const metadata: Metadata = { title: "Dashboard" };

/** §5.3.1. Access per H-4; every block streams on its own (H-6). */
export default async function DashboardPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Fdashboard");
  if (actor.accountState !== "VERIFIED") {
    redirect(
      actor.accountState === "PENDING" || actor.accountState === "REJECTED"
        ? "/onboarding"
        : "/account/status"
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6">
      <Suspense fallback={<BlockSkeleton rows={1} />}>
        <ProfileHeader actor={actor} />
      </Suspense>
      <Suspense fallback={null}>
        <FirstRun actor={actor} />
      </Suspense>
      <Suspense fallback={<BlockSkeleton rows={1} />}>
        <Attention actor={actor} />
      </Suspense>
      <div className="grid gap-8 md:grid-cols-2">
        <Suspense fallback={<BlockSkeleton />}>
          <Jobs actor={actor} />
        </Suspense>
        <Suspense fallback={<BlockSkeleton />}>
          <Events actor={actor} />
        </Suspense>
      </div>
      <Suspense fallback={<BlockSkeleton />}>
        <RoleBlock actor={actor} />
      </Suspense>
    </div>
  );
}
