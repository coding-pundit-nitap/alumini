#!/usr/bin/env node
// Summarises V8 .cpuprofile files (from `node --cpu-prof`, e.g. `scripts/perf/run.mjs pages --server-env
// NODE_OPTIONS=--cpu-prof --server-env ...`): where the web process spent its CPU, by self time per function
// and by package. Phase 15 uses it to explain a CPU-bound render before changing anything (strategy §13.7).
//
//   node scripts/perf/cpuprofile-top.mjs <file-or-dir>… [--top 40]
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { top: { type: "string", default: "40" } },
});
const files = positionals.flatMap((p) =>
  statSync(p).isDirectory()
    ? readdirSync(p)
        .filter((f) => f.endsWith(".cpuprofile"))
        .map((f) => path.join(p, f))
    : [p]
);

const byFunction = new Map();
const byPackage = new Map();
let total = 0;
for (const file of files) {
  const profile = JSON.parse(readFileSync(file, "utf8"));
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  // timeDeltas[i] is the time before sample i; attribute it to that sample's node (self time).
  const self = new Map();
  profile.samples.forEach((id, i) => {
    self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0));
  });
  for (const [id, micros] of self) {
    const { callFrame } = nodes.get(id);
    total += micros;
    const url = callFrame.url || "(native)";
    const pkg =
      /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(
        url.replace(
          /.*node_modules\/\.pnpm\/[^/]+\/node_modules\//,
          "node_modules/"
        )
      )?.[1] ??
      (url.includes(".next/server")
        ? "(app bundle)"
        : url.startsWith("node:")
          ? "(node core)"
          : callFrame.functionName.startsWith("(")
            ? callFrame.functionName
            : "(other)");
    const fn = `${callFrame.functionName || "(anonymous)"}  ${url.split("/").slice(-2).join("/")}:${callFrame.lineNumber + 1}`;
    byFunction.set(fn, (byFunction.get(fn) ?? 0) + micros);
    byPackage.set(pkg, (byPackage.get(pkg) ?? 0) + micros);
  }
}

const show = (title, map, n) => {
  console.log(`\n${title}`);
  for (const [key, micros] of [...map]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)) {
    console.log(
      `  ${((micros / total) * 100).toFixed(1).padStart(5)}%  ${(micros / 1000).toFixed(0).padStart(7)} ms  ${key}`
    );
  }
};
console.log(
  `${files.length} profile(s), ${(total / 1e6).toFixed(1)} s of samples`
);
show("By package (self time)", byPackage, 25);
show("By function (self time)", byFunction, Number(args.top));
