import { timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  if (leftBytes.length !== rightBytes.length) {
    const length = Math.max(leftBytes.length, rightBytes.length, 1);
    const paddedLeft = Buffer.alloc(length);
    const paddedRight = Buffer.alloc(length);
    leftBytes.copy(paddedLeft);
    rightBytes.copy(paddedRight);
    timingSafeEqual(paddedLeft, paddedRight);
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
}

export function verifyBasicAuthorization(
  authorization: string | null,
  expectedUser: string | undefined,
  expectedPassword: string | undefined
): "ok" | "missing_config" | "denied" {
  if (!expectedUser || !expectedPassword) {
    return "missing_config";
  }
  if (!authorization?.startsWith("Basic ")) {
    return "denied";
  }
  let decoded: string;
  try {
    decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  } catch {
    return "denied";
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) {
    return "denied";
  }
  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  return verifyAdminCredentials(user, password, expectedUser, expectedPassword);
}

export function verifyAdminCredentials(
  user: string,
  password: string,
  expectedUser: string | undefined,
  expectedPassword: string | undefined
): "ok" | "missing_config" | "denied" {
  if (!expectedUser || !expectedPassword) return "missing_config";
  const userMatches = safeEqual(user, expectedUser);
  const passwordMatches = safeEqual(password, expectedPassword);
  return userMatches && passwordMatches ? "ok" : "denied";
}
