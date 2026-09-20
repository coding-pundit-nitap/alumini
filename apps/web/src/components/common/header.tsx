import Link from "next/link";
import { siteConfig } from "@/config/site";
import { buttonVariants } from "@nitap/ui/components/button";
import { Badge } from "@nitap/ui/components/badge";
import { Sparkles, Code } from "lucide-react";

export function Header() {
  return (
    <header className="border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg font-extrabold shadow-sm">
              IH
            </span>
            <span>{siteConfig.name}</span>
          </Link>
          <Badge
            variant="secondary"
            className="hidden items-center gap-1 font-medium sm:inline-flex"
          >
            <Sparkles className="size-3 text-amber-500" /> Next.js 16 +
            shadcn/ui
          </Badge>
        </div>

        <nav className="flex items-center gap-4">
          <Link
            href="#features"
            className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
          >
            Features
          </Link>
          <Link
            href="#architecture"
            className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
          >
            Architecture
          </Link>
          <Link
            href="/health/live"
            target="_blank"
            className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
          >
            Health API
          </Link>
          <a
            href={siteConfig.links.github}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "flex items-center gap-2",
            })}
          >
            <Code className="size-4" />
            <span>GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
