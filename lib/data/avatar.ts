import 'server-only';
import { ApiError } from '../errors';
import { getSupabaseAdmin } from '../supabase';

export const GUEST_AVATAR_BUCKET = 'guest-avatars';
const AVATAR_URL_TTL_SECONDS = 10 * 60;

function guestAvatarPath(guestId: string) {
  return `${guestId}/avatar.jpg`;
}

export async function createGuestAvatarUpload(guestId: string) {
  const db = getSupabaseAdmin();
  const { data: guest, error: guestError } = await db
    .from('guests')
    .select('id')
    .eq('id', guestId)
    .eq('active', true)
    .eq('uses_app', true)
    .maybeSingle();
  if (guestError) throw new Error(`Unable to authorize guest avatar: ${guestError.message}`);
  if (!guest) throw new ApiError(404, '找不到可以设置头像的宾客');
  const path = guestAvatarPath(guestId);
  const { data, error } = await db.storage.from(GUEST_AVATAR_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(`Unable to authorize avatar upload: ${error?.message ?? 'missing URL'}`);
  return { path, signedUrl: data.signedUrl };
}

export async function confirmGuestAvatar(guestId: string, path: string) {
  const { data, error } = await getSupabaseAdmin().rpc('confirm_guest_avatar', {
    p_guest_id: guestId,
    p_avatar_path: path,
  });
  if (error?.message.includes('avatar_guest_not_found')) throw new ApiError(404, '找不到可以设置头像的宾客');
  if (error?.message.includes('invalid_avatar_path')) throw new ApiError(400, '头像路径无效');
  if (error?.message.includes('avatar_object_missing')) throw new ApiError(409, '头像尚未上传完成，请重试');
  if (error) throw new Error(`Unable to confirm guest avatar: ${error.message}`);
  return { uploadedAt: data as string };
}

export async function signAvatarPaths<T extends { avatar_path?: string | null }>(items: T[]) {
  const paths = [...new Set(items.flatMap((item) => item.avatar_path ? [item.avatar_path] : []))];
  if (paths.length === 0) return items.map((item) => ({ ...item, avatar_url: null }));
  const { data, error } = await getSupabaseAdmin().storage
    .from(GUEST_AVATAR_BUCKET)
    .createSignedUrls(paths, AVATAR_URL_TTL_SECONDS);
  if (error || !data) throw new Error(`Unable to sign guest avatars: ${error?.message ?? 'missing URLs'}`);
  const signedByPath = new Map(data.map((item) => [item.path, item.signedUrl]));
  return items.map((item) => ({
    ...item,
    avatar_url: item.avatar_path ? signedByPath.get(item.avatar_path) ?? null : null,
  }));
}
