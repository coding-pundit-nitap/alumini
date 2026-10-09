import {
  PASSWORD_PLACEHOLDER,
  type TableRows,
  type Value,
} from "./generate.ts";

/**
 * The slice of `pg`'s Client/PoolClient the writer needs, so this package takes
 * no `pg` dependency.
 */
export type Queryable = {
  query(text: string, values?: unknown[]): Promise<unknown>;
};

const CHUNK = 5_000;

/**
 * The seed refuses any other database: 10 000 synthetic users must never land
 * in a real one.
 */
export function assertPerfDatabase(databaseUrl: string): string {
  const name = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  if (!name.endsWith("_perf")) {
    throw new Error(
      `Refusing to seed "${name}": the performance seed only writes to a database whose name ends in _perf.`
    );
  }
  return name;
}

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

const asText = (value: Value): string | null =>
  value === null ? null : typeof value === "string" ? value : String(value);

/**
 * One transaction, in foreign-key order, 5,000 rows per `INSERT … unnest(…)`.
 * Then advances the message sequence and runs ANALYZE.
 */
export async function writePerfData(
  client: Queryable,
  tables: readonly TableRows[],
  passwordHash: string,
  onProgress: (table: string, rows: number) => void = () => {}
): Promise<void> {
  await client.query("BEGIN");
  try {
    for (const { table, columns, rows } of tables) {
      const names = columns.map(([name]) => quoteIdent(name)).join(", ");
      const aliases = columns.map((_, i) => `c${i}`);
      const select = columns.map(([, type], i) => `c${i}::${type}`).join(", ");
      const params = columns.map((_, i) => `$${i + 1}::text[]`).join(", ");
      const sql = `INSERT INTO ${quoteIdent(table)} (${names}) SELECT ${select} FROM unnest(${params}) AS t(${aliases.join(", ")})`;

      for (let start = 0; start < rows.length; start += CHUNK) {
        const chunk = rows.slice(start, start + CHUNK);
        const values = columns.map((_, col) =>
          chunk.map((row) => {
            const value = asText(row[col] ?? null);
            return value === PASSWORD_PLACEHOLDER ? passwordHash : value;
          })
        );
        await client.query(sql, values);
      }
      onProgress(table, rows.length);
    }
    await client.query(
      `SELECT setval(pg_get_serial_sequence('message', 'seq'), GREATEST((SELECT max(seq) FROM message), 1))`
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  await client.query("ANALYZE");
}
