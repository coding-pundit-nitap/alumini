// k6 provides `console`; @types/k6 doesn't declare it, and the DOM lib would let browser-only code type-check.
declare const console: { log(...data: unknown[]): void };
