# The marketing Calendar

Version: 2026-09-28

Authority: GitHub #592. The owner moved the devShark and DNESKAi launch to **Thursday 5 November
2026** on 28 September; both plans run 5 Nov to 4 Dec.

`/admin/calendar` shows the 30-day marketing plan of devShark and of DNESKAi on one screen each:
every post, ad, task and review, day by day, with the status the Queue reports. You read the plan
here, work the pre-launch checklist, and move an entry through planned, drafted, skipped or
blocked. The calendar publishes nothing, books no ad and starts no room.

## Where it lives

| What | Where |
| --- | --- |
| devShark plan | `state/marketing-calendar/marketingshark.json` |
| DNESKAi plan | `state/marketing-calendar/caught-up.json` |
| Contract | `orchestrator/src/contracts/marketing-calendar.ts`, `contracts/marketing-calendar.schema.json` |
| Site parser and derived views | `site/src/lib/marketing-calendar-model.ts`, `site/src/lib/marketing-calendar-view.ts` |
| Server reader | `site/src/lib/admin-marketing-calendar.ts` |
| Writer and route | `site/src/lib/admin-marketing-calendar-store.ts`, `POST /admin/api/marketing-calendar` |
| Screen | `site/src/components/admin/marketing-calendar/` |

The file names use the registry ids (`marketingshark`, `caught-up`); the document's own `project`
field stays `devshark` or `dneskai`. own-dashboard reads the same two files from `main`.

## Placement

The Calendar is a Company destination between Queue and Settings, with the `CalendarDays` icon.
Both workspaces also carry it as a `calendar` tab (`/admin?venture=marketingshark&tab=calendar`,
`/admin?venture=caught-up&tab=calendar`), rendered by the same server component without the
venture switch.

The address holds the whole view, so a link reopens exactly what you saw:

```
/admin/calendar?venture=marketingshark|caught-up&week=YYYY-MM-DD&view=month&entry=<id>
  &platform=&kind=&status=&pillar=&producer=&q=&upcoming=1
```

An unknown value falls back to its default. `dneskai` and `devshark` work as venture aliases.
Moving the week and opening an entry are history steps, so Back closes the dialog or returns to
the previous week; filters replace the current step.

## The screen, top to bottom

1. **Brief.** Name, tagline, description, audience and goal, the launch date and period with a
   countdown ("Launch in 38 days"), then the KPI table (baseline, target, where it is measured)
   and the channels in row order.
2. **Pre-launch callout.** Before launch only: tasks done, the next one due, a link to the list.
3. **Summary.** Posts per platform, tasks and reviews, the ad budget, owner time per week (from
   `effortMin`), the share of posts published, and the next entry still to do.
4. **Week grid.** Rows are the platforms in channel order, then Ads, then Tasks & reviews; columns
   are Monday to Sunday. Each cell shows time, kind, who makes it, status and title. The status
   sets the surface and its own icon (planned, drafted, queued, published, skipped, blocked), and
   a blocked entry names its reason in a tooltip and in its label. An ad is a bar across its
   dates. The thin left stripe is the venture's hue and only decoration. Day headers carry the
   day's effort and, for devShark, marketingShark's rotation kind. Arrow keys move between
   entries, Home and End jump along a row, Enter opens one. On a phone the grid scrolls sideways
   and opens on today or on the plan's first day.
5. **Month overview.** The period in weeks: a count per platform in each day, ad days and review
   days marked. A day or a week label opens that week. The week themes follow.
6. **The complete plan.** Every entry, grouped by week under the week's theme and focus, with
   date, time, platform, kind, title, hook, pillar, producer, measure, effort and status. Filters
   for platform, kind, status, pillar and producer show how many entries each option leaves;
   search ignores Czech diacritics; "Only upcoming" hides past days. Print lays the list out on
   paper without the admin chrome.
7. **Sections.** Ads (dates, budget, objective and audience, the boosted entry, stop rule,
   policy), the pre-launch checklist, reviews with their decision rules, pillars (planned share
   against the plan's actual share, with the IG TIPS behind each), profile setup, risks, product
   dependencies with their repository issues, and sources.

An entry opens in a dialog: hook and hook type, the body slide by slide where it is written that
way, CTA, what to read after 48 hours, effort, assets, the IG TIPS as links to own-dashboard
(`/ig-tips?q=<title>`, base URL `OWN_DASHBOARD_URL`, default
`https://own-dashboard-tau.vercel.app`), links to the Queue and to the Design Lab when a package
exists, and the status control. Previous and Next step through the filtered list.

## Status: who sets what

| Status | Set by |
| --- | --- |
| planned, drafted, skipped, blocked | You, in the dialog. Blocked needs a note that says what blocks it. |
| queued | The Queue: an item `approved`, `queued` or `publishing` for that date, venture and platform. |
| published | The Queue: an item `published`. |

The reader matches a Queue item to an entry by Prague date, venture (`devshark`, `caught-up`) and
platform. A day can hold two Threads posts and one Queue item, so each item goes to one entry: one
an automated producer drafts before one you write, a fitting kind first. A Queue draft shows as
drafted only over an entry you have not moved yet. Items outside the plan's period are ignored;
items inside it that fit no entry are counted under the grid.

For devShark, a day of the period the plan leaves empty gets a dashed placeholder from
marketingShark's weekday rotation (`config/marketingshark.json`). The committed plans cover every
day, so today none appears.

## Writing back

`POST /admin/api/marketing-calendar` accepts exactly two actions:

```json
{ "venture": "marketingshark", "action": "entry", "id": "ds-005", "status": "blocked", "note": "Threads profile missing" }
{ "venture": "caught-up", "action": "prelaunch", "id": "dn-pre-03", "done": true }
```

It checks the admin session, refuses cross-origin writes (403), bodies over 16 KB (413) and
anything else (422), including `queued` and `published`. The writer changes the entry's `status`
and `note` or the item's `status` and writes every other byte of the document back as it read it.
With `BOARDLESSAI_GITHUB_TOKEN` the change is a commit on `main` (`admin: marketing calendar …`,
three attempts on a sha conflict); in development it is an atomic local write; in production
without a token the controls are inert and say why.

## How to edit a plan

Edit the JSON by hand or replace it with a new research run, in one commit. The format is
`marketing-calendar/1`:

- Top level: `schemaVersion`, `project`, `name`, `tagline`, `description`, `audience`, `goal`,
  `launch`, `period {start, end}`, `kpis[]`, `channels[]`, `pillars[]`, `profileSetup[]`,
  `prelaunch[]`, `weeks[]`, `entries[]`, `ads[]`, `reviews[]`, `risks[]`,
  `productDependencies[]`, `sources[]`.
- An entry: `id`, `date`, `time` (Europe/Prague), `platform`, `kind`, `pillar`, `title` (60
  characters at most), `hook`, `hookType`, `body`, `cta`, `assets[]`, `effortMin`, `status`,
  `blockedBy?`, `producer` (`owner`, `marketingShark`, `dneskai-pack`), `tipRefs[]`, `measure`,
  `links?`, `note?`.
- A pre-launch item: `id`, `due`, `title`, `detail`, `owner` (`owner` or `agent`), `repo`,
  `issue`, `status` (`planned` or `done`).

The October documents lacked `launch`, `period`, `prelaunch` and `producer` and said `work: owner |
auto-draft`. The reader still accepts them: the period becomes the span of the entries and
`auto-draft` becomes the venture's drafting producer. A malformed entry is dropped with its reason
and listed at the top of the screen; the rest of the plan still renders. Run
`pnpm --filter @boardlessai/orchestrator exec vitest run tests/marketing-calendar-parity.test.ts`
to check a new plan against the contract.

## What it is not

- Not a scheduler. `docs/SOCIAL-CAMPAIGNS.md` and `docs/ENGINEERING.md` forbid a second one. Posts
  reach the platforms only through the Queue and the guarded publisher, after your approval.
- Not an ad console. Both ad tests are owner-paid and outside the `$50` cap; the calendar shows
  them and never books them.
- Not a second copy of the Queue. It reads the Queue's status and links to it.

The optional "make this an announcement" bridge from #592 (writing
`state/ventures/marketingshark/announcements/<date>-devshark.json`) is not built: that file is the
owner's hand-written five-slide copy, and an entry's plan text is a brief for it, not the copy.
