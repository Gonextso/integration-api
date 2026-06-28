import {
  buildNetworkErrorPayload,
  detectProtocolMismatch,
} from "../../helpers/NebimErrorHelper.js";

describe("NebimErrorHelper protocol mismatch", () => {
  it("detects HTTPS client against HTTP server", () => {
    const error = new Error(
      "write EPROTO 008880F401000000:error:0A0000C6:SSL routines:tls_get_more_records:packet length too long",
    );
    error.code = "EPROTO";

    const result = detectProtocolMismatch(error, "https://192.168.1.10");

    expect(result?.code).toBe("WRONG_PROTOCOL_HTTPS");
  });

  it("detects HTTP client against HTTPS server", () => {
    const error = new Error("Parse Error: Expected HTTP/, RTSP/ or ICE/");

    const result = detectProtocolMismatch(error, "http://192.168.1.10");

    expect(result?.code).toBe("WRONG_PROTOCOL_HTTP");
  });

  it("keeps raw technical detail in network payload", () => {
    const error = new Error(
      "write EPROTO error:0A0000C6:SSL routines:tls_get_more_records:packet length too long",
    );
    error.code = "EPROTO";

    const payload = buildNetworkErrorPayload(error, "https://nebim.local");

    expect(payload?.code).toBe("WRONG_PROTOCOL_HTTPS");
    expect(payload.detail).toContain("EPROTO");
    expect(payload.detail).toContain("tls_get_more_records");
  });

  it("passes through EHOSTUNREACH network errors", () => {
    const error = new Error("connect EHOSTUNREACH 0.0.0.123:80");
    error.code = "EHOSTUNREACH";

    const payload = buildNetworkErrorPayload(error, "http://123");

    expect(payload?.code).toBe("EHOSTUNREACH");
    expect(payload.detail).toContain("EHOSTUNREACH");
  });
});
