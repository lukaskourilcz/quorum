import { describe, expect, it } from "vitest";
import { projectEventBouts, projectEventResults } from "../src/fightaiq/wikipedia-events.js";

/** Templates copied off the live UFC 300 article, because that is the shape this has to read. */
const FINISHED = `{{MMAevent bout
|Light Heavyweight
|[[Alex Pereira]] (c)
|def.
|[[Jamahal Hill]]
|KO (punches)
|1
|3:14
|For the [[UFC Light Heavyweight Championship]].
}}
{{MMAevent bout
|Women's Strawweight
|[[Zhang Weili]] (c)
|def.
|[[Yan Xiaonan]]
|Decision (unanimous) (49–45, 49–45, 49–45)
|5
|5:00
|For the [[UFC Women's Strawweight Championship]].
}}`;

const ANNOUNCED = `{{MMAevent bout
|Welterweight
|[[Islam Makhachev]] (c)
|vs.
|[[Ian Machado Garry]]
|
|
|
|
}}`;

describe("reading a finished card", () => {
  it("takes the winner from the separator, not from the order", () => {
    // "def." is the statement that the left name won. An announced bout has "vs." in the same
    // position and no result at all, so the separator is what separates the two cases.
    const [first, second] = projectEventResults(FINISHED);
    expect(first).toEqual({
      division: "Light Heavyweight",
      red: "Alex Pereira",
      blue: "Jamahal Hill",
      winner: "red",
      method: "KO (punches)",
      round: 1,
      elapsedSeconds: 194
    });
    // Five full rounds is 1500 seconds; the scorecards are dropped from the method.
    expect(second).toMatchObject({ method: "Decision (unanimous)", round: 5, elapsedSeconds: 1_500 });
  });

  it("returns nothing for a card that has not happened", () => {
    expect(projectEventResults(ANNOUNCED)).toEqual([]);
    // The same template still reads as an announced bout, which is the other half of the pair.
    expect(projectEventBouts(ANNOUNCED)).toHaveLength(1);
  });

  it("does not count the pipe inside a piped link as a field separator", () => {
    // "[[Daniel Rodriguez (fighter)|Daniel Rodriguez]]" shifted every field after it: the method
    // landed where the loser's name belongs, and the round came out null.
    const piped = `{{MMAevent bout
|Welterweight
|[[Uroš Medić]]
|def.
|[[Daniel Rodriguez (fighter)|Daniel Rodriguez]]
|TKO (punches)
|1
|1:22
|
}}`;
    expect(projectEventResults(piped)[0]).toMatchObject({
      red: "Uroš Medić",
      blue: "Daniel Rodriguez",
      method: "TKO (punches)",
      round: 1,
      elapsedSeconds: 82
    });
  });

  it("reads a draw and a no contest rather than calling them wins", () => {
    const drawn = FINISHED.replace("|def.", "|draw");
    expect(projectEventResults(drawn)[0]?.winner).toBe("draw");
    expect(projectEventResults(FINISHED.replace("|def.", "|NC"))[0]?.winner).toBe("no-contest");
  });
});
