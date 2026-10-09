export type ThemePref = "light" | "dark" | "system";
export const THEME_COOKIE = "theme";

export function parseTheme(value: string | undefined): ThemePref {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

/** Runs in <head> before paint so the page never flashes the wrong theme. */
export const THEME_SCRIPT = `(()=>{try{var m=document.cookie.match(/(?:^|; )theme=(light|dark)(?:;|$)/);var t=m?m[1]:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var d=document.documentElement;d.classList.toggle("dark",t==="dark");d.style.colorScheme=t}catch(e){}})()`;

export function applyTheme(pref: ThemePref) {
  document.cookie = `${THEME_COOKIE}=${pref}; path=/; max-age=31536000; SameSite=Lax`;
  const dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
