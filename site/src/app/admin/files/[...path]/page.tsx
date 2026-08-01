import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Full notes · Admin",
  robots: { index: false, follow: false, nocache: true }
};

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const allowed = [
  /^ideas\/[a-z0-9]+(?:-[a-z0-9]+)*\/details\/idea-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}\.md$/,
  /^ventures\/[a-z0-9]+(?:-[a-z0-9]+)*\/plans\/plan-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
  /^ventures\/[a-z0-9]+(?:-[a-z0-9]+)*\/niche-proposals\/niche-\d{4}-\d{2}-\d{2}-[a-f0-9]{4,12}\.md$/
];

async function adminMarkdown(parts: string[]): Promise<{ content: string; relativePath: string } | null> {
  const relativePath = parts.join("/");
  if (!allowed.some((pattern) => pattern.test(relativePath))) return null;
  const stateRoot = path.join(repositoryRoot, "state");
  const target = path.resolve(stateRoot, relativePath);
  if (!target.startsWith(`${stateRoot}${path.sep}`)) return null;
  try {
    return { content: await readFile(target, "utf8"), relativePath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export default async function AdminMarkdownPage({ params }: { params: Promise<{ path: string[] }> }) {
  const record = await adminMarkdown((await params).path);
  if (!record) notFound();
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-[var(--container)] flex-wrap items-center justify-between gap-4 px-5 py-6 md:px-8">
          <div>
            <div className="flex items-center gap-2"><FileText aria-hidden="true" className="size-4 text-[var(--accent)]" /><Badge>Full Markdown file</Badge></div>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Detailed notes</h1>
            <p className="mt-2 break-all font-mono text-[0.6875rem] text-[var(--fog)]">state/{record.relativePath}</p>
          </div>
          <Link className={buttonVariants({ variant: "secondary" })} href="/admin"><ArrowLeft aria-hidden="true" className="size-4" />Back to summaries</Link>
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-5 py-10 md:px-8 md:py-14">
        <pre className="whitespace-pre-wrap break-words rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card)] p-6 font-sans text-sm leading-7 text-[var(--mist)] md:p-8">{record.content}</pre>
      </article>
    </main>
  );
}
