import 'server-only';
import { ApiError } from '../errors';
import { SignedUrlReuseCache } from '../signed-url-reuse-cache';
import { getSupabaseAdmin } from '../supabase';

export const GUEST_AVATAR_BUCKET = 'guest-avatars';
const AVATAR_URL_TTL_SECONDS = 10 * 60;
const AVATAR_URL_REUSE_MS = 8 * 60 * 1000;
const avatarUrlCache = new SignedUrlReuseCache(AVATAR_URL_REUSE_MS, 128);

function throwAvatarRpcError(error: { message: string }, action: string): never {
  if (error.message.includes('guest_rehearsal_run_mismatch')
      || error.message.includes('guest_session_stale')
      || error.message.includes('guest_rehearsal_run_required')) {
    throw new ApiError(401, '本设备的登录属于上一轮彩排，请重新登录');
  }
  if (error.message.includes('avatar_guest_not_found')) throw new ApiError(404, '找不到可以设置头像的宾客');
  if (error.message.includes('avatar_guest_not_claimed')) throw new ApiError(409, '当前宾客登录已失效，请重新登录后再设置头像');
  if (error.message.includes('final_results_locked')) throw new ApiError(409, '终局结果已发布，宾客头像已锁定');
  if (error.message.includes('invalid_avatar_path')) throw new ApiError(400, '头像路径无效');
  if (error.message.includes('avatar_object_missing')) throw new ApiError(409, '头像尚未上传完成，请重试');
  throw new Error(`${action}: ${error.message}`);
}

export async function createGuestAvatarUpload(guestId: string, rehearsalRunId: string) {
  const db = getSupabaseAdmin();
  const { data: path, error: authorizationError } = await db.rpc('authorize_guest_avatar_upload', {
    p_guest_id: guestId,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (authorizationError) throwAvatarRpcError(authorizationError, 'Unable to authorize guest avatar');
  if (typeof path !== 'string' || !path) throw new Error('Unable to authorize guest avatar: missing path');
  const { data, error } = await db.storage.from(GUEST_AVATAR_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(`Unable to authorize avatar upload: ${error?.message ?? 'missing URL'}`);
  return { path, signedUrl: data.signedUrl };
}

export async function confirmGuestAvatar(guestId: string, path: string, rehearsalRunId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('confirm_guest_avatar', {
    p_guest_id: guestId,
    p_avatar_path: path,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) throwAvatarRpcError(error, 'Unable to confirm guest avatar');
  avatarUrlCache.invalidate(path);
  return { uploadedAt: data as string };
}

export async function signAvatarPaths<T extends { avatar_path?: string | null }>(items: T[]) {
  const paths = [...new Set(items.flatMap((item) => item.avatar_path ? [item.avatar_path] : []))];
  if (paths.length === 0) return items.map((item) => ({ ...item, avatar_url: null }));
  const cachedByPath = avatarUrlCache.read(paths);
  if (cachedByPath.size === paths.length) {
    return items.map((item) => ({
      ...item,
      avatar_url: item.avatar_path ? cachedByPath.get(item.avatar_path) ?? null : null,
    }));
  }
  try {
    const { data, error } = await getSupabaseAdmin().storage
      .from(GUEST_AVATAR_BUCKET)
      .createSignedUrls(paths, AVATAR_URL_TTL_SECONDS);
    if (error || !data) return items.map((item) => ({ ...item, avatar_url: null }));
    const signedByPath = new Map(data.flatMap((item) => (
      item.path && typeof item.signedUrl === 'string' && item.signedUrl
        ? [[item.path, item.signedUrl] as const]
        : []
    )));
    for (const [path, signedUrl] of signedByPath) avatarUrlCache.write(path, signedUrl);
    return items.map((item) => ({
      ...item,
      avatar_url: item.avatar_path ? signedByPath.get(item.avatar_path) ?? null : null,
    }));
  } catch {
    // A temporary Storage/signing failure must not make the entire guest view
    // unavailable. The client renders initials and retries on the next refresh.
    return items.map((item) => ({ ...item, avatar_url: null }));
  }
}
