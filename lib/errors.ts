import { NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function apiErrorResponse(error: unknown) {
  let response: NextResponse;
  if (error instanceof ApiError) {
    response = NextResponse.json({ error: error.message }, { status: error.status });
  } else {
    console.error(error);
    response = NextResponse.json({ error: '服务器暂时无法处理请求' }, { status: 500 });
  }
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
