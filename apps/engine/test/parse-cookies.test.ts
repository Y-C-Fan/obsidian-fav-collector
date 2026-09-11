import { describe, expect, it } from "vitest";
import { parseStoredCookies, toNetscapeCookies } from "../src/index.js";

describe("parseStoredCookies", () => {
  it("parses JSON array format", () => {
    const out = parseStoredCookies(
      JSON.stringify([
        { name: "a1", value: "abc", domain: ".xiaohongshu.com", path: "/" },
        { name: "web_session", value: "xyz" },
        { name: "", value: "skip" },
      ]),
      "xiaohongshu",
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "a1", value: "abc" });
  });

  it("parses raw header format with platform default domain", () => {
    const out = parseStoredCookies("SESSDATA=abc%2C123; bili_jct=xyz; DedeUserID=42", "bilibili");
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ name: "SESSDATA", value: "abc%2C123", domain: ".bilibili.com", path: "/" });
    expect(out[2].name).toBe("DedeUserID");
    expect(out[0].expires).toBeGreaterThan(Date.now() / 1000);
  });

  it("returns [] for garbage", () => {
    expect(parseStoredCookies("no-equals-here", "bilibili")).toHaveLength(0);
  });
});

describe("toNetscapeCookies", () => {
  it("emits Netscape format with secure flags and expiries", () => {
    const out = toNetscapeCookies(
      [
        { name: "SID", value: "s1", domain: ".youtube.com", path: "/" },
        { name: "__Secure-1PSID", value: "s2", domain: "youtube.com", path: "/" },
      ],
      new Date("2026-01-01T00:00:00Z").getTime(),
    );
    const lines = out.trim().split("\n");
    expect(lines[0]).toBe("# Netscape HTTP Cookie File");
    expect(lines[2]).toBe(".youtube.com\tTRUE\t/\tFALSE\t1798761600\tSID\ts1");
    expect(lines[3]).toBe(".youtube.com\tTRUE\t/\tTRUE\t1798761600\t__Secure-1PSID\ts2");
  });
});
