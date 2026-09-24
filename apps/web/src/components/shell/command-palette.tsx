"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@nitap/ui/components/dialog";

import { cn } from "@/lib/utils";

import type { CreateAction, NavEntry, NavModel } from "./nav-model";

export function openCommandPalette() {
  window.dispatchEvent(new Event("open-command-palette"));
}

type Option = { href: string; label: string };

function toOptions(
  entries: readonly NavEntry[],
  create: readonly CreateAction[]
): Option[] {
  return [...entries, ...create].map(({ href, label }) => ({ href, label }));
}

/**
 * ⌘K / Ctrl+K palette: filters nav entries and create actions by label, and offers a directory
 * search fallback (`/directory?q=`) for a query nothing else matches, when Directory is in the nav.
 */
export function CommandPalette({ nav }: { nav: NavModel }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(true);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-command-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-command-palette", onOpenEvent);
    };
  }, []);

  const baseOptions = useMemo(
    () =>
      toOptions(
        nav.groups.flatMap((g) => g.entries),
        nav.create
      ),
    [nav]
  );
  const hasDirectory = baseOptions.some((o) => o.href === "/directory");

  const options = useMemo(() => {
    const q = query.trim();
    if (!q) return baseOptions;
    const needle = q.toLowerCase();
    const filtered = baseOptions.filter((o) =>
      o.label.toLowerCase().includes(needle)
    );
    if (hasDirectory) {
      filtered.push({
        href: `/directory?q=${encodeURIComponent(q)}`,
        label: `Search the directory for "${q}"`,
      });
    }
    return filtered;
  }, [baseOptions, hasDirectory, query]);

  function reset() {
    setQuery("");
    setActiveIndex(0);
  }

  function go(option: Option | undefined) {
    if (!option) return;
    router.push(option.href);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <input
          autoFocus
          role="combobox"
          aria-label="Command palette"
          aria-expanded={options.length > 0}
          aria-controls="cmdk-list"
          aria-activedescendant={
            options[activeIndex] ? `cmdk-option-${activeIndex}` : undefined
          }
          placeholder="Search or jump to…"
          className="h-12 w-full border-b bg-transparent px-4 text-base outline-none"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) =>
                options.length ? (i + 1) % options.length : 0
              );
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) =>
                options.length ? (i - 1 + options.length) % options.length : 0
              );
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(options[activeIndex]);
            }
          }}
        />
        <ul
          role="listbox"
          id="cmdk-list"
          className="max-h-80 overflow-y-auto p-2"
        >
          {options.map((option, i) => (
            <li
              key={option.href}
              id={`cmdk-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => go(option)}
              className={cn(
                "cursor-pointer rounded-md px-4 py-2.5 text-sm",
                i === activeIndex && "bg-accent"
              )}
            >
              {option.label}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
