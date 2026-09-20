/** The queue's integration tests need only the queue Redis (no PostgreSQL). Fail fast with a clear message. */
export default function setup() {
  if (!process.env.QUEUE_REDIS_URL) {
    throw new Error(
      "Queue integration tests need QUEUE_REDIS_URL. Run `pnpm docker:up` and load .env: set -a; . ./.env; set +a."
    );
  }
}
