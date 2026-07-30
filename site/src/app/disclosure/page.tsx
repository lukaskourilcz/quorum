import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Check, CircleSlash, ExternalLink } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

export const metadata: Metadata = {
  description:
    "BoardlessAI AI, fixture, commercial, brand, model and operating-limit disclosures.",
  title: "Disclosure"
};

export default function DisclosurePage() {
  return (
    <PageShell>
      <PageIntro
        aside={
          <Callout tone="warning">
            Working title. No trademark clearance, legal entity, venture launch,
            customer claim or revenue claim is represented.
          </Callout>
        }
        description="A direct account of what is automated, what is simulated, what requires a person and what has not happened."
        eyebrow="Transparency"
        title="Disclosures & limits"
      />

      <section className="mx-auto max-w-[var(--container)] px-5 pb-20 md:px-8 md:pb-28">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Badge tone="accent">AI operation</Badge>
              <CardTitle className="mt-5">Software roles, human authority</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Agent models can prepare research, proposals, votes, code
                patches, tests, public summaries and publication drafts. People
                retain credentials, legal acts, contracts, brand decisions and
                exceptional spend authority.
              </CardDescription>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Badge tone="warning">Fixture data</Badge>
              <CardTitle className="mt-5">Synthetic means synthetic</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                `FIX-*` opportunities, evidence and the founding standup exist
                only to verify the offline pipeline. They are not customers,
                interviews, market demand, revenue or external activity.
              </CardDescription>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Badge>Commercial</Badge>
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
                  Closest semantic collision
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </Link>
                <Link
                  className="flex items-center gap-2 font-semibold underline underline-offset-4"
                  href="https://www.boardless.dev/"
                >
                  Active software collision
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
            <Badge tone="dark">Claims policy</Badge>
            <h2 className="mt-6 text-5xl font-semibold leading-[0.95] tracking-[-0.06em]">
              “Only” and “world’s first” are blocked.
            </h2>
          </div>
          <div className="space-y-5 md:col-span-7">
            {[
              {
                ok: false,
                text: "“The only AI company that governs itself.” — unverified global superlative."
              },
              {
                ok: false,
                text: "“The world’s first fully agent-operated company.” — unsupported priority claim."
              },
              {
                ok: true,
                text: "“The AI company that governs itself.” — safe positioning copy, not an exclusivity claim."
              },
              {
                ok: true,
                text: "“Three daily shifts. Public decisions. Measurable outcomes.” — implemented process description."
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
                Structured schemas and controls reduce failure modes; they do
                not make model output infallible. Public records should be
                treated as operational disclosures, not medical, legal or
                financial advice. Evidence links and verified system outputs
                take precedence over agent summaries.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
