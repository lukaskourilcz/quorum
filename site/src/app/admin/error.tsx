"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, LogIn, RotateCcw } from "lucide-react";
import { Mark } from "@/components/brand/mark";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
    <main className="editorial-grid flex min-h-dvh items-center px-5 py-10 md:px-8">
      <Card className="mx-auto w-full max-w-2xl bg-[var(--card)]">
        <CardContent className="p-7 sm:p-10">
          <div className="flex items-center gap-3">
            <Mark />
            <span className="font-semibold">BoardlessAI Admin</span>
          </div>
          <div className="mt-10 flex size-14 items-center justify-center rounded-[var(--radius-button)] bg-[var(--secondary)] text-[var(--accent)]">
            <AlertTriangle aria-hidden="true" className="size-7" />
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            The project desk could not load
            <span className="text-[var(--accent)]">.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted-foreground)]">
            Your saved files were not changed. Try loading them again. If the problem continues, use the error reference below when checking the deployment logs.
          </p>
          {error.digest ? (
            <p className="mt-5 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4 font-mono text-xs text-[var(--muted-foreground)]">
              Error reference: {error.digest}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={reset} variant="accent">
              <RotateCcw aria-hidden="true" className="size-4" />
              Try again
            </Button>
            <Link className={buttonVariants({ variant: "secondary" })} href="/admin/login">
              <LogIn aria-hidden="true" className="size-4" />
              Return to login
            </Link>
            <Link className={buttonVariants({ variant: "ghost" })} href="/">
              <ArrowLeft aria-hidden="true" className="size-4" />
              Public site
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
