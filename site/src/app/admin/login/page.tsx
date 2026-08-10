import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { sanitizeAdminReturnTo } from "@/lib/admin-return-to";
import { Mark } from "@/components/brand/mark";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Admin login",
  description: "Sign in to the private BoardlessAI project desk.",
  robots: { follow: false, index: false, nocache: true }
};

const errors: Record<string, { title: string; message: string }> = {
  config: {
    title: "Login is not ready yet",
    message:
      "ADMIN_USER and ADMIN_PASSWORD are missing from this deployment. Add them to Vercel Production and redeploy."
  },
  expired: {
    title: "Your session ended",
    message: "Sign in again to continue. Your saved work was not changed."
  },
  invalid: {
    title: "Those details did not match",
    message: "Check the username and password stored in Vercel, then try again."
  },
  // The attempt counter is per running instance, not shared across the fleet, so this cannot
  // promise a lockout — it says what it actually does: slows this connection down for a while.
  locked: {
    title: "Too many attempts",
    message: "Sign-in is paused for about 15 minutes. Wait, then try again."
  }
};

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { error: errorKey = "", returnTo } = await searchParams;
  const error = errors[errorKey];
  // Validated here as well as at the proxy and the submit route: this is the value that reaches
  // the browser as a form field, and each hop treats the last one's output as untrusted.
  const destination = sanitizeAdminReturnTo(returnTo, "https://boardless.invalid");

  return (
    <main className="editorial-grid flex min-h-dvh items-center px-5 py-10 md:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section aria-labelledby="login-heading" className="max-w-2xl">
          <div className="flex items-center gap-3">
            <Mark />
            <span className="font-semibold">BoardlessAI</span>
            <Badge tone="warning">Private</Badge>
          </div>
          <p className="mt-12 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Owner access
          </p>
          <h1
            className="mt-4 text-5xl font-semibold tracking-[-0.06em] sm:text-6xl lg:text-7xl"
            id="login-heading"
          >
            Your project desk
            <span className="text-[var(--accent)]">.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[var(--muted-foreground)]">
            Review saved ideas, control optional agents and inspect article and social drafts. Nothing here publishes by itself.
          </p>
          <div className="mt-8 grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
              <span>Eight-hour secure session</span>
            </div>
            <div className="flex items-start gap-3 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
              <span>Hidden from search engines</span>
            </div>
          </div>
        </section>

        <Card className="bg-[var(--card)] shadow-2xl shadow-black/20">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-[var(--radius-button)] bg-[var(--secondary)] text-[var(--accent)]">
                <KeyRound aria-hidden="true" className="size-5" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.04em]">Sign in</h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Use the details saved in Vercel.</p>
              </div>
            </div>

            <AdminLoginForm error={error} returnTo={destination} />

            <div className="mt-6 border-t border-[var(--border)] pt-5">
              <Link className={buttonVariants({ variant: "ghost", size: "small" })} href="/">
                <ArrowLeft aria-hidden="true" className="size-4" />
                Return to the public site
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
