/**
 * Same-origin path to object storage (spec 3C F-7): presigned URLs point here when S3_PUBLIC_PATH=/storage,
 * so the browser never talks to the store. A Route Handler rather than a next.config rewrite because
 * rewrites are fixed at `next build`, and the image is built once and promoted with only its environment
 * changing; this reads S3_ENDPOINT per request. Every URL is presigned, so the store does the authorization.
 */
const PUBLIC_PATH = "/storage";

// What a presigned GET, HEAD or POST needs. Cookies and Authorization belong to the app, never the store.
const REQUEST_HEADERS = [
  "content-type",
  "content-length",
  "range",
  "if-match",
  "if-none-match",
  "if-modified-since",
];
// Hop-by-hop, plus anything that would let the store set state on the app's origin.
const DROPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "set-cookie",
]);

async function forward(request: Request): Promise<Response> {
  const { S3_ENDPOINT, S3_PUBLIC_PATH } = process.env;
  if (S3_PUBLIC_PATH !== PUBLIC_PATH || !S3_ENDPOINT) {
    return new Response(null, { status: 404 });
  }

  // The raw (still percent-encoded) path: the signature covers it byte for byte.
  const url = new URL(request.url);
  const target =
    S3_ENDPOINT.replace(/\/$/, "") +
    url.pathname.slice(PUBLIC_PATH.length) +
    url.search;

  const headers = new Headers({ "accept-encoding": "identity" });
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let response: Response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Node's fetch needs this to stream a request body.
      ...(hasBody ? { duplex: "half" } : {}),
      // A presigned POST may redirect (success_action_redirect); that is the browser's to follow.
      redirect: "manual",
      signal: request.signal,
      cache: "no-store",
    } as RequestInit);
  } catch {
    return new Response(null, { status: 502 });
  }

  const relayed = new Headers();
  response.headers.forEach((value, name) => {
    if (!DROPPED_RESPONSE_HEADERS.has(name)) relayed.set(name, value);
  });
  return new Response(response.body, {
    status: response.status,
    headers: relayed,
  });
}

export const GET = forward;
export const HEAD = forward;
export const POST = forward;
export const PUT = forward;
