import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-border/40 bg-muted/30 border-t py-8">
      <div className="container mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-sm sm:flex-row sm:px-8">
        <nav className="text-muted-foreground flex gap-4">
          <Link href="/#privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
        <p className="text-muted-foreground">
          &copy; {new Date().getFullYear()} NIT Arunachal Pradesh
        </p>
      </div>
    </footer>
  );
}
