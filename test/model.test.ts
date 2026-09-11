import { describe, expect, it } from "vitest";
import { cookieHeader, parseCookieString, toDateOnly } from "../src/sync/model.js";

describe("model helpers", () => {
  it("toDateOnly normalizes timestamps", () => {
    expect(toDateOnly(1720000000)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(toDateOnly(1720000000000)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(toDateOnly("2024-01-15")).toBe("2024-01-15");
    expect(toDateOnly("2024-01-15T12:00:00Z")).toBe("2024-01-15");
    expect(toDateOnly(null)).toBeUndefined();
    expect(toDateOnly("garbage")).toBeUndefined();
  });

  it("parses cookie strings", () => {
    expect(parseCookieString("a=1; b=2 ;c=3")).toEqual({ a: "1", b: "2", c: "3" });
    expect(cookieHeader({ a: "1" })).toBe("a=1");
  });
});
