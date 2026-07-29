import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: '请使用婚礼邀请码完成身份认领' }, { status: 410 });
}
