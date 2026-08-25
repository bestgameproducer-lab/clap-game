import { optionalString, requiredEnum, requiredUuid, type JsonObject } from '../validation';
import { ApiError } from '../errors';

export type PlatformReviewDecision = 'approved' | 'changes_requested';

export function readPlatformOperatorReviewInput(body: JsonObject) {
  const decision = requiredEnum(body.decision, '审核决定', ['approved', 'changes_requested'] as const);
  const note = optionalString(body.note, '审核备注', 2000);
  if (decision === 'changes_requested' && !note) {
    throw new ApiError(400, '退回修改时必须填写明确的审核意见');
  }
  return {
    eventKey: requiredUuid(body.eventKey, '操作编号'),
    decision,
    note,
  };
}
