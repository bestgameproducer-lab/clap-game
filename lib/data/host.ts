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
  throw new Error(`${fallback}: ${error.message}`);
}

export async function getHostDashboardData() {
  const db = getSupabaseAdmin();
  const [segments, game, teamPoints] = await Promise.all([
    db.from('host_segments').select('id,title,stage,public_prompt,host_notes,correct_answer,public_clue,timer_minutes,sort_order,ready,active,updated_at').eq('active', true).order('sort_order').order('created_at'),
    db.from('game_state').select('stage,scoreboard_visible,current_host_segment_id,display_title,display_body,public_clue,timer_ends_at,updated_at').eq('id', 1).single(),
    db.from('team_points_ledger').select('id,team,amount,reason,created_at').order('created_at', { ascending: false }).limit(100),
  ]);
  const error = segments.error ?? game.error ?? teamPoints.error;
  if (error) throw new Error(`Unable to load host data: ${error.message}`);
  return { segments: segments.data ?? [], game: game.data, teamPoints: teamPoints.data ?? [] };
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
