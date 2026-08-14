import 'server-only';
import { getSupabaseAdmin } from '../supabase';
import { signEvidencePaths } from './evidence';
import { isTaskAllowedInCatalogMode } from '../official-task-manifest';
import { settledClueIdsByTeam } from './settled-team-clues';
import { getManualTaskAvailability, type ManualTaskAssignment } from '../manual-task-eligibility';

export async function getStationData() {
  const db = getSupabaseAdmin();
  const [guests, assignments, tasks, clues, settlementAudit, game, eligibilityRoles, eligibilityStoryRoles, manualAssignmentHistory, finalRewards] = await Promise.all([
    db.from('guests').select('id,name,login_name,team,points,claimed_at,drawn_at,active,uses_app,eligible_for_mission,eligible_for_personal_score,phase_two_eligible,participation_mode').eq('active', true).order('name'),
    db.from('assignments').select('id,guest_id,status,is_initial,completion_rank,early_bonus_points,completion_note,verification_note,verified_at,evidence_path,evidence_uploaded_at,submitted_at,approved_at,rejected_at,rejection_reason,task:tasks!assignments_task_id_fkey(id,title,description,verification_method,verification_type,points,category,stage,mission_code)').neq('status', 'cancelled').order('created_at', { ascending: false }),
    db.from('tasks').select('id,title,description,verification_method,verification_type,points,role_scope,story_role_scope,category,stage,mission_code,active,is_demo,formal_allowed,max_assignments').is('mission_code', null).neq('category', 'hidden').order('category').order('title'),
    db.from('clues').select('id,title,content,group_name,team_scope').eq('active', true).order('group_name').order('created_at'),
    db.from('audit_log').select('action,details,created_at')
      .in('action', ['rehearsal.reset', 'phase_two.team_clues_settle'])
      .order('created_at', { ascending: false }).limit(20),
    db.from('game_state').select('stage,team_clues_settled_at,results_visible,results_published_at,rehearsal_run_id,task_catalog_mode').eq('id', 1).single(),
    db.from('guests').select('id,role').eq('active', true),
    db.from('guests').select('id,story_role').eq('active', true),
    db.from('assignments').select('id,guest_id,task_id,status'),
    db.from('result_rewards').select('id').limit(1),
  ]);
  const error = guests.error ?? assignments.error ?? tasks.error ?? clues.error ?? settlementAudit.error ?? game.error
    ?? eligibilityRoles.error ?? eligibilityStoryRoles.error ?? manualAssignmentHistory.error ?? finalRewards.error;
  if (error) throw new Error(`Unable to load station data: ${error.message}`);
  const roleByGuest = new Map((eligibilityRoles.data ?? []).map((guest) => [guest.id, guest.role]));
  const storyRoleByGuest = new Map((eligibilityStoryRoles.data ?? []).map((guest) => [guest.id, guest.story_role]));
  // Hidden assignments are server-authoritative trickster records.  Keep them
  // out of every station calculation and response before evidence URLs are
  // signed, even if a future task title or workflow would otherwise look
  // reviewable to staff.
  const visibleAssignments = (assignments.data ?? []).filter((assignment) => {
    const task = Array.isArray(assignment.task) ? assignment.task[0] : assignment.task;
    return task?.category !== 'hidden'
      && isTaskAllowedInCatalogMode(assignment.task, game.data?.task_catalog_mode);
  });
  const settledIdsByTeam = settledClueIdsByTeam(settlementAudit.data ?? []);
  const settledTeamClueKeys = new Set(Object.entries(settledIdsByTeam)
    .flatMap(([team, clueIds]) => clueIds.map((clueId) => `${team}:${clueId}`)));
  const manualAssignments = (manualAssignmentHistory.data ?? []) as ManualTaskAssignment[];
  const manualTaskAvailabilityByGuest: Record<string, { taskIds: string[]; reason: string }> = Object.fromEntries((guests.data ?? []).map((guest) => {
    const availability = getManualTaskAvailability({
      guest: {
        ...guest,
        role: roleByGuest.get(guest.id) ?? '',
        story_role: storyRoleByGuest.get(guest.id) ?? 'NONE',
      },
      tasks: tasks.data ?? [],
      taskCatalogMode: game.data?.task_catalog_mode,
      gameStage: game.data?.stage,
      assignments: manualAssignments,
    });
    return [guest.id, { taskIds: availability.tasks.map((task) => task.id), reason: availability.reason }];
  }));
  const manualTaskIdsByGuest = Object.fromEntries(Object.entries(manualTaskAvailabilityByGuest)
    .map(([guestId, availability]) => [guestId, availability.taskIds]));
  return {
    guests: (guests.data ?? []).map((guest) => ({
      id: guest.id, name: guest.name, login_name: guest.login_name, team: guest.team,
      points: guest.points, claimed_at: guest.claimed_at, drawn_at: guest.drawn_at,
      eligible_for_personal_score: guest.eligible_for_personal_score,
      phase_two_eligible: guest.phase_two_eligible, participation_mode: guest.participation_mode,
    })),
    assignments: await signEvidencePaths(visibleAssignments),
    tasks: (game.data?.task_catalog_mode === 'demo' ? (tasks.data ?? []) : []).map((task) => ({
      id: task.id, title: task.title, description: task.description,
      verification_method: task.verification_method, verification_type: task.verification_type,
      points: task.points,
      category: task.category, stage: task.stage, mission_code: task.mission_code, is_demo: task.is_demo,
    })),
    manualTaskIdsByGuest,
    manualTaskReasonsByGuest: Object.fromEntries(Object.entries(manualTaskAvailabilityByGuest)
      .map(([guestId, availability]) => [guestId, availability.reason])),
    // The station is a recovery surface, not a second clue allocator. Offer
    // only clues that this settlement has already issued to the same team.
    clues: game.data?.team_clues_settled_at
      ? (clues.data ?? []).filter((clue) => Boolean(clue.team_scope)
        && settledTeamClueKeys.has(`${clue.team_scope}:${clue.id}`))
      : [],
    game: game.data,
    finalLocked: Boolean(game.data?.results_published_at || finalRewards.data?.length),
  };
}
