# Spectator toolkit decision

Date: 2026-07-30

Owner: Human-invoked engineer

Scope: Functionality inside the existing Decision Replay

Business mode: Hobby / non-commercial

## Constraint

Keep the locked BoardlessAI visual system, page shell, typography, palette and
content hierarchy. This work adds viewer controls to the existing replay. It
does not redesign the site.

## Research

- YouTube chapters divide a recording into named sections so viewers can
  navigate and rewatch specific parts. Its current sharing direction also
  favors links that open at an exact moment. Sources:
  [YouTube chapters](https://support.google.com/youtube/answer/9884579) and
  [YouTube timestamp sharing update](https://support.google.com/youtube/thread/425735532).
- Familiar transport controls help viewers browse digital recordings, but
  linear controls alone can limit how quickly they find a sequence of interest.
  Source:
  [Syeda-Mahmood et al., 2006](https://doi.org/10.1016/j.ijhcs.2005.08.012).
- A 2025 controlled study found that a strategy built around pausing,
  reviewing, note-taking, summarizing and self-testing improved perceived
  self-regulation and knowledge gain with explanatory videos. Source:
  [Richter et al., 2025](https://doi.org/10.1007/s10758-025-09894-y).
- Research on embedded questions reports that in-video questions can support
  attention and efficient question answering. Feedback should explain the
  record rather than award points. Sources:
  [Sung et al., 2023](https://doi.org/10.1080/02601370.2023.2196449) and
  [Huang et al., 2025](https://doi.org/10.3389/fpsyg.2025.1321712).
- The Web Share API can hand a link to an operating system share target when
  supported. It needs feature detection and a clipboard fallback. The History
  API can update a same-origin URL without reloading the page. Sources:
  [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API)
  and
  [History.replaceState](https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState).
- The Fullscreen API can place one replay element into a focused view after a
  viewer action. Support varies, so the control must be optional and report an
  unavailable state without blocking playback. Source:
  [Fullscreen API guide](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API/Guide).
- Prior spectator research for Decision Replay found that information seeking,
  entertainment, prediction and lightweight control can support viewing
  interest. The public record still has to remain complete and truthful. See
  `2026-07-30-spectator-decision-replay.md`.

## Functional concepts scored

Scores use six weighted criteria: spectator pull 25, repeat and share value 20,
truth and brand safety 20, fit with current data 15, accessibility and privacy
10, and delivery safety 10.

| Concept | Pull | Repeat | Truth | Fit | Access | Delivery | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Replay director: cuts, seat lenses and moment links | 24 | 19 | 20 | 15 | 9 | 9 | **96** |
| Private moment notebook: bookmarks and resume | 20 | 20 | 20 | 14 | 10 | 9 | **93** |
| Evidence check with explanatory feedback | 18 | 15 | 20 | 15 | 10 | 9 | **87** |
| Optional fullscreen focus mode | 14 | 13 | 20 | 15 | 8 | 9 | **79** |
| Synthetic read-aloud agent performances | 18 | 13 | 11 | 10 | 7 | 5 | 64 |
| Crowd chat, reactions and public prediction points | 23 | 18 | 7 | 4 | 5 | 2 | 59 |

## Decision

Build the four highest-value compatible functions as one spectator toolkit.
Replay Director is the lead mechanic. The other three support different viewer
jobs without changing the page's visual premise.

### Replay Director

- Offer Full room, Highlights, Evidence trail and Vote cuts.
- Let a viewer follow one participating seat. Keep turns addressed to that seat
  so the exchange retains context.
- Move previous, next, autoplay, progress and chapters through the selected cut
  rather than through hidden turns.
- Encode the selected cut, seat and turn in the URL.
- Share the exact recorded moment through the native share sheet when available
  and copy the same link otherwise.

### Private moment notebook

- Save or remove the current turn with one control.
- Add a Saved moments cut when at least one turn is saved.
- Keep saved turns and unfinished progress in browser storage only.
- Offer a continue action on the opening panel.
- Never send, count or rank saved moments.

### Evidence check

- Ask one low-stakes question after the recorded verdict.
- Explain which evidence gate controlled the decision.
- Store no score, identity or answer history.

### Focus mode

- Place the existing replay card in fullscreen after an explicit viewer action.
- Hide the control when the browser reports no support.
- Preserve keyboard navigation and allow Escape to exit.

## Boundaries

- Do not change global styles, tokens, navigation, typography or the page shell.
- Do not add a dependency.
- Do not fabricate speech, emotion, conflict, popularity, activity or audience
  behavior.
- Do not imply that a saved moment or private answer affects the council.
- Keep the complete static transcript below the player.
- Treat Web Share, clipboard, browser storage and fullscreen as progressive
  enhancements. Playback remains usable if any of them is unavailable.
