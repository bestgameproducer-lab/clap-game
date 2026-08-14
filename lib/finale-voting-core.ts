export const COMPETITIVE_FINALE_TEAMS = ['海岛组', '沙漠组'] as const;

export type FinaleVotingParticipant = {
  active: boolean;
  uses_app: boolean;
  participation_mode: string;
  phase_two_eligible: boolean;
  drawn_at: string | null;
  team: string | null;
};

export function isFinaleVotingParticipant(
  guest: FinaleVotingParticipant | null | undefined,
): guest is FinaleVotingParticipant {
  return Boolean(
    guest?.active
    && guest.uses_app
    && guest.participation_mode === 'ACTIVE_PLAYER'
    && guest.phase_two_eligible
    && guest.drawn_at
    && COMPETITIVE_FINALE_TEAMS.includes(guest.team as typeof COMPETITIVE_FINALE_TEAMS[number]),
  );
}
