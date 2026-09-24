import { describe, expect, it } from "vitest";

import { render, screen } from "../../../../../tests/support/test-utils";
import { ReportedMessageContext } from "./reported-message-context";

const msg = (n: number, over = {}) => ({
  id: `m${n}`,
  seq: String(n),
  senderId: "u1",
  senderName: "Asha",
  body: `body ${n}`,
  createdAt: new Date(Date.UTC(2026, 8, 24, 10, n)),
  hidden: false,
  reported: false,
  ...over,
});

describe("ReportedMessageContext", () => {
  it("marks the reported message and flags hidden ones", () => {
    render(
      <ReportedMessageContext
        view={{
          reportId: "r",
          conversationId: "c",
          messageId: "m2",
          messages: [
            msg(1, { hidden: true }),
            msg(2, { reported: true }),
            msg(3),
          ],
        }}
      />
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveAttribute("aria-current", "true");
    expect(items[1]).toHaveTextContent("Reported");
    expect(items[0]).toHaveTextContent("Hidden");
    expect(items[0]).toHaveTextContent("body 1");
  });
});
