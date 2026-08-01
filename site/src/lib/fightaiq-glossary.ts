export interface GlossaryEntry { label: string; explanation: string; unit?: string }

export const fightGlossary: Record<string, GlossaryEntry> = {
  name: { label: "Fighter", explanation: "The fighter's published name." },
  division: { label: "Weight class", explanation: "The weight class for the fighter or bout." },
  dob: { label: "Date of birth", explanation: "The published birth date used to calculate age." },
  heightCm: { label: "Height", explanation: "The fighter's published height.", unit: "cm" },
  reachCm: { label: "Reach", explanation: "Fingertip-to-fingertip arm span.", unit: "cm" },
  stance: { label: "Stance", explanation: "The fighter's usual lead-side position." },
  nationality: { label: "Nationality", explanation: "The nationality listed by the source." },
  camp: { label: "Team or gym", explanation: "The team or gym named by the source." },
  basedIn: { label: "Training base", explanation: "Where the fighter currently trains or is based." },
  record: { label: "Record", explanation: "Wins, losses and draws, with no contests where available." },
  winsKo: { label: "Wins by knockout", explanation: "Wins recorded as knockout or technical knockout." },
  winsSubmission: { label: "Wins by submission", explanation: "Wins recorded after a tap or stoppage from a hold." },
  winsDecision: { label: "Wins by decision", explanation: "Wins awarded by the judges." },
  lossesKo: { label: "Knockout losses", explanation: "Losses by knockout or technical knockout." },
  lossesSubmission: { label: "Submission losses", explanation: "Losses after a tap or stoppage from a hold." },
  lossesDecision: { label: "Decision losses", explanation: "Losses awarded by the judges." },
  finishRate: { label: "Finish rate", explanation: "Share of wins that ended before the judges' decision." },
  beenFinishedRate: { label: "Stopped-loss rate", explanation: "Share of losses that ended before the judges' decision." },
  currentStreak: { label: "Current run", explanation: "The current sequence of wins, losses or draws." },
  lastFive: { label: "Last five", explanation: "The five most recent recorded bout results." },
  meanOpponentRecord: { label: "Average opponent record", explanation: "Average opponent record at the time of each fight." },
  winningOpponentShare: { label: "Opponents above .500", explanation: "Share of opponents who had more wins than losses." },
  daysSinceLastFight: { label: "Days since last fight", explanation: "Days between the last recorded bout and the update date." },
  fightsLast12Months: { label: "Fights in 12 months", explanation: "Recorded bouts in the previous rolling year." },
  careerFights: { label: "Career fights", explanation: "Total recorded professional bouts." },
  slpm: { label: "Strikes landed per minute", explanation: "Significant strikes landed per minute in UFC statistics." },
  sapm: { label: "Strikes absorbed per minute", explanation: "Significant strikes absorbed per minute in UFC statistics." },
  strikingAccuracy: { label: "Striking accuracy", explanation: "Share of attempted significant strikes that landed." },
  strikingDefense: { label: "Striking defense", explanation: "Share of opponents' significant strikes that did not land." },
  takedownsPer15: { label: "Takedowns per 15 minutes", explanation: "Average successful takedowns over 15 minutes." },
  takedownDefense: { label: "Takedown defense", explanation: "Share of opponent takedown attempts stopped." },
  submissionAttemptsPer15: { label: "Submission attempts per 15", explanation: "Average recorded submission attempts over 15 minutes." },
  knockdownsPerFight: { label: "Knockdowns per fight", explanation: "Average knockdowns scored in a recorded bout." },
  controlTimeShare: { label: "Control-time share", explanation: "Share of fight time spent in control." },
  recentKoLosses: { label: "Recent knockout losses", explanation: "Dated knockout losses used as a damage-recency warning." },
  missedWeight: { label: "Missed weight", explanation: "Recorded weigh-ins above the contracted limit." },
  shortNotice: { label: "Short-notice fights", explanation: "Bouts accepted with less preparation time than scheduled." },
  divisionMoves: { label: "Weight-class moves", explanation: "Recorded moves between weight classes." },
  fiveRoundExperience: { label: "Five-round experience", explanation: "Recorded bouts scheduled for five rounds." },
  homeRegion: { label: "Home-region event", explanation: "Whether the event is in the fighter's home region." },
  titleFight: { label: "Title fight", explanation: "Whether the bout is scheduled for a championship." },
  scheduledRounds: { label: "Scheduled rounds", explanation: "Maximum number of rounds booked for the bout." },
  marketHistory: { label: "Past market prices", explanation: "Opening and closing prices captured before earlier bouts." },
  glickoRating: { label: "Fight rating", explanation: "Results-based rating calculated separately inside each organization." },
  glickoDeviation: { label: "Rating uncertainty", explanation: "How uncertain the fight rating is; lower means more established." },
  ageCurve: { label: "Age range", explanation: "The model's small age-related adjustment band." },
  paceDifferential: { label: "Pace difference", explanation: "Difference between the fighters' recorded activity rates." },
  methodDistribution: { label: "How wins happen", explanation: "Smoothed share of knockout, submission and decision outcomes." }
};

export function glossaryEntry(key: string): GlossaryEntry {
  return fightGlossary[key] ?? {
    label: key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()),
    explanation: "A sourced field from the fighter's public file."
  };
}

export function displayFieldValue(key: string, value: import("./fightaiq-records").SourcedValue): string {
  if (value === null) return "Not available";
  const rendered = Array.isArray(value) ? value.join(" · ") : typeof value === "boolean" ? value ? "Yes" : "No" : String(value);
  const unit = glossaryEntry(key).unit;
  return unit && typeof value === "number" ? `${rendered} ${unit}` : rendered;
}
