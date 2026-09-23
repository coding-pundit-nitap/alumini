import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getDashboard } from "@/composition/admin";
import { AppError } from "@/lib/errors";
import { DashboardTiles } from "@/modules/admin";
import { getActor } from "@/modules/auth";

export const metadata: Metadata = { title: "Admin dashboard" };

export default async function AdminDashboardPage() {
  let tiles;
  try {
    tiles = await getDashboard({ actor: await getActor() });
  } catch (error) {
    // The layout already redirected anonymous visitors; a non-admin gets the same 404 as the layout gives.
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <DashboardTiles tiles={tiles} />
    </div>
  );
}
