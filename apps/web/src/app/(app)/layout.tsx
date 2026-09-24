/** Temporary until the AppShell lands (UI-1 Task 5). Not an authorization boundary. */
export default function MemberLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <main className="flex-1">{children}</main>;
}
