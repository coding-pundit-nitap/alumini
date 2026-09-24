import type { ReactNode } from "react";

import { NotificationBell } from "@/modules/notifications";

import { loadShell } from "./load-shell";
import { MobileBar } from "./mobile-bar";
import { Rail } from "./rail";

/**
 * The member chrome: rail (md+), mobile top and bottom bars (<md), and the content column. The bell is
 * rendered here and passed down because the notifications index reaches server code a client
 * component must not import. The right rail is per page (UI-2 `PageColumns`), not part of the shell.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const data = await loadShell();
  // Signed out: the page itself redirects to /login.
  if (!data) return <main>{children}</main>;

  // Only VERIFIED members may read notifications; anyone else's bell would poll into 403s.
  const bell = data.verified ? <NotificationBell /> : null;
  return (
    <div className="flex min-h-svh">
      <a
        href="#main"
        className="bg-background focus-visible:ring-ring sr-only z-50 rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus-visible:ring-2 focus-visible:outline-none"
      >
        Skip to content
      </a>
      <Rail nav={data.nav} user={data.user} bell={bell} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar nav={data.nav} user={data.user} bell={bell} />
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 pb-20 outline-none md:pb-0"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
