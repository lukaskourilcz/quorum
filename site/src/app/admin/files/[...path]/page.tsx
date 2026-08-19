import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import {
  AdminCard,
  AdminCardContent,
  AdminEntityBadge,
  AdminPageHeader,
  adminButtonVariants,
} from "@/components/admin/admin-primitives";

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
  // The owner's writing profile. Named exactly rather than by a `ventures/*/*.md` wildcard: this
  // list is an allowlist and every entry on it should be a file somebody decided to publish here.
  /^ventures\/goviral\/profile\.md$/
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
    <main className="min-h-screen bg-[var(--admin-background)] text-[var(--admin-foreground)]">
      <header className="border-b border-[var(--admin-border)] bg-[var(--admin-surface)]">
        <div className="mx-auto flex max-w-[var(--container)] flex-wrap items-center justify-between gap-4 px-5 py-6 md:px-8">
          <AdminPageHeader
            actions={(
              <Link className={adminButtonVariants({ variant: "secondary" })} href="/admin">
                <ArrowLeft aria-hidden="true" className="size-4" />Back to summaries
              </Link>
            )}
            description={<span className="break-all font-mono">state/{record.relativePath}</span>}
            eyebrow={<span className="flex items-center gap-2"><FileText aria-hidden="true" className="size-4 text-[var(--admin-section-accent)]" /><AdminEntityBadge>Full Markdown file</AdminEntityBadge></span>}
            title="Detailed notes"
          />
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-5 py-10 md:px-8 md:py-14">
        <AdminCard>
          <AdminCardContent>
            <pre className="m-0 whitespace-pre-wrap break-words font-sans text-[length:var(--admin-type-body)] leading-7 text-[var(--admin-foreground)]">{record.content}</pre>
          </AdminCardContent>
        </AdminCard>
      </article>
    </main>
  );
}
