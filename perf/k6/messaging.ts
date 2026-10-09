// Messaging (TASK.md Phase 15): the inbox, one conversation's latest messages, and a share of sends. Only load
// users who take part in a conversation are used.
import http from "k6/http";
import type { Options } from "k6/options";
import { check } from "k6";

import {
  arrival,
  as,
  BASE,
  conversationsOf,
  loadUserAt,
  loadUsers,
  pick,
  perEndpoint,
  SRS_THRESHOLDS,
  summaryTrendStats,
  uuid,
} from "./lib.ts";

export const options: Options = {
  scenarios: { messaging: arrival({ rate: 40 }) },
  thresholds: perEndpoint(
    [
      "GET /api/v1/conversations",
      "GET /api/v1/conversations/:id/messages",
      "POST /api/v1/conversations/:id/messages",
    ],
    SRS_THRESHOLDS
  ),
  summaryTrendStats,
};

const talkers: number[] = [];
for (let i = 0; i < loadUsers.length; i += 1)
  if (conversationsOf(i).length > 0) talkers.push(i);

export default function () {
  const index = pick(talkers);
  const user = loadUserAt(index);
  const conversationId = pick(conversationsOf(index));
  const roll = Math.random();
  if (roll < 0.4) {
    const res = http.get(
      `${BASE}/api/v1/conversations?limit=20`,
      as(user, { tags: { name: "GET /api/v1/conversations" } })
    );
    check(res, { 200: (r: { status: number }) => r.status === 200 });
  } else if (roll < 0.8) {
    const res = http.get(
      `${BASE}/api/v1/conversations/${conversationId}/messages?limit=30`,
      as(user, { tags: { name: "GET /api/v1/conversations/:id/messages" } })
    );
    check(res, { 200: (r: { status: number }) => r.status === 200 });
  } else {
    const res = http.post(
      `${BASE}/api/v1/conversations/${conversationId}/messages`,
      JSON.stringify({ body: "Load test message 👋", clientMessageId: uuid() }),
      as(user, {
        headers: { "content-type": "application/json" },
        tags: { name: "POST /api/v1/conversations/:id/messages" },
      })
    );
    check(res, { 201: (r: { status: number }) => r.status === 201 });
  }
}
