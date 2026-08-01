import { describe, expect, it } from "vitest";
import { fightGlossary, glossaryEntry } from "./fightaiq-glossary";

describe("FightAIQ field glossary", () => {
  it("explains every stored fighter field in plain language", () => {
    const expected = [
      "name", "division", "dob", "heightCm", "reachCm", "stance", "nationality", "camp", "basedIn",
      "record", "winsKo", "winsSubmission", "winsDecision", "lossesKo", "lossesSubmission", "lossesDecision",
      "finishRate", "beenFinishedRate", "currentStreak", "lastFive", "meanOpponentRecord", "winningOpponentShare",
      "daysSinceLastFight", "fightsLast12Months", "careerFights", "slpm", "sapm", "strikingAccuracy",
      "strikingDefense", "takedownsPer15", "takedownDefense", "submissionAttemptsPer15", "knockdownsPerFight",
      "controlTimeShare", "recentKoLosses", "missedWeight", "shortNotice", "divisionMoves", "fiveRoundExperience",
      "homeRegion", "titleFight", "scheduledRounds", "marketHistory", "glickoRating", "glickoDeviation",
      "ageCurve", "paceDifferential", "methodDistribution"
    ];
    expect(Object.keys(fightGlossary).sort()).toEqual(expected.sort());
    for (const key of expected) {
      expect(glossaryEntry(key).label.length).toBeGreaterThan(2);
      expect(glossaryEntry(key).explanation.length).toBeGreaterThan(12);
    }
  });
});
