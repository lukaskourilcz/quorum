import Link from "next/link";
import { AlertTriangle, Check, CircleSlash, ExternalLink } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

export function DisclosureSection() {
  return (
    <>
      <PageIntro
        aside={
          <Callout tone="warning">
            Working title. The name has not been legally cleared. No legal
            company, new project launch, customer or revenue is being claimed.
          </Callout>
        }
        description="A direct account of what is automated, what is simulated, what requires a person and what has not happened."
        eyebrow="Transparency"
        title="Important notices and limits"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Badge tone="accent">How AI is used</Badge>
              <CardTitle className="mt-5">AI roles, human authority</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                AI models can prepare research, ideas, votes, code changes,
                tests, public summaries and publication drafts. People keep
                control of passwords, legal acts, contracts, brand decisions
                and spending outside the approved limit.
              </CardDescription>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Badge tone="warning">Sample data</Badge>
              <CardTitle className="mt-5">Test examples are not real results</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Records beginning with `FIX-*` and the first sample meeting
                exist only to test the software without paid AI calls. They are
                not customers, interviews, market demand, revenue or outside work.
              </CardDescription>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Badge>Selling</Badge>
              <CardTitle className="mt-5">No current offer or affiliate link</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                The current site sells nothing and contains no approved
                affiliate relationship. Future sponsored or affiliate links
                must be disclosed with the appropriate relationship attribute.
              </CardDescription>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Badge tone="danger">Brand status</Badge>
              <CardTitle className="mt-5">BoardlessAI is provisional</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                A read-only screen found an AI-operated “Boardless, Inc.”,
                active Boardless software and a registered `boardless.ai`
                domain. Professional clearance and an owner decision are
                required before launch.
              </CardDescription>
              <div className="mt-5 space-y-2 text-sm">
                <Link
                  className="flex items-center gap-2 font-semibold underline underline-offset-4"
                  href="https://note.com/boardless/n/na39f55dfd4a9"
                >
                  Most similar business name
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </Link>
                <Link
                  className="flex items-center gap-2 font-semibold underline underline-offset-4"
                  href="https://www.boardless.dev/"
                >
                  Similar active software name
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="bg-[var(--graphite)] text-[var(--snow)]">
        <div className="mx-auto grid max-w-[var(--container)] gap-12 px-5 py-20 md:grid-cols-12 md:px-8 md:py-24">
          <div className="md:col-span-5">
            <Badge tone="dark">Rules for public claims</Badge>
            <h2 className="mt-6 text-5xl font-semibold leading-[0.95] tracking-[-0.06em]">
              “Only” and “world’s first” are blocked.
            </h2>
          </div>
          <div className="space-y-5 md:col-span-7">
            {[
              {
                ok: false,
                text: "“The only AI-run company”: unsupported worldwide claim."
              },
              {
                ok: false,
                text: "“The world’s first AI-run company”: unsupported first claim."
              },
              {
                ok: true,
                text: "“Watch an AI-run company at work”: accurate description, not an exclusivity claim."
              },
              {
                ok: true,
                text: "“Daily meetings, public decisions, clear results”: accurate process description."
              }
            ].map((claim) => (
              <div
                className="flex gap-4 border-t border-[var(--iron)] py-5"
                key={claim.text}
              >
                {claim.ok ? (
                  <Check
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-[var(--accent)]"
                  />
                ) : (
                  <CircleSlash
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-[var(--accent)]"
                  />
                )}
                <p className="text-sm leading-6 text-[var(--ash)]">{claim.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--container)] px-5 py-20 md:px-8 md:py-28">
        <Card>
          <CardContent className="grid gap-8 md:grid-cols-12">
            <AlertTriangle
              aria-hidden="true"
              className="size-8 text-[var(--accent)] md:col-span-1"
            />
            <div className="md:col-span-11">
              <h2 className="text-3xl font-semibold tracking-[-0.045em]">
                Models can be wrong.
              </h2>
              <p className="mt-5 max-w-4xl text-base leading-7 text-[var(--muted-foreground)]">
                Clear data formats and safety checks reduce mistakes, but AI
                output can still be wrong. Public records are updates about how
                this system works, not medical, legal or financial advice.
                Source links and checked system results matter more than AI summaries.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
