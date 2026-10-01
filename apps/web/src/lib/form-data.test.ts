import { describe, expect, it } from "vitest";

import { assertFormData, assertObjectInput, pickFields } from "./form-data";

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

describe("assertFormData (spec 16 16B)", () => {
  it("passes FormData through", () => {
    expect(() => assertFormData(new FormData())).not.toThrow();
  });

  it.each([["a string"], [undefined], [null], [{ get: () => "x" }], [42]])(
    "refuses %o with 400 MALFORMED_REQUEST",
    (value) => {
      expect(() => assertFormData(value)).toThrow(
        expect.objectContaining({ status: 400, code: "MALFORMED_REQUEST" })
      );
    }
  );
});

describe("assertObjectInput (spec 16 16B)", () => {
  it("passes a plain object", () => {
    expect(() => assertObjectInput({ mime: "image/png" })).not.toThrow();
  });

  it.each([[undefined], [null], ["x"], [[1, 2]], [7]])(
    "refuses %o with 400 MALFORMED_REQUEST",
    (value) => {
      expect(() => assertObjectInput(value)).toThrow(
        expect.objectContaining({ status: 400, code: "MALFORMED_REQUEST" })
      );
    }
  );
});
