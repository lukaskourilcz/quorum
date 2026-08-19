"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import {
  AdminButton,
  AdminCallout,
  AdminInput,
  AdminLabel,
} from "./admin-primitives";

interface LoginError {
  title: string;
  message: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <AdminButton
      className="w-full cursor-pointer"
      disabled={pending}
      type="submit"
      variant="primary"
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : null}
      {pending ? "Checking your details…" : "Open project desk"}
    </AdminButton>
  );
}

export function AdminLoginForm({ error, returnTo }: { error?: LoginError; returnTo?: string | null }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <>
      {error ? (
        <AdminCallout className="mb-6" id="login-error" tone="destructive">
          <strong className="block">{error.title}</strong>
          <span className="mt-1 block">{error.message}</span>
        </AdminCallout>
      ) : null}

      <form action="/admin/login/submit" className="grid gap-5" method="post">
        {/* Already validated on the server; the submit route validates it again on arrival,
            because a form field is whatever the browser sends. */}
        {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
        <div>
          <AdminLabel htmlFor="username">
            Username
          </AdminLabel>
          <AdminInput
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={error ? true : undefined}
            autoComplete="username"
            autoFocus
            className="min-h-12 px-4 text-base"
            id="username"
            maxLength={160}
            name="username"
            required
            spellCheck={false}
            type="text"
          />
        </div>
        <div>
          <AdminLabel htmlFor="password">
            Password
          </AdminLabel>
          <div className="relative">
            <AdminInput
              aria-describedby={error ? "login-error" : undefined}
              aria-invalid={error ? true : undefined}
              autoComplete="current-password"
              className="min-h-12 px-4 pr-14 text-base"
              id="password"
              maxLength={512}
              name="password"
              required
              type={showPassword ? "text" : "password"}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="admin-focus-ring absolute inset-y-0 right-0 flex min-w-12 cursor-pointer items-center justify-center rounded-r-[var(--admin-radius)] text-[var(--admin-foreground-muted)] transition-colors hover:text-[var(--admin-foreground)]"
              onClick={() => setShowPassword((visible) => !visible)}
              type="button"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="size-5" />
              ) : (
                <Eye aria-hidden="true" className="size-5" />
              )}
            </button>
          </div>
        </div>
        <SubmitButton />
      </form>
    </>
  );
}
