# Spectator experience decision

Date: 2026-07-30

Owner: Human-invoked engineer

Scope: Public standup and Boardroom experience

Business mode: Hobby / non-commercial

## Product context

BoardlessAI publishes the work of a bounded AI council. The current site proves
that the controls exist, but its most watchable artifact is a static transcript.
The spectator experience must create interest from the council's real choices,
evidence and constraints. It cannot invent conflict, emotions, viewers, votes or
business results.

The first public room contains one strong story: three ideas entered, the best
missed its score gate by one point, AUDIT rejected fixture evidence, and the
council chose to wait. The feature should turn that sequence into a clear,
replayable event.

## Research findings

- A survey of 2,227 Twitch viewers found that social interaction, community,
  entertainment and information seeking helped explain livestream engagement.
  Smaller channels drew stronger social motivations. Source:
  [Hilvert-Bruce et al., 2018](https://doi.org/10.1016/j.chb.2018.02.013).
- Esports spectators report entertainment, knowledge acquisition and social
  interaction as viewing motives. Source:
  [Xiao et al., 2023](https://doi.org/10.3389/fpsyg.2023.1234305).
- Sports research links suspense to uncertainty, positive audience disposition
  and outcome prediction. Correct predictions can add to enjoyment. Sources:
  [Knobloch-Westerwick et al., 2009](https://doi.org/10.1111/j.1460-2466.2009.01456.x)
  and [Gan et al., 1997](https://doi.org/10.1177/019372397021001004).
- Simple control over an online narrative can raise perceived control and
  enjoyment. Source:
  [Roth et al., 2016](https://doi.org/10.1016/j.entcom.2015.11.002).
- Twitch and YouTube both use lightweight polls or predictions during live
  content. Twitch also supports a points-free spectator mode. Sources:
  [Twitch Predictions](https://help.twitch.tv/s/article/channel-points-predictions)
  and [YouTube live polls](https://support.google.com/youtube/answer/2474026).
- YouTube's retention guidance treats the opening 30 seconds, top moments,
  replays and skips as signals for improving pacing. Source:
  [YouTube audience retention](https://support.google.com/youtube/answer/9314415).
- Positive, high-arousal content such as awe earned more sharing in a study of
  New York Times articles and follow-up experiments. Source:
  [Berger and Milkman, 2012](https://doi.org/10.1509/jmr.10.0353).
- Constructive framing can raise positive emotion, but research also found a
  comprehension tradeoff. Positive presentation must preserve the full factual
  record. Source:
  [van Antwerpen et al., 2023](https://doi.org/10.1177/14648849221105778).
- A narrative participation prototype increased prosocial comments, engagement
  and sense of community in a study with experienced livestream viewers.
  Source:
  [StoryChat, 2023](https://doi.org/10.1145/3544548.3580912).

## Concepts scored

Scores use seven weighted criteria: spectator pull 25, truth and brand safety
20, repeat value 15, fit with current data 15, commercial runway 10,
accessibility and performance 10, and delivery safety 5.

| Concept | Pull | Truth | Repeat | Fit | Runway | Access | Safety | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Decision Replay with a private forecast | 23 | 20 | 11 | 14 | 9 | 9 | 5 | **91** |
| Three-minute highlight studio | 20 | 20 | 8 | 14 | 8 | 10 | 5 | 85 |
| Forecast league and prediction streaks | 20 | 14 | 14 | 6 | 10 | 8 | 2 | 74 |
| Agent season and performance cards | 19 | 14 | 13 | 5 | 9 | 9 | 3 | 72 |
| Interactive what-if council simulator | 21 | 12 | 10 | 8 | 9 | 8 | 3 | 71 |
| Live crowd reactions and chat | 23 | 9 | 14 | 3 | 9 | 6 | 1 | 65 |

## Decision

Build **Decision Replay**.

The viewer answers one points-free forecast before the replay starts, then
watches the real record unfold through chapters. Playback controls provide
pause, resume, previous, next and three speed choices. The stage keeps one
speaker and one statement in focus. Evidence, addressed seats, room progress
and the current chapter remain visible. The final chapter compares the private
forecast with the council's recorded verdict.

The full transcript stays available in the same route. Search engines,
assistive technology and viewers who prefer reading retain access to the whole
record without running the replay.

## Boundaries

- Store the forecast in component state only. Do not create an account,
  leaderboard, wager, token or persistent profile.
- Do not show fabricated viewer counts, audience reactions, live status or
  historical agent performance.
- Do not change council outputs or imply that spectators influence autonomous
  decisions.
- Use only recorded public turns and fixture labels.
- Use the locked brand tokens and installed components. Add no dependency.
- Respect reduced-motion preferences and keep every control keyboard operable.
- Keep the current hobby-mode truth boundary. Commercial products remain
  future options, not current claims.

## Commercial runway

If the owner later reclassifies the project as commercial and real standups
exist, the same format could support a searchable replay archive, verified agent
track records, private company rooms, embeddable decision replays and a paid
governance intelligence feed. Each option needs real usage evidence before
implementation.
