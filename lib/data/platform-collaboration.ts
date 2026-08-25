import 'server-only';
import { ApiError } from '../errors';
import { createPlatformServerClient } from '../platform/supabase-server';
import type { PlatformMemberRole } from '../validation/platform-collaboration';

function mapCollaborationError(message: string): never {
  if (message.includes('platform_project_not_owned')) throw new ApiError(404, '没有找到这个客户项目或你不是项目所有者');
  if (message.includes('platform_project_archived')) throw new ApiError(409, '项目已经归档，恢复为草稿后才能创建新邀请');
  if (message.includes('platform_invitation_invalid')) throw new ApiError(400, '邀请信息格式不正确');
  if (message.includes('platform_invitation_limit')) throw new ApiError(409, '这个项目已有过多待领取邀请，请先撤销旧邀请');
  if (message.includes('platform_invitation_unavailable')) throw new ApiError(409, '邀请已失效、已领取或已撤销');
  if (message.includes('platform_invitation_owner')) throw new ApiError(409, '项目所有者不需要领取自己的邀请');
  if (message.includes('platform_member_not_found')) throw new ApiError(404, '没有找到这个项目成员');
  if (message.includes('platform_event_conflict')) throw new ApiError(409, '操作编号已经用于其他请求');
  throw new Error(`Unable to update platform collaboration: ${message}`);
}

export async function createPlatformInvitation(projectId: string, eventKey: string, role: PlatformMemberRole, tokenHash: string) {
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_create_project_invitation', {
    p_event_key: eventKey,
    p_project_id: projectId,
    p_role: role,
    p_token_hash: tokenHash,
  }).single();
  if (error) mapCollaborationError(error.message);
  const row = data as { id: string; project_id: string; role: PlatformMemberRole; expires_at: string } | null;
  if (!row) throw new Error('Unable to create platform invitation: missing response');
  return { id: row.id, projectId: row.project_id, role: row.role, expiresAt: row.expires_at };
}

export async function acceptPlatformInvitation(eventKey: string, tokenHash: string) {
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_accept_project_invitation', {
    p_event_key: eventKey,
    p_token_hash: tokenHash,
  }).single();
  if (error) mapCollaborationError(error.message);
  const row = data as { project_id: string; role: PlatformMemberRole } | null;
  if (!row) throw new Error('Unable to accept platform invitation: missing response');
  return { projectId: row.project_id, role: row.role };
}

export async function revokePlatformInvitation(projectId: string, invitationId: string, eventKey: string) {
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_revoke_project_invitation', {
    p_event_key: eventKey,
    p_project_id: projectId,
    p_invitation_id: invitationId,
  }).single();
  if (error) mapCollaborationError(error.message);
  if (!data) throw new Error('Unable to revoke platform invitation: missing response');
  return data;
}

export async function removePlatformMember(projectId: string, memberUserId: string, eventKey: string) {
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_remove_project_member', {
    p_event_key: eventKey,
    p_project_id: projectId,
    p_member_user_id: memberUserId,
  }).single();
  if (error) mapCollaborationError(error.message);
  if (!data) throw new Error('Unable to remove platform member: missing response');
  return data;
}
