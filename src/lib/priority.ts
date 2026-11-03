import type { Lead } from "./types";
import { phoneKind } from "./utils";

export type PriorityLevel = "alta" | "media" | "bassa";

/**
 * Quanto conviene chiamare prima un lead. Di solito rispondono meglio:
 * chi non ha un sito, chi ha un cellulare (si può mandare WhatsApp), chi ha poche recensioni o un voto basso.
 */
export function leadPriority(lead: Pick<Lead, "website" | "phone" | "reviews_count" | "rating">): {
  score: number;
  level: PriorityLevel;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];
  if (!lead.website) {
    score += 3;
    reasons.push("senza sito");
  }
  if (phoneKind(lead.phone) === "cellulare") {
    score += 2;
    reasons.push("cellulare");
  }
  if (lead.reviews_count == null || lead.reviews_count < 20) {
    score += 1;
    reasons.push("poche recensioni");
  }
  if (lead.rating != null && lead.rating < 4) {
    score += 1;
    reasons.push("voto sotto 4");
  }
  const level: PriorityLevel = score >= 5 ? "alta" : score >= 3 ? "media" : "bassa";
  return { score, level, reasons };
}
