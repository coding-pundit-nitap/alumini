#!/usr/bin/env node
// Build-output scan (strategy §10.1 "Secrets and data exposure", spec 16 16E): after `next build`, nothing
// the browser downloads may carry a server environment variable's NAME or a secret's VALUE.
//
//   pnpm build && node packages/scripts/security/scan-client-bundle.ts
//
// Names come from the web app's server env schema (apps/web/src/config/env.ts) and the storage package's;
// values are those of the variables in the current environment that hold credentials. Exit 1 on any hit.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const staticDir = path.join(root, "apps/web/.next/static");
if (!fs.existsSync(staticDir)) {
  console.error(`No build output at ${staticDir}; run pnpm build first.`);
  process.exit(2);
}

const schemaNames = (file: string): string[] =>
  [
    ...fs
      .readFileSync(path.join(root, file), "utf8")
      .matchAll(/^\s{2}([A-Z][A-Z0-9_]{2,}):/gm),
  ].flatMap((m) => (m[1] ? [m[1]] : []));
// NODE_ENV is replaced at build time on purpose; NEXT_PUBLIC_* are public by definition.
const names = [
  ...new Set([
    ...schemaNames("apps/web/src/config/env.ts"),
    ...schemaNames("packages/storage/src/env.ts"),
  ]),
].filter((name) => name !== "NODE_ENV" && !name.startsWith("NEXT_PUBLIC_"));

const SECRET = /SECRET|PASSWORD|TOKEN|DSN|_URL$|KEY/;
const values = names
  .filter((name) => SECRET.test(name))
  .flatMap((name): [string, string][] => {
    const value = process.env[name];
    return typeof value === "string" && value.length >= 8
      ? [[name, value]]
      : [];
  })
  // A URL's credentials are the secret part; its host alone (localhost:3000) is not.
  .flatMap(([name, value]): [string, string][] => {
    try {
      const url = new URL(value);
      return url.password
        ? [[name, url.password]]
        : url.username
          ? []
          : [[name, value]];
    } catch {
      return [[name, value]];
    }
  })
  .filter(([name]) => !/^(APP_URL|BETTER_AUTH_URL|S3_ENDPOINT)$/.test(name));

const files: string[] = [];
const walk = (dir: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|mjs|css|json|map|html|txt)$/.test(entry.name))
      files.push(full);
  }
};
walk(staticDir);

// Reviewed: Better Auth's browser client ships its generic env reader, whose getters look these names up in
// process.env at runtime (undefined in a browser). The names are the library's, and no value is inlined:
// the value check below still runs for both.
const VENDOR_NAMES = new Set(["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"]);

const hits: string[] = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const name of names)
    if (!VENDOR_NAMES.has(name) && new RegExp(`\\b${name}\\b`).test(text))
      hits.push(`${path.relative(root, file)}: name ${name}`);
  for (const [name, value] of values)
    if (text.includes(value))
      hits.push(`${path.relative(root, file)}: value of ${name}`);
}

console.log(
  `Scanned ${files.length} client files for ${names.length} server variable names and ${values.length} secret values.`
);
if (hits.length > 0) {
  console.error(hits.join("\n"));
  process.exit(1);
}
console.log("No server variable name or secret value in the client bundle.");
