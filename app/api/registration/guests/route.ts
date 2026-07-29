import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: '宾客名单不公开，请使用拼音用户名登录' }, { status: 410 });
}
