/** The storage integration tests need a real S3-compatible endpoint (MinIO in dev/CI). Fail fast. */
export default function setup() {
  const missing = [
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Storage integration tests need ${missing.join(", ")}. Run \`pnpm docker:up\` and load .env: set -a; . ./.env; set +a.`
    );
  }
}
