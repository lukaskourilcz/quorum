import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { sanitizeAdminReturnTo } from "@/lib/admin-return-to";
import { Mark } from "@/components/brand/mark";
import {
  AdminCard,
  AdminCardContent,
  AdminPageHeader,
  AdminStatusBadge,
  adminButtonVariants,
} from "@/components/admin/admin-primitives";

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
    <main className="flex min-h-dvh items-center bg-[var(--admin-background)] px-5 py-10 md:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section aria-labelledby="login-heading" className="max-w-2xl">
          <div className="flex items-center gap-3">
            <Mark className="bg-[var(--admin-primary)] text-[var(--admin-primary-foreground)]" />
            <span className="font-semibold">BoardlessAI</span>
            <AdminStatusBadge tone="warning">Private</AdminStatusBadge>
          </div>
          <AdminPageHeader
            className="mt-10"
            description="Review saved ideas, control optional agents and inspect article and social drafts. Nothing here publishes by itself."
            eyebrow="Owner access"
            title={<span id="login-heading">Your project desk<span className="text-[var(--admin-section-accent)]">.</span></span>}
          />
          <div className="mt-7 grid gap-3 text-[length:var(--admin-type-body)] sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--admin-section-accent)]" />
              <span>Eight-hour secure session</span>
            </div>
            <div className="flex items-start gap-3 rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
              <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--admin-section-accent)]" />
              <span>Hidden from search engines</span>
            </div>
          </div>
        </section>

        <AdminCard>
          <AdminCardContent className="p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-[var(--admin-radius)] bg-[var(--admin-surface-secondary)] text-[var(--admin-section-accent)]">
                <KeyRound aria-hidden="true" className="size-5" />
              </div>
              <div>
                <h2 className="text-[length:var(--admin-type-dialog)] font-semibold tracking-[var(--admin-tracking-tight)]">Sign in</h2>
                <p className="mt-1 text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">Use the details saved in Vercel.</p>
              </div>
            </div>

            <AdminLoginForm error={error} returnTo={destination} />

            <div className="mt-6 border-t border-[var(--admin-border)] pt-5">
              <Link className={adminButtonVariants({ variant: "ghost" })} href="/">
                <ArrowLeft aria-hidden="true" className="size-4" />
                Return to the public site
              </Link>
            </div>
          </AdminCardContent>
        </AdminCard>
      </div>
    </main>
  );
}
