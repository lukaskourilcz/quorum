import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
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
  return <h3 className="text-2xl font-semibold tracking-[-0.04em]" id={id}>{children}</h3>;
}

function ScoreRows({ chunk }: { chunk: AdminDoorMoneyChunk }) {
  return (
    <dl className="grid gap-3">
      {Object.entries(chunk.scores).map(([axis, result]) => (
        <div className="grid gap-1.5" key={axis}>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm font-semibold capitalize text-[var(--foreground)]">{label(axis)}</dt>
            <dd className="shrink-0 font-mono text-xs text-[var(--mist)]">{result.score} / 5</dd>
          </div>
          <div aria-label={`${label(axis)}: ${result.score} out of 5`} aria-valuemax={5} aria-valuemin={0}
            aria-valuenow={result.score} aria-valuetext={`${result.score} out of 5. ${result.justification}`}
            className="h-2 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--secondary)]" role="meter">
            <div className="h-full rounded-[var(--radius-pill)] bg-[var(--accent)]" style={{ width: `${result.score * 20}%` }} />
          </div>
          <p className="text-xs leading-5 text-[var(--fog)]">{result.justification}</p>
        </div>
      ))}
    </dl>
  );
}

function Passage({ chunk }: { chunk: AdminDoorMoneyChunk }) {
  return (
    <article className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">{chunk.id} · {chunk.sceneId}</p>
            <h5 className="mt-2 text-lg font-semibold text-[var(--foreground)]">{chunk.summary}</h5>
          </div>
          <Badge>{label(chunk.storyType)}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {chunk.themes.map((theme) => <Badge key={theme} tone="dark">{label(theme)}</Badge>)}
        </div>
      </header>
      <div className="mt-5 grid gap-6 border-t border-[var(--border)] pt-5 lg:grid-cols-[minmax(0,3fr)_minmax(14rem,2fr)]">
        <section aria-label={`Scores for ${chunk.id}`}>
          <ScoreRows chunk={chunk} />
        </section>
        <div className="grid content-start gap-5">
          <section>
            <h6 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Public derivatives</h6>
            <p className="mt-2 text-sm leading-6 text-[var(--fog)]">Era: {label(chunk.era)}{chunk.arc ? ` · Arc: ${label(chunk.arc)}` : ""}</p>
            {chunk.quotables.length ? (
              <ul className="mt-3 grid gap-2">{chunk.quotables.map((quote) => (
                <li className="border-l-2 border-[var(--accent)] pl-3 text-sm leading-6 text-[var(--foreground)]" key={quote}>{quote.slice(0, 200)}</li>
              ))}</ul>
            ) : <p className="mt-2 text-sm text-[var(--fog)]">No quotable derivative was recorded.</p>}
          </section>
          <section>
            <h6 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Usage history</h6>
            {chunk.usageHistory.length ? <ul className="mt-2 grid gap-2">{chunk.usageHistory.map((usage) => (
              <li key={`${usage.recommendationId}-${usage.recommendedOn}`}>
                <Link className="text-sm font-semibold text-[var(--foreground)] underline decoration-[var(--steel)] underline-offset-4 hover:decoration-[var(--accent)]"
                  href={`/admin?venture=door-money&tab=recommendations#door-money-recommendation-${usage.recommendationId}`}>
                  {usage.recommendationId}
                </Link>
                <p className="mt-1 text-xs text-[var(--fog)]">{usage.recommendedOn} · {label(usage.format)}</p>
              </li>
            ))}</ul> : <p className="mt-2 text-sm text-[var(--fog)]">This passage has not been used.</p>}
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
      <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">{title}</h4>
      <ul className="mt-3 grid gap-2">{items.map((item) => (
        <li className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-3" key={item.name}>
          <p className="text-sm font-semibold capitalize text-[var(--foreground)]">{label(item.name)}</p>
          <p className="mt-1 text-sm leading-6 text-[var(--fog)]">{item.description}</p>
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
        <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Recorded voice derivative</p>
        <Heading id="door-money-style-heading">Style profile</Heading>
        <p className="mt-2 break-all font-mono text-xs leading-5 text-[var(--fog)]">Profile {profile.profileVersion} · {profile.fingerprintHash}</p>
      </div>
      <Card><CardContent className="grid gap-5">
        <section>
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Sentence rhythm</h4>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Sampled', profile.sentenceRhythm.sampledSentences], ['Mean words', profile.sentenceRhythm.meanWordsPerSentence],
              ['Median words', profile.sentenceRhythm.medianWordsPerSentence], ['Fragments', `${Math.round(profile.sentenceRhythm.fragmentRatio * 100)}%`]].map(([term, value]) => (
              <div className="rounded-[var(--radius-button)] bg-[var(--secondary)] p-3" key={String(term)}><dt className="text-xs text-[var(--fog)]">{term}</dt><dd className="mt-1 font-mono text-sm text-[var(--foreground)]">{value}</dd></div>
            ))}
          </dl>
          <ul className="mt-3 grid gap-1 text-sm leading-6 text-[var(--fog)]">{profile.sentenceRhythm.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </section>
        <section>
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Vocabulary</h4>
          {vocabulary.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{vocabulary.map((item) => (
            <li className="rounded-[var(--radius-button)] border border-[var(--border)] p-3" key={`${item.value}-${item.occurrences}`}>
              <p className="font-semibold text-[var(--foreground)]">{item.value} · {item.occurrences}</p><p className="mt-1 text-sm leading-6 text-[var(--fog)]">{item.note}</p>
            </li>
          ))}</ul> : <p className="mt-2 text-sm text-[var(--fog)]">No recurring vocabulary was recorded.</p>}
          <p className="mt-3 text-sm leading-6 text-[var(--fog)]">Profanity register: {profile.vocabulary.profanity.level}. {profile.vocabulary.profanity.note}</p>
          {profile.vocabulary.profanity.terms.length ? <ul className="mt-2 grid gap-1 text-sm leading-6 text-[var(--fog)]">{profile.vocabulary.profanity.terms.map((term) => (
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
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Humor mechanics</h4>
          <ul className="mt-3 grid gap-3">{profile.humorMechanics.map((item) => <li key={item.name}><p className="font-semibold capitalize">{label(item.name)}</p><p className="mt-1 text-sm leading-6 text-[var(--fog)]">{item.description}</p><p className="mt-1 text-xs text-[var(--fog)]">Signals: {item.signals.join(", ")}</p></li>)}</ul>
        </section>
        <section>
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Negative space</h4>
          <ul className="mt-3 grid list-disc gap-2 pl-5 text-sm leading-6 text-[var(--fog)]">{profile.negativeSpace.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">First-person habits</h4>
          <ul className="mt-3 grid list-disc gap-2 pl-5 text-sm leading-6 text-[var(--fog)]">{profile.storytelling.firstPersonHabits.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Tense usage</h4>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-[var(--fog)]">{profile.storytelling.tenseUsage.map((item) => (
            <li key={item.tense}><span className="font-semibold capitalize text-[var(--foreground)]">{item.tense} · {Math.round(item.ratio * 100)}%</span><br />{item.note}</li>
          ))}</ul>
        </section>
      </CardContent></Card>
      <section>
        <h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Format adaptations</h4>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">{profile.formatAdaptations.map((item) => (
          <Card key={item.format}><CardContent><h5 className="text-lg font-semibold capitalize">{label(item.format)}</h5>
            {[['Preserve', item.preserve], ['Adapt', item.adapt], ['Avoid', item.avoid]].map(([title, entries]) => (
              <section className="mt-4" key={String(title)}><h6 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--mist)]">{title}</h6><ul className="mt-2 grid list-disc gap-1 pl-5 text-sm leading-6 text-[var(--fog)]">{(entries as string[]).map((entry) => <li key={entry}>{entry}</li>)}</ul></section>
            ))}
          </CardContent></Card>
        ))}</div>
      </section>
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Capped exemplars</h4><p className="text-xs text-[var(--fog)]">{profile.exemplars.length} of 40 maximum</p></div>
        {profile.exemplars.length ? <ul className="mt-3 grid gap-3 lg:grid-cols-2">{profile.exemplars.slice(0, 40).map((item) => (
          <li className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--surface)] p-4" key={item.id}>
            <p className="font-mono text-[0.65625rem] uppercase tracking-[0.12em] text-[var(--fog)]">{item.chunkId} · {item.formats.map(label).join(", ")}</p>
            <blockquote className="mt-3 border-l-2 border-[var(--accent)] pl-3 text-sm leading-6 text-[var(--foreground)]">{item.text.slice(0, 280)}</blockquote>
          </li>
        ))}</ul> : <p className="mt-2 text-sm text-[var(--fog)]">No exemplar derivative was recorded.</p>}
      </section>
    </section>
  );
}

export function DoorMoneyKnowledgePanel({ knowledge }: { knowledge: AdminDoorMoneyKnowledge }) {
  if (knowledge.state === "missing") return <Callout>No Door Money knowledge version exists yet. Ingestion remains an owner-run CLI task.</Callout>;
  if (knowledge.state === "unreadable" || !knowledge.index || !knowledge.styleProfile) {
    return <Callout tone="danger">The current Door Money knowledge version could not be read. No partial or replacement record is shown.</Callout>;
  }
  const { index, styleProfile } = knowledge;
  return (
    <div className="grid gap-10">
      <section aria-labelledby="door-money-ingestion-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3"><Heading id="door-money-ingestion-heading">Ingestion status</Heading><Badge>Read-only</Badge></div>
        <Card className="mt-4"><CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div><dt className="text-xs text-[var(--fog)]">Manuscript hash</dt><dd className="mt-1 break-all font-mono text-xs leading-5">{index.manuscriptHash}</dd></div>
            <div><dt className="text-xs text-[var(--fog)]">Chunks</dt><dd className="mt-1 font-mono text-sm">{index.chunkCount}</dd></div>
            <div><dt className="text-xs text-[var(--fog)]">Recorded cost</dt><dd className="mt-1 font-mono text-sm">{formatUsd(index.ingestionCostUsd)}</dd></div>
            <div><dt className="text-xs text-[var(--fog)]">Generated</dt><dd className="mt-1 font-mono text-xs leading-5">{index.generatedAt}</dd></div>
          </dl>
          <p className="mt-5 text-sm leading-6 text-[var(--fog)]">Models: annotation {index.modelVersions.annotation}; rollup {index.modelVersions.rollup}; embedding {index.modelVersions.embedding}; style map {styleProfile.modelVersions.chapterMap}; synthesis {styleProfile.modelVersions.synthesis}.</p>
          <p className="mt-2 text-xs leading-5 text-[var(--fog)]">This page cannot re-run ingestion. The owner-approved CLI creates a new recorded version.</p>
        </CardContent></Card>
      </section>

      <section aria-labelledby="door-money-chapters-heading">
        <div><p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--mist)]">Public knowledge derivative</p><Heading id="door-money-chapters-heading">Chapters and passages</Heading></div>
        <div className="mt-5 grid gap-5">{index.chapters.map((chapter) => {
          const chunks = index.chunks.filter((chunk) => chunk.chapterId === chapter.id);
          return <Card key={chapter.id}><CardContent>
            <header><p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--fog)]">Chapter {chapter.ordinal} · {chapter.id} · {chunks.length} passage{chunks.length === 1 ? "" : "s"}</p><h4 className="mt-2 text-xl font-semibold leading-tight">{chapter.summary}</h4></header>
            <div className="mt-5 grid gap-3">{chunks.map((chunk) => <Passage chunk={chunk} key={chunk.id} />)}</div>
          </CardContent></Card>;
        })}</div>
      </section>
      <StyleProfile profile={styleProfile} />
    </div>
  );
}
