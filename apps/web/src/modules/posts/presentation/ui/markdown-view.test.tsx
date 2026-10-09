import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownView } from "./markdown-view";

describe("MarkdownView (sanitized allow-list)", () => {
  it("renders bold, italic, links and lists", () => {
    render(
      <MarkdownView
        content={
          "**bold** and _italic_ and [link](https://x.test) and\n\n- one\n- two"
        }
      />
    );
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute(
      "href",
      "https://x.test"
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("strips a raw <script> tag entirely", () => {
    render(<MarkdownView content={"before<script>alert(1)</script>after"} />);
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(/before/)).toBeInTheDocument();
  });

  it("strips an <img onerror=...> payload — no img element is ever rendered", () => {
    render(<MarkdownView content={'<img src=x onerror="alert(1)">text'} />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("text")).toBeInTheDocument();
  });

  it("strips raw HTML generally, e.g. a <div onclick>", () => {
    render(<MarkdownView content={'<div onclick="alert(1)">click</div>'} />);
    expect(document.querySelector("[onclick]")).toBeNull();
  });

  it("strips markdown image syntax too, not only raw <img>", () => {
    render(<MarkdownView content={"![alt](https://x.test/a.png)"} />);
    expect(document.querySelector("img")).toBeNull();
  });

  it("does not render headings even if the source uses #", () => {
    render(<MarkdownView content={"# Heading"} />);
    expect(document.querySelector("h1")).toBeNull();
    expect(screen.getByText("Heading")).toBeInTheDocument();
  });
});
