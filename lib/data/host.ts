import 'server-only';
import { ApiError } from '../errors';
import { getSupabaseAdmin } from '../supabase';

export type HostSegmentInput = {
  id: string | null;
  title: string;
  stage: string;
  publicPrompt: string;
  hostNotes: string;
  correctAnswer: string;
  publicClue: string;
  timerMinutes: number;
  sortOrder: number;
  ready: boolean;
};

function ensureHostDatabaseError(error: { message: string } | null, fallback: string) {
  if (!error) return;
  if (error.message.includes('host_segment_not_found')) throw new ApiError(404, '找不到这个主持环节');
  if (error.message.includes('host_segment_not_ready')) throw new ApiError(409, '请先补齐正确答案并勾选允许发布');
  if (error.message.includes('host_answer_required')) throw new ApiError(400, '允许发布前必须填写主持人正确答案');
  if (error.message.includes('team_not_found')) throw new ApiError(404, '找不到这个队伍');
  if (error.message.includes('insufficient_team_resources')) throw new ApiError(409, '丘比特金币余额不足，不能完成这次扣减');
  if (error.message.includes('team_resources_limit')) throw new ApiError(409, '丘比特金币余额超过系统上限');
  if (error.message.includes('invalid_resource_amount')) throw new ApiError(400, '金币变化必须是 -100 到 100 之间的非零整数');
  if (error.message.includes('resource_reason_required')) throw new ApiError(400, '请填写金币变化原因');
  if (error.message.includes('resource_event_conflict')) throw new ApiError(409, '这次金币操作与已保存记录冲突，请刷新后重试');
  throw new Error(`${fallback}: ${error.message}`);
}

export async function getHostDashboardData() {
  const db = getSupabaseAdmin();
  const [segments, game, teamPoints, resources, resourceLedger, guests, votes] = await Promise.all([
    db.from('host_segments').select('id,title,stage,public_prompt,host_notes,correct_answer,public_clue,timer_minutes,sort_order,ready,active,updated_at').eq('active', true).order('sort_order').order('created_at'),
    db.from('game_state').select('stage,registration_open,voting_open,voting_round,results_visible,scoreboard_visible,current_host_segment_id,display_title,display_body,public_clue,timer_ends_at,updated_at').eq('id', 1).single(),
    db.from('team_points_ledger').select('id,team,amount,reason,created_at').order('created_at', { ascending: false }).limit(100),
    db.from('team_resources').select('team,balance,updated_at').order('team'),
    db.from('team_resource_ledger').select('id,team,amount,balance_after,reason,actor,created_at').order('created_at', { ascending: false }).limit(100),
    db.from('guests').select('id,name,team').eq('active', true).not('drawn_at', 'is', null),
    db.from('votes').select('target_guest_id,voting_round'),
  ]);
  const error = segments.error ?? game.error ?? teamPoints.error ?? resources.error ?? resourceLedger.error ?? guests.error ?? votes.error;
  if (error) throw new Error(`Unable to load host data: ${error.message}`);
  const currentRound = game.data?.voting_round ?? 0;
  const currentVotes = (votes.data ?? []).filter((vote) => vote.voting_round === currentRound);
  const guestById = new Map((guests.data ?? []).map((guest) => [guest.id, guest]));
  const voteCountByGuest = currentVotes.reduce<Map<string, number>>((counts, vote) => {
    counts.set(vote.target_guest_id, (counts.get(vote.target_guest_id) ?? 0) + 1);
    return counts;
  }, new Map());
  const voteCounts = [...voteCountByGuest.entries()]
    .map(([guestId, count]) => ({ guest: guestById.get(guestId) ?? null, count }))
    .filter((item): item is { guest: { id: string; name: string; team: string }; count: number } => Boolean(item.guest))
    .sort((left, right) => right.count - left.count || left.guest.name.localeCompare(right.guest.name, 'zh-CN'));
  return {
    segments: segments.data ?? [], game: game.data, teamPoints: teamPoints.data ?? [],
    resources: resources.data ?? [], resourceLedger: resourceLedger.data ?? [],
    drawnGuestCount: guests.data?.length ?? 0, voteCount: currentVotes.length, voteCounts,
  };
}

export async function saveHostSegment(input: HostSegmentInput, actor: string) {
  const { data, error } = await getSupabaseAdmin().rpc('save_host_segment', {
    p_segment_id: input.id,
    p_title: input.title,
    p_stage: input.stage,
    p_public_prompt: input.publicPrompt,
    p_host_notes: input.hostNotes,
    p_correct_answer: input.correctAnswer,
    p_public_clue: input.publicClue,
    p_timer_minutes: input.timerMinutes,
    p_sort_order: input.sortOrder,
    p_ready: input.ready,
    p_actor: actor,
  });
  ensureHostDatabaseError(error, 'Unable to save host segment');
  return data as string;
}

export async function publishHostSegment(segmentId: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('publish_host_segment', { p_segment_id: segmentId, p_actor: actor });
  ensureHostDatabaseError(error, 'Unable to publish host segment');
}

export async function adjustTeamResources(input: { team: string; amount: number; reason: string; eventKey: string }, actor: string) {
  const { data, error } = await getSupabaseAdmin().rpc('adjust_team_resources', {
    p_team: input.team,
    p_amount: input.amount,
    p_reason: input.reason,
    p_event_key: input.eventKey,
    p_actor: actor,
  });
  ensureHostDatabaseError(error, 'Unable to adjust team resources');
  return data as number;
}
