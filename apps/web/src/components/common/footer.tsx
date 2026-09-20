import { siteConfig } from "@/config/site";

export function Footer() {
  return (
    <footer className="border-border/40 bg-muted/30 border-t py-8">
      <div className="container mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-8">
        <p className="text-muted-foreground text-center text-sm leading-loose sm:text-left">
          Built with{" "}
          <span className="text-foreground font-semibold">Next.js 16</span>,{" "}
          <span className="text-foreground font-semibold">TypeScript</span>, and{" "}
          <span className="text-foreground font-semibold">shadcn/ui</span>.
        </p>
        <p className="text-muted-foreground text-center text-sm sm:text-right">
          &copy; {new Date().getFullYear()} {siteConfig.name}. Production Grade
          Setup.
        </p>
      </div>
    </footer>
  );
}
