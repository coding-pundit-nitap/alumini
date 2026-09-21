"use client";

import { Button } from "@nitap/ui/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "../auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={pending}
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
