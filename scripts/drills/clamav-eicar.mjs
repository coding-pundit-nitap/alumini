#!/usr/bin/env node
// Upload malware-scan drill (spec 16 SD-8, NFR-SEC-007). Runs the worker's real clamd adapter against a real
// ClamAV:
//
//   pnpm docker:scan                     # first start downloads signatures; wait until healthy
//   node scripts/drills/clamav-eicar.mjs  # CLAMAV_URL=tcp://localhost:3310 by default
//
// It scans the EICAR test string (every antivirus flags it; it is harmless), a clean PNG, and EICAR hidden
// after a valid image (a polyglot), prints a pass/fail table for docs/operations/security-verification.md,
// and exits 1 if any check fails.
import {
  createClamdScanner,
  parseClamavUrl,
} from "../../apps/worker/src/clamav.ts";

const url = process.env.CLAMAV_URL ?? "tcp://localhost:3310";
const scanner = createClamdScanner({
  ...parseClamavUrl(url),
  timeoutMs: 60_000,
});

const EICAR = Buffer.from(
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
);
// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

const cases = [
  ["EICAR test string is rejected", EICAR, false],
  ["a clean PNG passes", PNG, true],
  [
    "EICAR appended to a valid PNG (polyglot) is rejected",
    Buffer.concat([PNG, EICAR]),
    false,
  ],
];

const results = [];
for (const [check, bytes, expectOk] of cases) {
  try {
    const verdict = await scanner.scan(bytes);
    results.push({
      check,
      pass: verdict.ok === expectOk,
      detail: JSON.stringify(verdict),
    });
  } catch (error) {
    results.push({ check, pass: false, detail: String(error) });
  }
}

// Fails closed: an unreachable clamd is an error the job retries, never a pass.
try {
  await createClamdScanner({
    host: "127.0.0.1",
    port: 1,
    timeoutMs: 2_000,
  }).scan(PNG);
  results.push({
    check: "unreachable clamd throws",
    pass: false,
    detail: "resolved",
  });
} catch (error) {
  results.push({
    check: "unreachable clamd throws",
    pass: true,
    detail: String(error),
  });
}

console.log(`ClamAV drill against ${url} — ${new Date().toISOString()}\n`);
console.log("| Check | Result | Detail |\n| --- | --- | --- |");
for (const r of results)
  console.log(`| ${r.check} | ${r.pass ? "pass" : "FAIL"} | ${r.detail} |`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
