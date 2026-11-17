import { describe, it, expect } from "vitest";
import { buildApiUrl } from "../apiUrl";

describe("buildApiUrl", () => {
  it("stays relative when no base is set (web)", () => {
    expect(buildApiUrl(undefined, "/api/upload")).toBe("/api/upload");
    expect(buildApiUrl("", "/api/upload")).toBe("/api/upload");
  });
  it("prefixes the base origin (native)", () => {
    expect(buildApiUrl("https://app.example.com", "/api/upload")).toBe(
      "https://app.example.com/api/upload",
    );
  });
  it("tolerates trailing slash on base and missing leading slash on path", () => {
    expect(buildApiUrl("https://app.example.com/", "api/upload")).toBe(
      "https://app.example.com/api/upload",
    );
  });
});
