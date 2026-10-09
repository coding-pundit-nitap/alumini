"use client";

import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { avatarTone } from "../lib/avatar-tone";
import { cn } from "../lib/utils";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * A person's photo, or their initials on a stable tint when there is no photo
 * (or it fails to load).
 */
function InitialsAvatar({
  name,
  seed,
  src,
  size = "default",
  className,
}: {
  name: string;
  /** Picks the tint; usually the person's id so it stays the same everywhere. */
  seed: string;
  src?: string | null;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  return (
    // Decorative: every use sits beside the person's name, so it would only repeat it as initials.
    <Avatar size={size} className={className} aria-hidden>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className={cn("font-semibold", avatarTone(seed))}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export { InitialsAvatar };
