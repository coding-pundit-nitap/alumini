// Fixtures for `semgrep --test .semgrep` (spec 16 16E): each rule must flag the `ruleid:` lines and only those.
"use client";

// ruleid: nitap-client-imports-server-module
import { Prisma } from "@nitap/database";
// ruleid: nitap-client-imports-server-module
import { env } from "@/config/env";
// ruleid: nitap-client-imports-server-module
import { prisma } from "@/infrastructure/database/client";
// ok: nitap-client-imports-server-module
import { PERMISSIONS } from "@nitap/database/permissions";
// ruleid: nitap-child-process-in-web
import { exec } from "node:child_process";

export function Bad({ input, html }: { input: { column: string }; html: string }) {
  // ruleid: nitap-unsafe-raw-query
  void prisma.$queryRawUnsafe(`SELECT * FROM "user" WHERE name = '${input.column}'`);
  // ruleid: nitap-raw-sql-from-input
  void Prisma.sql`SELECT ${Prisma.raw(input.column)} FROM profile`;
  // ok: nitap-raw-sql-from-input
  void Prisma.sql`SELECT ${Prisma.raw("p.full_name")} FROM profile p`;
  // ruleid: nitap-eval
  eval(html);
  // ruleid: nitap-eval
  void new Function(html);
  // ok: nitap-eval
  void ({ eval: () => 1 }).eval();
  void env;
  void PERMISSIONS;
  void exec;
  // ruleid: nitap-dangerously-set-inner-html
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
