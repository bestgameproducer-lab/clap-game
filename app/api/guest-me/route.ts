import { NextResponse } from 'next/server'; import { cookies } from 'next/headers'; import { verify } from '@/lib/session'; import { getSupabaseAdmin } from '@/lib/supabase';
export async function GET(){const guestId=verify((await cookies()).get('guest_session')?.value); if(!guestId)return NextResponse.json({error:'未登录'},{status:401}); const db=getSupabaseAdmin();
 const [{data:guest},{data:assignments},{data:clues},{data:game},{data:candidates},{data:vote}]=await Promise.all([
 db.from('guests').select('id,name,team,points').eq('id',guestId).single(),
 db.from('assignments').select('id,status,task:tasks(title,description,points)').eq('guest_id',guestId).order('created_at'),
 db.from('guest_clues').select('id,clue:clues(content)').eq('guest_id',guestId),
 db.from('game_state').select('voting_open,results_visible').eq('id',1).single(),
 db.from('guests').select('id,name,team').order('name'),
 db.from('votes').select('target_guest_id').eq('voter_guest_id',guestId).maybeSingle()
 ]);
 return NextResponse.json({guest,assignments:assignments||[],clues:(clues||[]).map((x:any)=>({id:x.id,content:x.clue?.content})),game,candidates:candidates||[],existingVote:vote?.target_guest_id||null});}
