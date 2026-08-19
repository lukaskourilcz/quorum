import Link from "next/link";
import {
  AdminCard as Card,
  AdminCardContent as CardContent,
  AdminEntityBadge,
  AdminMetric,
  AdminStateMessage,
  AdminStatusBadge as Badge,
} from "./admin-primitives";
import type {
  AdminDoorMoneyChunk,
  AdminDoorMoneyStyleProfile
} from "@/lib/door-money-knowledge-model";
import type { AdminDoorMoneyKnowledge } from "@/lib/admin-door-money";
import { formatUsd } from "@/lib/utils";

function label(value: string): string {
  return value.replaceAll(/([a-z])([A-Z])/gu, "$1 $2").replaceAll("-", " ");
}

function Heading({ children, id }: { children: React.ReactNode; id?: string }) {
  return <h3 className="m-0 text-[length:var(--admin-type-section)] font-semibold" id={id}>{children}</h3>;
}

function ScoreRows({ chunk }: { chunk: AdminDoorMoneyChunk }) {
  return (
    <dl className="grid gap-3">
      {Object.entries(chunk.scores).map(([axis, result]) => (
        <div className="grid gap-1.5" key={axis}>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm font-semibold capitalize text-[var(--admin-foreground)]">{label(axis)}</dt>
            <dd className="shrink-0 font-mono text-xs text-[var(--admin-foreground)]">{result.score} / 5</dd>
          </div>
          <div aria-label={`${label(axis)}: ${result.score} out of 5`} aria-valuemax={5} aria-valuemin={0}
            aria-valuenow={result.score} aria-valuetext={`${result.score} out of 5. ${result.justification}`}
            className="h-1 overflow-hidden rounded-full bg-[var(--admin-surface-muted)]" role="meter">
            <div className="h-full rounded-full bg-[var(--admin-section-accent)]" style={{ width: `${result.score * 20}%` }} />
          </div>
          <p className="text-xs leading-5 text-[var(--admin-foreground-muted)]">{result.justification}</p>
        </div>
      ))}
    </dl>
  );
}

function Passage({ chunk }: { chunk: AdminDoorMoneyChunk }) {
  return (
    <article className="border-l-2 border-[var(--admin-section-accent)] pl-3">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">{chunk.id} · {chunk.sceneId}</p>
            <h5 className="mt-2 text-lg font-semibold text-[var(--admin-foreground)]">{chunk.summary}</h5>
          </div>
          <AdminEntityBadge>{label(chunk.storyType)}</AdminEntityBadge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {chunk.themes.map((theme) => <AdminEntityBadge key={theme}>{label(theme)}</AdminEntityBadge>)}
        </div>
      </header>
      <div className="mt-5 grid gap-6 border-t border-[var(--admin-border)] pt-5 lg:grid-cols-[minmax(0,3fr)_minmax(14rem,2fr)]">
        <section aria-label={`Scores for ${chunk.id}`}>
          <ScoreRows chunk={chunk} />
        </section>
        <div className="grid content-start gap-5">
          <section>
            <h6 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Public derivatives</h6>
            <p className="mt-2 text-sm leading-6 text-[var(--admin-foreground-muted)]">Era: {label(chunk.era)}{chunk.arc ? ` · Arc: ${label(chunk.arc)}` : ""}</p>
            {chunk.quotables.length ? (
              <ul className="mt-3 grid gap-2">{chunk.quotables.map((quote) => (
                <li className="border-l-2 border-[var(--admin-section-accent)] pl-3 text-sm leading-6 text-[var(--admin-foreground)]" key={quote}>{quote.slice(0, 200)}</li>
              ))}</ul>
            ) : <p className="mt-2 text-sm text-[var(--admin-foreground-muted)]">No quotable derivative was recorded.</p>}
          </section>
          <section>
            <h6 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Usage history</h6>
            {chunk.usageHistory.length ? <ul className="mt-2 grid gap-2">{chunk.usageHistory.map((usage) => (
              <li key={`${usage.recommendationId}-${usage.recommendedOn}`}>
                <Link className="text-sm font-semibold text-[var(--admin-foreground)] underline decoration-[var(--admin-border-strong)] underline-offset-4 hover:decoration-[var(--admin-section-accent)]"
                  href={`/admin?venture=door-money&tab=recommendations#door-money-recommendation-${usage.recommendationId}`}>
                  {usage.recommendationId}
                </Link>
                <p className="mt-1 text-xs text-[var(--admin-foreground-muted)]">{usage.recommendedOn} · {label(usage.format)}</p>
              </li>
            ))}</ul> : <p className="mt-2 text-sm text-[var(--admin-foreground-muted)]">This passage has not been used.</p>}
          </section>
        </div>
      </div>
    </article>
  );
}

function NamedPatterns({ title, items }: {
  title: string;
  items: Array<{ name: string; description: string }>;
}) {
  return (
    <section>
      <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">{title}</h4>
      <ul className="mt-3 grid gap-2">{items.map((item) => (
        <li className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3" key={item.name}>
          <p className="text-sm font-semibold capitalize text-[var(--admin-foreground)]">{label(item.name)}</p>
          <p className="mt-1 text-sm leading-6 text-[var(--admin-foreground-muted)]">{item.description}</p>
        </li>
      ))}</ul>
    </section>
  );
}

function StyleProfile({ profile }: { profile: AdminDoorMoneyStyleProfile }) {
  const vocabulary = [...profile.vocabulary.recurringWords, ...profile.vocabulary.recurringPhrases];
  return (
    <section aria-labelledby="door-money-style-heading" className="grid gap-5">
      <div>
        <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Recorded voice derivative</p>
        <Heading id="door-money-style-heading">Style profile</Heading>
        <p className="mt-2 break-all font-mono text-xs leading-5 text-[var(--admin-foreground-muted)]">Profile {profile.profileVersion} · {profile.fingerprintHash}</p>
      </div>
      <Card><CardContent className="grid gap-4">
        <section>
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Sentence rhythm</h4>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Sampled', profile.sentenceRhythm.sampledSentences], ['Mean words', profile.sentenceRhythm.meanWordsPerSentence],
              ['Median words', profile.sentenceRhythm.medianWordsPerSentence], ['Fragments', `${Math.round(profile.sentenceRhythm.fragmentRatio * 100)}%`]].map(([term, value]) => (
              <div className="border-l border-[var(--admin-border)] bg-[var(--admin-surface-secondary)] p-3 first:border-l-0" key={String(term)}><dt className="text-[length:var(--admin-type-label)] text-[var(--admin-foreground-muted)]">{term}</dt><dd className="admin-tabular m-0 mt-1 text-[length:var(--admin-type-control)] font-semibold text-[var(--admin-foreground)]">{value}</dd></div>
            ))}
          </dl>
          <ul className="mt-3 grid gap-1 text-sm leading-6 text-[var(--admin-foreground-muted)]">{profile.sentenceRhythm.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </section>
        <section>
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Vocabulary</h4>
          {vocabulary.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{vocabulary.map((item) => (
            <li className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] p-3" key={`${item.value}-${item.occurrences}`}>
              <p className="font-semibold text-[var(--admin-foreground)]">{item.value} · {item.occurrences}</p><p className="mt-1 text-sm leading-6 text-[var(--admin-foreground-muted)]">{item.note}</p>
            </li>
          ))}</ul> : <p className="mt-2 text-sm text-[var(--admin-foreground-muted)]">No recurring vocabulary was recorded.</p>}
          <p className="mt-3 text-sm leading-6 text-[var(--admin-foreground-muted)]">Profanity register: {profile.vocabulary.profanity.level}. {profile.vocabulary.profanity.note}</p>
          {profile.vocabulary.profanity.terms.length ? <ul className="mt-2 grid gap-1 text-sm leading-6 text-[var(--admin-foreground-muted)]">{profile.vocabulary.profanity.terms.map((term) => (
            <li key={term.value}>{term.value} · {term.occurrences}: {term.usage}</li>
          ))}</ul> : null}
        </section>
      </CardContent></Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <NamedPatterns title="Openings" items={profile.storytelling.openings} />
        <NamedPatterns title="Turns" items={profile.storytelling.turns} />
        <NamedPatterns title="Landings" items={profile.storytelling.landings} />
      </div>
      <Card><CardContent className="grid gap-6 lg:grid-cols-2">
        <section>
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Humor mechanics</h4>
          <ul className="mt-3 grid gap-3">{profile.humorMechanics.map((item) => <li key={item.name}><p className="font-semibold capitalize">{label(item.name)}</p><p className="mt-1 text-sm leading-6 text-[var(--admin-foreground-muted)]">{item.description}</p><p className="mt-1 text-xs text-[var(--admin-foreground-muted)]">Signals: {item.signals.join(", ")}</p></li>)}</ul>
        </section>
        <section>
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Negative space</h4>
          <ul className="mt-3 grid list-disc gap-2 pl-5 text-sm leading-6 text-[var(--admin-foreground-muted)]">{profile.negativeSpace.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">First-person habits</h4>
          <ul className="mt-3 grid list-disc gap-2 pl-5 text-sm leading-6 text-[var(--admin-foreground-muted)]">{profile.storytelling.firstPersonHabits.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Tense usage</h4>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-[var(--admin-foreground-muted)]">{profile.storytelling.tenseUsage.map((item) => (
            <li key={item.tense}><span className="font-semibold capitalize text-[var(--admin-foreground)]">{item.tense} · {Math.round(item.ratio * 100)}%</span><br />{item.note}</li>
          ))}</ul>
        </section>
      </CardContent></Card>
      <section>
        <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Format adaptations</h4>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">{profile.formatAdaptations.map((item) => (
          <Card key={item.format}><CardContent><h5 className="text-lg font-semibold capitalize">{label(item.format)}</h5>
            {[['Preserve', item.preserve], ['Adapt', item.adapt], ['Avoid', item.avoid]].map(([title, entries]) => (
              <section className="mt-4" key={String(title)}><h6 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--admin-foreground)]">{title}</h6><ul className="mt-2 grid list-disc gap-1 pl-5 text-sm leading-6 text-[var(--admin-foreground-muted)]">{(entries as string[]).map((entry) => <li key={entry}>{entry}</li>)}</ul></section>
            ))}
          </CardContent></Card>
        ))}</div>
      </section>
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Capped exemplars</h4><p className="text-xs text-[var(--admin-foreground-muted)]">{profile.exemplars.length} of 40 maximum</p></div>
        {profile.exemplars.length ? <ul className="mt-3 grid gap-3 lg:grid-cols-2">{profile.exemplars.slice(0, 40).map((item) => (
          <li className="rounded-[var(--admin-radius)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4" key={item.id}>
            <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">{item.chunkId} · {item.formats.map(label).join(", ")}</p>
            <blockquote className="mt-3 border-l-2 border-[var(--admin-section-accent)] pl-3 text-sm leading-6 text-[var(--admin-foreground)]">{item.text.slice(0, 280)}</blockquote>
          </li>
        ))}</ul> : <p className="mt-2 text-sm text-[var(--admin-foreground-muted)]">No exemplar derivative was recorded.</p>}
      </section>
    </section>
  );
}

export function DoorMoneyKnowledgePanel({ knowledge }: { knowledge: AdminDoorMoneyKnowledge }) {
  if (knowledge.state === "missing") return <AdminStateMessage state="initial-empty" title="No Door Money knowledge version exists yet." description="Ingestion remains an owner-run CLI task." />;
  if (knowledge.state === "unreadable" || !knowledge.index || !knowledge.styleProfile) {
    return <AdminStateMessage state="malformed" title="The current Door Money knowledge version could not be read." description="No partial or replacement record is shown." />;
  }
  const { index, styleProfile } = knowledge;
  return (
    <div className="grid gap-6">
      <section aria-labelledby="door-money-ingestion-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><Heading id="door-money-ingestion-heading">Ingestion status</Heading><Badge>Read-only</Badge></div>
        <Card className="mt-3"><CardContent>
          <dl className="grid divide-y divide-[var(--admin-border)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
            <AdminMetric className="px-3 first:pl-0" label="Manuscript hash" value={<span className="block break-all text-[length:var(--admin-type-control)]">{index.manuscriptHash}</span>} />
            <AdminMetric className="px-3" label="Chunks" value={index.chunkCount} />
            <AdminMetric className="px-3" label="Recorded cost" value={formatUsd(index.ingestionCostUsd)} />
            <AdminMetric className="px-3 last:pr-0" label="Generated" value={<span className="block break-all text-[length:var(--admin-type-control)]">{index.generatedAt}</span>} />
          </dl>
          <p className="mt-5 text-sm leading-6 text-[var(--admin-foreground-muted)]">Models: annotation {index.modelVersions.annotation}; rollup {index.modelVersions.rollup}; embedding {index.modelVersions.embedding}; style map {styleProfile.modelVersions.chapterMap}; synthesis {styleProfile.modelVersions.synthesis}.</p>
          <p className="mt-2 text-xs leading-5 text-[var(--admin-foreground-muted)]">This page cannot re-run ingestion. The owner-approved CLI creates a new recorded version.</p>
        </CardContent></Card>
      </section>

      <section aria-labelledby="door-money-chapters-heading">
        <div><p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--admin-foreground)]">Public knowledge derivative</p><Heading id="door-money-chapters-heading">Chapters and passages</Heading></div>
        <div className="mt-3 grid gap-4">{index.chapters.map((chapter) => {
          const chunks = index.chunks.filter((chunk) => chunk.chapterId === chapter.id);
          return <Card key={chapter.id}><CardContent>
            <header><p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--admin-foreground-muted)]">Chapter {chapter.ordinal} · {chapter.id} · {chunks.length} passage{chunks.length === 1 ? "" : "s"}</p><h4 className="mt-2 text-xl font-semibold leading-tight">{chapter.summary}</h4></header>
            <div className="mt-5 grid gap-3">{chunks.map((chunk) => <Passage chunk={chunk} key={chunk.id} />)}</div>
          </CardContent></Card>;
        })}</div>
      </section>
      <StyleProfile profile={styleProfile} />
    </div>
  );
}
