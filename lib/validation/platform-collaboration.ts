import { requiredEnum, requiredUuid, type JsonObject } from '../validation';

export type PlatformMemberRole = 'editor' | 'viewer';

export function readPlatformInvitationCreateInput(body: JsonObject) {
  return {
    eventKey: requiredUuid(body.eventKey, '操作编号'),
    invitationToken: requiredUuid(body.invitationToken, '邀请凭证'),
    role: requiredEnum(body.role, '协作权限', ['editor', 'viewer'] as const),
  };
}

export function readPlatformInvitationAcceptInput(body: JsonObject) {
  return {
    eventKey: requiredUuid(body.eventKey, '操作编号'),
    invitationToken: requiredUuid(body.invitationToken, '邀请凭证'),
  };
}

export function readPlatformInvitationRevokeInput(body: JsonObject) {
  return { eventKey: requiredUuid(body.eventKey, '操作编号') };
}

export function readPlatformMemberRemoveInput(body: JsonObject) {
  return { eventKey: requiredUuid(body.eventKey, '操作编号') };
}
