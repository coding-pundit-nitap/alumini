// Cuts an installed pnpm workspace down to what some of its packages need at runtime. Build-time only (Docker).
//
//   node prune-node-modules.mjs <repo> <package dir>[=<dependency>,...] ...
//
// A bare package dir keeps its `dependencies`; `dir=a,b` keeps exactly a and b (for a package used for only a
// few files, or one that needs a devDependency). Workspace dependencies are followed through their own
// `dependencies`, third-party ones through dependencies, optionalDependencies and required peers, never optional
// peers (better-auth lists next and vitest, @prisma/client the Prisma CLI). Everything else goes: other
// workspace packages, links the kept packages do not need, and every unreached package in node_modules/.pnpm
// (pnpm extracts the whole lockfile there whatever the filter). Then source maps, type declarations and
// Prisma's query compilers for databases other than PostgreSQL, none of which is loaded at runtime.
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import path from "node:path";

const [repo, ...roots] = process.argv.slice(2);
const store = path.join(repo, "node_modules", ".pnpm");
const manifest = (dir) =>
  JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
const keptWorkspaces = new Map(); // workspace dir -> the dependency names it keeps
const reached = new Set(); // node_modules/.pnpm entries

function runtimeDependencies(dir) {
  const pkg = manifest(dir);
  const optionalPeer = pkg.peerDependenciesMeta ?? {};
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}).filter(
      (name) => !optionalPeer[name]?.optional
    ),
  ];
}

function keep(fromModules, names) {
  for (const name of names) {
    let target;
    try {
      target = realpathSync(path.join(fromModules, name));
    } catch {
      continue; // not installed for this platform (an optional dependency)
    }
    const inStore = path.relative(store, target);
    if (inStore.startsWith("..")) {
      keepWorkspace(
        path.relative(repo, target),
        Object.keys(manifest(target).dependencies ?? {})
      );
    } else {
      const entry = inStore.split(path.sep)[0];
      if (reached.has(entry)) continue;
      reached.add(entry);
      keep(
        path.join(store, entry, "node_modules"),
        runtimeDependencies(target)
      );
    }
  }
}

function keepWorkspace(dir, names) {
  if (keptWorkspaces.has(dir)) return;
  keptWorkspaces.set(dir, new Set(names));
  keep(path.join(repo, dir, "node_modules"), names);
}

// Roots first, so an explicit list wins over the package's own dependencies when another root imports it.
const rootLists = roots.map((root) => {
  const [dir, list] = root.split("=");
  const names = list
    ? list.split(",")
    : Object.keys(manifest(path.join(repo, dir)).dependencies ?? {});
  keptWorkspaces.set(dir, new Set(names));
  return [dir, names];
});
for (const [dir, names] of rootLists)
  keep(path.join(repo, dir, "node_modules"), names);

const remove = (target) => rmSync(target, { recursive: true, force: true });
const children = (dir) => (existsSync(dir) ? readdirSync(dir) : []);

// Workspace packages nothing needs, and the root's own links (dev tooling).
const workspaces = [
  ...["apps", "packages"].flatMap((parent) =>
    children(path.join(repo, parent)).map((name) => path.join(parent, name))
  ),
];
for (const dir of workspaces)
  if (!keptWorkspaces.has(dir)) remove(path.join(repo, dir));
for (const name of children(path.join(repo, "node_modules")))
  if (!name.startsWith(".")) remove(path.join(repo, "node_modules", name));

// Links the kept workspace packages do not need (scoped ones are matched per package).
for (const [dir, names] of keptWorkspaces) {
  const modules = path.join(repo, dir, "node_modules");
  for (const name of children(modules)) {
    if (name === ".bin") continue;
    const scoped = name.startsWith("@")
      ? children(path.join(modules, name)).map((n) => `${name}/${n}`)
      : [name];
    for (const full of scoped)
      if (!names.has(full)) remove(path.join(modules, full));
  }
}

let removed = 0;
for (const entry of children(store)) {
  if (
    entry === "node_modules" ||
    entry.startsWith(".") ||
    entry.endsWith(".yaml") ||
    reached.has(entry)
  )
    continue;
  remove(path.join(store, entry));
  removed++;
}

function slim(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) slim(full);
    else if (
      /\.(map|d\.[cm]?ts)$/.test(entry.name) ||
      /^query_compiler_.*_bg\.(?!postgresql\.)/.test(entry.name)
    )
      remove(full);
  }
}
slim(store);

console.log(
  `prune-node-modules: kept ${[...keptWorkspaces.keys()].join(" ")} and ${reached.size} packages, removed ${removed}`
);
