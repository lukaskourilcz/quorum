import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(
  username: string,
  password: string,
  ip: string
): Request {
  return new Request("https://boardless.example/admin/login/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://boardless.example",
      "x-forwarded-for": ip
    },
    body: new URLSearchParams({ username, password })
  });
}

function configure() {
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "correct-password");
  vi.stubEnv("NODE_ENV", "production");
}

describe("admin login submission", () => {
  it("sets a secure session cookie for valid credentials", async () => {
    configure();
    const response = await POST(
      request("owner", "correct-password", "203.0.113.70")
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://boardless.example/admin"
    );
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("boardlessai_admin_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie.toLowerCase()).toContain("samesite=strict");
    expect(cookie).toContain("Secure");
  });

  it("locks an address after repeated invalid credentials", async () => {
    configure();
    const ip = "203.0.113.71";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await POST(request("owner", "wrong", ip));
    }
    const response = await POST(request("owner", "correct-password", ip));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe(
      "locked"
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects cross-origin form submissions", async () => {
    configure();
    const forged = request("owner", "correct-password", "203.0.113.72");
    const response = await POST(
      new Request(forged, { headers: { ...Object.fromEntries(forged.headers), Origin: "https://attacker.example" } })
    );
    expect(response.status).toBe(403);
  });
});
