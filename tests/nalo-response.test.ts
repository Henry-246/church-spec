import { describe, expect, it } from "vitest";
import { parseNaloResponse } from "@/lib/sms/nalo-response";

describe("parseNaloResponse", () => {
  it("JSON success (from Nalo docs)", () => {
    const r = parseNaloResponse(200, '{"status":"1701","job_id":"api.0000011.20221222.0000003","msisdn":"233244071872"}');
    expect(r).toEqual({ ok: true, code: "1701", providerMessageId: "api.0000011.20221222.0000003", retryable: false });
  });
  it("plain-text success (GET format)", () => {
    const r = parseNaloResponse(200, "1701|233501371674|api.0000011.20220418.0000001");
    expect(r.ok).toBe(true);
    expect(r.providerMessageId).toBe("api.0000011.20220418.0000001");
  });
  it("XML success", () => {
    const r = parseNaloResponse(200, '<?xml version="1.0"?><root><status>1701</status><job_id>api.1</job_id><msisdn>233540105690</msisdn></root>');
    expect(r).toMatchObject({ ok: true, providerMessageId: "api.1" });
  });
  it("XML invalid sender (from Nalo docs)", () => {
    const r = parseNaloResponse(412, '<?xml version="1.0" encoding="utf-8"?>\n<root>\n<code>1707</code>\n<message>Invalid Source(Sender)</message>\n</root>');
    expect(r.ok).toBe(false);
    expect(r.code).toBe("1707");
    expect(r.error).toMatch(/sender ID/i);
    expect(r.retryable).toBe(false);
  });
  it("JSON error with status or code", () => {
    expect(parseNaloResponse(200, '{"status":"1025"}')).toMatchObject({ ok: false, code: "1025", retryable: false });
    expect(parseNaloResponse(400, '{"code":"1706","message":"Invalid Destination"}').error).toMatch(/phone number/i);
  });
  it("plain error code", () => {
    expect(parseNaloResponse(200, "1709")).toMatchObject({ ok: false, code: "1709" });
    expect(parseNaloResponse(200, "1702|")).toMatchObject({ ok: false, code: "1702" });
  });
  it("internal error is retryable", () => {
    expect(parseNaloResponse(200, "1710").retryable).toBe(true);
  });
  it("unknown code is a non-retryable failure", () => {
    expect(parseNaloResponse(200, "1999")).toMatchObject({ ok: false, retryable: false });
  });
  it("server error with garbage is retryable", () => {
    expect(parseNaloResponse(502, "<html>Bad gateway</html>")).toMatchObject({ ok: false, retryable: true });
  });
  it("unrecognised 200 reply is NOT retried (could duplicate)", () => {
    const r = parseNaloResponse(200, "OK");
    expect(r).toMatchObject({ ok: false, retryable: false });
    expect(r.error).toMatch(/may or may not/);
  });
  it("empty body", () => {
    expect(parseNaloResponse(200, "").ok).toBe(false);
  });
});
