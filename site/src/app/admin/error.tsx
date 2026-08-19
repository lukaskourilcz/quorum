"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, LogIn, RotateCcw } from "lucide-react";
import { Mark } from "@/components/brand/mark";
import {
  AdminButton,
  AdminCard,
  AdminCardContent,
  AdminStateMessage,
  adminButtonVariants,
} from "@/components/admin/admin-primitives";

export default function AdminError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("BoardlessAI admin failed to render", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center bg-[var(--admin-background)] px-5 py-10 md:px-8">
      <AdminCard className="mx-auto w-full max-w-2xl">
        <AdminCardContent className="p-7 sm:p-10">
          <div className="flex items-center gap-3">
            <Mark />
            <span className="font-semibold">BoardlessAI Admin</span>
          </div>
          <AdminStateMessage
            action={(
              <div className="flex flex-wrap gap-3">
                <AdminButton onClick={reset} variant="primary">
                  <RotateCcw aria-hidden="true" className="size-4" />
                  Try again
                </AdminButton>
                <Link className={adminButtonVariants({ variant: "secondary" })} href="/admin/login">
                  <LogIn aria-hidden="true" className="size-4" />
                  Return to login
                </Link>
                <Link className={adminButtonVariants({ variant: "ghost" })} href="/">
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  Public site
                </Link>
              </div>
            )}
            className="mt-8"
            description="Your saved files were not changed. Try loading them again. If the problem continues, use the error reference below when checking the deployment logs."
            state="error"
            title="The project desk could not load."
          />
          {error.digest ? (
            <p className="mt-5 break-all rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface-inset)] p-4 font-mono text-[length:var(--admin-type-control)] text-[var(--admin-foreground-muted)]">
              Error reference: {error.digest}
            </p>
          ) : null}
        </AdminCardContent>
      </AdminCard>
    </main>
  );
}
