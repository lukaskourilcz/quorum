"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

interface LoginError {
  title: string;
  message: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className={buttonVariants({
        className: "cursor-pointer",
        variant: "accent",
        size: "large"
      })}
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : null}
      {pending ? "Checking your details…" : "Open project desk"}
    </button>
  );
}

export function AdminLoginForm({ error }: { error?: LoginError }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <>
      {error ? (
        <Callout className="mb-6" id="login-error" tone="danger">
          <strong className="block">{error.title}</strong>
          <span className="mt-1 block">{error.message}</span>
        </Callout>
      ) : null}

      <form action="/admin/login/submit" className="grid gap-5" method="post">
        <div>
          <label className="mb-2 block text-sm font-semibold" htmlFor="username">
            Username
          </label>
          <input
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={error ? true : undefined}
            autoComplete="username"
            autoFocus
            className="min-h-12 w-full rounded-[var(--radius-button)] border border-[var(--steel)] bg-[var(--surface)] px-4 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--fog)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
            id="username"
            maxLength={160}
            name="username"
            required
            spellCheck={false}
            type="text"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              aria-describedby={error ? "login-error" : undefined}
              aria-invalid={error ? true : undefined}
              autoComplete="current-password"
              className="min-h-12 w-full rounded-[var(--radius-button)] border border-[var(--steel)] bg-[var(--surface)] px-4 pr-14 text-base text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25"
              id="password"
              maxLength={512}
              name="password"
              required
              type={showPassword ? "text" : "password"}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex min-w-12 cursor-pointer items-center justify-center rounded-r-[var(--radius-button)] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
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
