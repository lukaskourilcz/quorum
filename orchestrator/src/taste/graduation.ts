import type { RatingRecord } from "../contracts/rating.js";

export type GraduationStatus =
  | "unrated"
  | "awaiting_board"
  | "visual_queue"
  | "archived";

export interface GraduationDecision {
  status: GraduationStatus;
  reason: string;
  ratingId: string | null;
}

export function resolveGraduation(
  rating: RatingRecord | null,
  boardApproved: boolean
): GraduationDecision {
  if (!rating) {
    return { status: "unrated", reason: "Owner rating required.", ratingId: null };
  }
  if (rating.rating === "perfect") {
    return {
      status: "visual_queue",
      reason: "Owner rated Perfect.",
      ratingId: rating.id
    };
  }
  if (rating.rating === "good" && boardApproved) {
    return {
      status: "visual_queue",
      reason: "Owner rated Good and the board approved the next-step production.",
      ratingId: rating.id
    };
  }
  if (rating.rating === "good") {
    return {
      status: "awaiting_board",
      reason: "Owner rated Good; a later board approval is still required.",
      ratingId: rating.id
    };
  }
  return {
    status: "archived",
    reason: rating.note || "Owner rated Bad.",
    ratingId: rating.id
  };
}
