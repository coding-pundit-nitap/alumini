import { describe, expect, it } from "vitest";

import { pickFields } from "./form-data";

describe("pickFields", () => {
  it("reads only the named string fields", () => {
    const form = new FormData();
    form.set("rollNumber", "R1");
    form.set("userId", "someone-else");
    form.set("$ACTION_ID_abc", "framework-field");

    expect(pickFields(form, ["rollNumber", "graduationYear"])).toEqual({
      rollNumber: "R1",
    });
  });

  it("ignores a file where a string is expected", () => {
    const form = new FormData();
    form.set("rollNumber", new File(["x"], "x.txt"));
    expect(pickFields(form, ["rollNumber"])).toEqual({});
  });
});
