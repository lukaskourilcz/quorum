import { z } from "zod";
import { DateTimeSchema, openObject } from "../contracts/common.js";
import { atomicWriteJson } from "../state.js";

export const MonetizationStatusSchema = z.enum(["locked", "ready", "proposed", "active"]);
export const MonetizationMethodIdSchema = z.enum([
  "caught-up-sponsorship",
  "mma-files-sponsorship-affiliate",
  "titty-tuesdays-commerce",
  "fightaiq-none",
  "carousel-studio-internal",
  "marketingshark-internal"
]);

export const MonetizationProposalSchema = openObject({
  summary: z.string().min(1).max(500),
  channels: z.array(z.string().min(1).max(120)).max(12),
  ownerChecklist: z.array(z.string().min(1).max(240)).min(1).max(20),
  constraints: z.array(z.string().min(1).max(240)).max(12)
});

export const MonetizationMethodStateSchema = openObject({
  status: MonetizationStatusSchema,
  proposalPreparedAt: DateTimeSchema.nullable(),
  ownerApprovalRef: z.string().trim().min(1).max(240).nullable(),
  updatedAt: DateTimeSchema
}).superRefine((state, context) => {
  if (["proposed", "active"].includes(state.status) && !state.proposalPreparedAt) {
    context.addIssue({
      code: "custom",
      message: "Proposed and active methods need a prepared proposal timestamp",
      path: ["proposalPreparedAt"]
    });
  }
  if (state.status === "active" && !state.ownerApprovalRef) {
    context.addIssue({
      code: "custom",
      message: "Active monetization needs an owner approval reference",
      path: ["ownerApprovalRef"]
    });
  }
  if (state.status !== "active" && state.ownerApprovalRef) {
    context.addIssue({
      code: "custom",
      message: "Only active monetization may carry an owner approval reference",
      path: ["ownerApprovalRef"]
    });
  }
});

export const PublicMonetizationMethodSchema = openObject({
  id: MonetizationMethodIdSchema,
  venture: z.enum(["caught-up", "mma-files", "titty-tuesdays", "fightaiq", "carousel-studio", "marketingshark"]),
  method: z.string().min(1).max(160),
  status: MonetizationStatusSchema,
  activationKpi: z.string().min(1).max(300),
  readiness: openObject({
    met: z.boolean(),
    unavailable: z.boolean(),
    detail: z.string().min(1).max(300)
  }),
  proposal: MonetizationProposalSchema.nullable(),
  ownerGateRequired: z.literal(true),
  note: z.string().min(1).max(400)
});

export type MonetizationStatus = z.infer<typeof MonetizationStatusSchema>;
export type MonetizationMethodId = z.infer<typeof MonetizationMethodIdSchema>;
export type MonetizationProposal = z.infer<typeof MonetizationProposalSchema>;
export type MonetizationMethodState = z.infer<typeof MonetizationMethodStateSchema>;
export type PublicMonetizationMethod = z.infer<typeof PublicMonetizationMethodSchema>;

export interface MonetizationMeasurements {
  caughtUpWeeklyPageviews?: readonly (number | null)[];
  caughtUpFollowers?: number | null;
  mmaFilesIndexingEnabled: boolean;
  mmaFilesWeeklyPageviews?: readonly (number | null)[];
  tittyTuesdaysCampaigns?: number | null;
  tittyTuesdaysFollowers?: number | null;
  fightAiQEvaluatedEvents?: number | null;
  fightAiQCalibrationPublished?: boolean | null;
}

interface Readiness {
  met: boolean;
  unavailable: boolean;
  detail: string;
}

interface MethodDefinition {
  id: MonetizationMethodId;
  venture: PublicMonetizationMethod["venture"];
  method: string;
  activationKpi: string;
  note: string;
  proposal: MonetizationProposal | null;
  readiness: (measurements: MonetizationMeasurements) => Readiness;
}

function validCount(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function lastFourMeet(values: readonly (number | null)[] | undefined, threshold: number): boolean {
  if (!values || values.length < 4) return false;
  const last = values.slice(-4);
  return last.every((value) => validCount(value) && value >= threshold);
}

function fourWeeksAvailable(values: readonly (number | null)[] | undefined): boolean {
  return Boolean(values && values.length >= 4 && values.slice(-4).every(validCount));
}

export const MONETIZATION_METHODS: readonly MethodDefinition[] = [
  {
    id: "caught-up-sponsorship",
    venture: "caught-up",
    method: "Sponsorship",
    activationKpi: "Four consecutive weeks at 500 pageviews per week, or 1,000 combined followers.",
    note: "First-party sponsorship only. Programmatic advertising remains outside the approved scope.",
    proposal: {
      summary: "A first-party sponsor kit with fixed placements and clear editorial separation.",
      channels: ["Caught Up sponsor block", "Owner-approved sponsor kit"],
      ownerChecklist: [
        "Approve the sponsor kit and price list.",
        "Approve placement rules and sponsor acceptance criteria.",
        "Complete the legal, account, invoicing, and payment setup."
      ],
      constraints: ["No programmatic ads.", "No sponsor influence over editorial selection."]
    },
    readiness: (measurements) => {
      const followerReady = validCount(measurements.caughtUpFollowers) && measurements.caughtUpFollowers >= 1_000;
      const pageviewReady = lastFourMeet(measurements.caughtUpWeeklyPageviews, 500);
      if (followerReady || pageviewReady) {
        return { met: true, unavailable: false, detail: followerReady ? "Follower threshold met." : "Four-week pageview threshold met." };
      }
      const complete = validCount(measurements.caughtUpFollowers) && fourWeeksAvailable(measurements.caughtUpWeeklyPageviews);
      return {
        met: false,
        unavailable: !complete,
        detail: complete ? "Activation KPI has not been met." : "Phase 3 pageviews or follower measurements are unavailable."
      };
    }
  },
  {
    id: "mma-files-sponsorship-affiliate",
    venture: "mma-files",
    method: "Sponsorship or non-bookmaker affiliate",
    activationKpi: "Owner-enabled indexing and four consecutive weeks at 750 pageviews per week.",
    note: "Bookmaker affiliate programs need a separate owner and legal decision.",
    proposal: {
      summary: "A sponsorship and non-bookmaker affiliate plan for the indexed magazine.",
      channels: ["MMA Files sponsor placements", "Owner-approved non-bookmaker affiliate placements"],
      ownerChecklist: [
        "Confirm that indexing is enabled by the owner.",
        "Approve sponsor and affiliate acceptance rules.",
        "Complete the legal, account, invoicing, and payment setup."
      ],
      constraints: ["No bookmaker affiliate program without a separate owner and legal decision."]
    },
    readiness: (measurements) => {
      const viewsAvailable = fourWeeksAvailable(measurements.mmaFilesWeeklyPageviews);
      const met = measurements.mmaFilesIndexingEnabled && lastFourMeet(measurements.mmaFilesWeeklyPageviews, 750);
      return {
        met,
        unavailable: measurements.mmaFilesIndexingEnabled && !viewsAvailable,
        detail: met
          ? "Indexing and the four-week pageview threshold are confirmed."
          : !measurements.mmaFilesIndexingEnabled
            ? "Indexing remains owner-locked."
            : viewsAvailable
              ? "The pageview threshold has not been met."
              : "Phase 3 pageview measurements are unavailable."
      };
    }
  },
  {
    id: "titty-tuesdays-commerce",
    venture: "titty-tuesdays",
    method: "Season 1 commerce",
    activationKpi: "Eight launch-ready campaigns and 500 combined followers.",
    note: "Launch also requires the owner-built shop and explicit commerce approval.",
    proposal: {
      summary: "A season 1 launch plan based on the completed commerce-readiness dossier.",
      channels: ["Owner-built shop", "Owner-approved organic launch channels"],
      ownerChecklist: [
        "Approve the season 1 product and supplier plan.",
        "Build and approve the shop, legal terms, accounts, payments, and fulfilment.",
        "Approve the final launch date and channel plan."
      ],
      constraints: ["BoardlessAI cannot open the shop, accept payments, or sign supplier terms."]
    },
    readiness: (measurements) => {
      const campaigns = measurements.tittyTuesdaysCampaigns;
      const followers = measurements.tittyTuesdaysFollowers;
      const available = validCount(campaigns) && validCount(followers);
      const met = available && campaigns >= 8 && followers >= 500;
      return {
        met,
        unavailable: !available,
        detail: met ? "Campaign and follower thresholds are met." : available ? "Activation KPI has not been met." : "Campaign or follower measurements are unavailable."
      };
    }
  },
  {
    id: "fightaiq-none",
    venture: "fightaiq",
    method: "No monetization in Q1 or Q2",
    activationKpi: "Earliest review after 30 evaluated events with published calibration, plus separate owner and legal approval.",
    note: "FightAIQ does not sell or promote an unvalidated model.",
    proposal: null,
    readiness: (measurements) => {
      const evidenceReady = validCount(measurements.fightAiQEvaluatedEvents)
        && measurements.fightAiQEvaluatedEvents >= 30
        && measurements.fightAiQCalibrationPublished === true;
      return {
        met: false,
        unavailable: false,
        detail: evidenceReady
          ? "Evidence threshold met; monetization still needs a later owner and legal review."
          : "Q1 and Q2 monetization is locked while the model builds an evaluation record."
      };
    }
  },
  {
    id: "carousel-studio-internal",
    venture: "carousel-studio",
    method: "Not monetized — internal engine",
    activationKpi: "Locked. A standalone product needs a separate owner decision and extraction plan.",
    note: "The package stays self-contained so a future standalone product remains possible, but no extraction, sale or service is authorized.",
    proposal: null,
    readiness: () => ({ met: false, unavailable: false, detail: "Internal portfolio infrastructure; future product extraction is locked." })
  },
  {
    id: "marketingshark-internal",
    venture: "marketingshark",
    method: "Not monetized — internal agency",
    activationKpi: "Locked. marketingShark earns nothing directly; its value appears in the products it markets.",
    note: "An internal service for the Shark family. devShark's own revenue, if any, sits outside BoardlessAI's accounts until the owner decides otherwise, and no marketingShark output may be sold, sponsored or placed for payment.",
    proposal: null,
    readiness: () => ({ met: false, unavailable: false, detail: "Internal service; recognized revenue is $0 and activation is owner-only." })
  }
];

export function advanceMonetizationStatus(input: {
  current: MonetizationStatus;
  activationReady: boolean;
  proposalPrepared: boolean;
  ownerApproval?: { approvedBy: "owner"; decisionRef: string };
}): MonetizationStatus {
  if (input.current === "active") return "active";
  if (input.ownerApproval) {
    if (input.current !== "proposed" || !input.proposalPrepared || !input.ownerApproval.decisionRef.trim()) {
      throw new Error("Owner activation requires a proposed method and a decision reference");
    }
    return "active";
  }
  if (input.current === "proposed") return "proposed";
  if (input.current === "ready") return input.proposalPrepared ? "proposed" : "ready";
  if (input.activationReady && input.proposalPrepared) return "proposed";
  if (input.activationReady) return "ready";
  return "locked";
}

export function evaluateMonetizationMethods(input: {
  measurements: MonetizationMeasurements;
  states?: Partial<Record<MonetizationMethodId, MonetizationMethodState>>;
}): PublicMonetizationMethod[] {
  return MONETIZATION_METHODS.map((definition) => {
    const readiness = definition.readiness(input.measurements);
    const saved = input.states?.[definition.id];
    const state = saved ? MonetizationMethodStateSchema.parse(saved) : null;
    const proposalPrepared = Boolean(state?.proposalPreparedAt);
    const status = advanceMonetizationStatus({
      current: state?.status ?? "locked",
      activationReady: readiness.met,
      proposalPrepared
    });
    return PublicMonetizationMethodSchema.parse({
      id: definition.id,
      venture: definition.venture,
      method: definition.method,
      status,
      activationKpi: definition.activationKpi,
      readiness,
      proposal: readiness.met || ["ready", "proposed", "active"].includes(status)
        ? definition.proposal
        : null,
      ownerGateRequired: true,
      note: definition.note
    });
  });
}

export async function writeMonetizationReadiness(input: {
  root: string;
  methods: readonly PublicMonetizationMethod[];
  generatedAt: Date;
}): Promise<{ statePath: string; proposalPaths: string[] }> {
  const methods = input.methods.map((method) => PublicMonetizationMethodSchema.parse(method));
  const statePath = "money/monetization.json";
  const proposalPaths: string[] = [];
  await atomicWriteJson(input.root, statePath, {
    schemaVersion: "monetization-readiness/1",
    generatedAt: input.generatedAt.toISOString(),
    methods
  });
  for (const method of methods) {
    if (!method.readiness.met || !method.proposal) continue;
    const path = `money/proposals/${method.id}.json`;
    proposalPaths.push(path);
    await atomicWriteJson(input.root, path, {
      schemaVersion: "monetization-proposal/1",
      methodId: method.id,
      venture: method.venture,
      activationKpi: method.activationKpi,
      status: method.status,
      proposal: method.proposal,
      ownerActivationRequired: true,
      generatedAt: input.generatedAt.toISOString()
    });
  }
  return { statePath, proposalPaths };
}
