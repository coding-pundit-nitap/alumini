export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex w-full justify-center px-4 py-12">
      {children}
    </div>
  );
}
