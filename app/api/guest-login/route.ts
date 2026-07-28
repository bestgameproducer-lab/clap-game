import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sign } from '@/lib/session';
export async function POST(req:Request){
 try{const {name,code}=await req.json(); const db=getSupabaseAdmin();
 const {data,error}=await db.from('guests').select('id,name').ilike('name',String(name).trim()).eq('login_code',String(code).trim()).single();
 if(error||!data)return NextResponse.json({error:'姓名或登录码不正确'},{status:401});
 const res=NextResponse.json({ok:true}); res.cookies.set('guest_session',sign(data.id),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:60*60*24*30,path:'/'}); return res;
 }catch{return NextResponse.json({error:'登录失败'},{status:500})}
}
