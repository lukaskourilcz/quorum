import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken
} from "../../src/lib/admin-session";

export const ADMIN_E2E_USER = "e2e-owner";
export const ADMIN_E2E_PASSWORD = "e2e-password";

export function adminE2EStorageState(startedAt = Date.now()) {
  return {
    cookies: [
      {
        domain: "localhost",
        expires:
          Math.floor(startedAt / 1_000) + ADMIN_SESSION_MAX_AGE_SECONDS,
        httpOnly: true,
        name: ADMIN_SESSION_COOKIE,
        path: "/",
        sameSite: "Strict" as const,
        secure: false,
        value: createAdminSessionToken(
          ADMIN_E2E_USER,
          ADMIN_E2E_PASSWORD,
          startedAt
        )
      }
    ],
    origins: []
  };
}

export function adminE2EServerEnv(repositoryRoot: string) {
  return {
    ADMIN_PASSWORD: ADMIN_E2E_PASSWORD,
    ADMIN_USER: ADMIN_E2E_USER,
    BOARDLESSAI_GITHUB_TOKEN: "",
    BOARDLESSAI_REPO_ROOT: repositoryRoot
  };
}
