import 'server-only';
import { getSupabaseAdmin } from '../supabase';

export async function getStationData() {
  const db = getSupabaseAdmin();
  const [guests, assignments, tasks, clues, game] = await Promise.all([
    db.from('guests').select('id,name,login_name,team,points,claimed_at,drawn_at').eq('active', true).order('name'),
    db.from('assignments').select('id,guest_id,status,is_initial,completion_rank,submitted_at,approved_at,rejected_at,rejection_reason,task:tasks(id,title,description,points,category,stage)').order('created_at', { ascending: false }),
    db.from('tasks').select('id,title,description,points,category,stage').eq('active', true).order('category').order('title'),
    db.from('clues').select('id,title,content').eq('active', true).order('created_at'),
    db.from('game_state').select('stage').eq('id', 1).single(),
  ]);
  const error = guests.error ?? assignments.error ?? tasks.error ?? clues.error ?? game.error;
  if (error) throw new Error(`Unable to load station data: ${error.message}`);
  return { guests: guests.data ?? [], assignments: assignments.data ?? [], tasks: tasks.data ?? [], clues: clues.data ?? [], game: game.data };
}
