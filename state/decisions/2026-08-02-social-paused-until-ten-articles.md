# Social distribution paused until each magazine has ten articles

Date: 2026-08-02

Decider: Lukas Kouril, owner

Status: countersigned

Decision id: `social-2026-08a`

Supersedes: the autopublish enablement recorded in `config/channels.json` on 2026-08-01

Signature / explicit approval reference: owner direction in session 2026-08-02

## Owner direction to record

- Turn the social agents off now. Both channels return to `draft`, and
  `enabledByHumanAt` is cleared to `null`.
- Keep them off until each magazine has rendered **ten articles**.
- Only after that threshold do we switch the social agents on and create the Threads
  and Instagram profiles.

## Why

The company had `threads` and `instagram` at `mode: "autopublish"` with
`enabledByHumanAt` set, so distribution was armed on the same day the live switches went
on and before either magazine had published anything. Posting an empty catalogue costs
reputation that a pre-revenue company cannot spend twice, and a profile created before
there is a body of work to point at is harder to fix than one created late.

Nothing is lost by waiting. The pipeline still composes social drafts and queues them;
`draft` only stops the send.

## Effect

`config/channels.json` sets both channels to `mode: "draft"` with
`enabledByHumanAt: null`. `channelRegistry` refuses to publish unless a channel is
`autopublish` **and** carries a human enablement timestamp, so either field alone is
enough to hold the line; both are set deliberately.

`orchestrator/tests/ci-policy.test.ts` pins this state. It also keeps asserting, in every
mode, that no stored scope reaches beyond posting.

The global `SOCIAL_KILL_SWITCH` is unchanged and still beats every per-channel setting.

## Reversing it

When both magazines have ten rendered articles, the owner re-enables by setting each
channel back to `autopublish` with a fresh `enabledByHumanAt`, and records a superseding
decision. Creating the Threads and Instagram profiles is an owner action: account
creation is never an agent action.
