import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  AuthCard,
  SignOutButton,
  accountStatusCopy,
  getActor,
} from "@/modules/auth";

export const metadata: Metadata = { title: "Account status" };

export default async function AccountStatusPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=%2Faccount%2Fstatus");

  const copy = accountStatusCopy(actor.accountState);
  if (!copy) redirect("/");

  return (
    <AuthCard title={copy.title} description={copy.body}>
      <SignOutButton />
    </AuthCard>
  );
}
