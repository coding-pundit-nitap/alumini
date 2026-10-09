import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { legalConfig } from "@/config/legal";

import { LegalPage, LegalSection } from "./legal-page";

const approved = legalConfig.approved;
afterEach(() => {
  legalConfig.approved = approved;
});

function page() {
  return (
    <LegalPage title="Terms of use" intro={<p>Intro</p>}>
      <LegalSection id="conduct" title="How to behave">
        <p>Be kind.</p>
      </LegalSection>
    </LegalPage>
  );
}

describe("LegalPage", () => {
  it("renders the title, the last-updated date and each section as a labelled region", () => {
    render(page());
    expect(
      screen.getByRole("heading", { level: 1, name: "Terms of use" })
    ).toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAttribute(
      "dateTime",
      legalConfig.lastUpdated
    );
    expect(
      screen.getByRole("region", { name: "How to behave" })
    ).toHaveTextContent("Be kind.");
  });

  it("says the copy is a draft until the institute approves it", () => {
    legalConfig.approved = false;
    const { unmount } = render(page());
    expect(screen.getByRole("note")).toHaveTextContent(/draft/i);
    unmount();

    legalConfig.approved = true;
    render(page());
    expect(screen.queryByRole("note")).toBeNull();
  });
});
