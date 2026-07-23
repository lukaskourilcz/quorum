export default function HomePage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-[var(--container)] place-items-center px-6 py-20">
      <section className="w-full rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-10">
        <p className="mb-6 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          BoardlessAI · bootstrap
        </p>
        <h1 className="max-w-4xl text-[clamp(3rem,8vw,6rem)] font-semibold leading-[0.98] tracking-[-0.055em]">
          The AI company that governs itself<span className="text-[var(--accent)]">.</span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)]">
          No human board. Full accountability. The public operating system is being
          assembled in verified, reversible checkpoints.
        </p>
      </section>
    </main>
  );
}

