/**
 * The database awards two clues only to a positive-score joint first place.
 * Every other competitive team receives one clue, including a 0:0 finish.
 * Keep staff readiness checks on the same rule so the UI cannot block a
 * settlement that the authoritative transaction accepts.
 */
export function requiredTeamClueCount(score: number, topScore: number): 1 | 2 {
  return topScore > 0 && score === topScore ? 2 : 1;
}
