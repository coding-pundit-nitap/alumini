import { AppShell } from "@/components/shell/app-shell";

/** Not an authorization boundary: pages keep their own redirects. */
export default function MemberLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
