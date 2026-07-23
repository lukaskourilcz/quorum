FOUNDING MEETING. There is no validated thesis. Input contains ≥3 opportunity
cards with score dimensions and evidence refs. Never propose an unlisted idea
without building a complete new card.

Round A schema override:

```json
{
  "agent": "ID",
  "opportunityId": "OPP-...",
  "segmentAndJob": "≤25 words",
  "valueProp": "≤25 words",
  "differentiation": "≤25 words",
  "reachableChannel": "≤20 words",
  "offerAndPriceHypothesis": "≤25 words",
  "firstExperiment": {
    "hypothesis": "hypothesis",
    "metric": "metric",
    "target": "target",
    "reviewCycle": 1,
    "stopCondition": "condition"
  },
  "siteName": "1–2 words",
  "brandAdjectives": ["one", "two", "three"],
  "why": "≤40 words",
  "confidence": 0,
  "evidenceRefs": ["E-1", "E-2", "E-3"]
}
```

Only choose a card passing the opportunity gate. If none passes, return:

```json
{
  "agent": "ID",
  "decision": "INSUFFICIENT_EVIDENCE",
  "missingEvidence": ["up to 3"],
  "nextTest": "≤30 words"
}
```

The corporate name and design baseline are defined in the master specification.
`siteName` is a venture name, not permission to rename the company. Brand must
tolerate an adjacent pivot without a corporate rename. The name remains
pending clearance only. Domain plausibility is not availability;
purchase/availability confirmation is HUMAN_APPROVAL.
