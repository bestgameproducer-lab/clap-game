import { optionalString, requiredEnum, requiredString, requiredUuid, type JsonObject } from '../validation';
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

export function readPlatformManifestLockInput(body: JsonObject) {
  return { eventKey: requiredUuid(body.eventKey, '操作编号') };
}

export function readPlatformInstanceRegistrationInput(body: JsonObject) {
  const inputOrigin = requiredString(body.targetOrigin, '实例网址', 300);
  let parsed: URL;
  try {
    parsed = new URL(inputOrigin);
  } catch {
    throw new ApiError(400, '实例网址必须是有效的 HTTPS 站点来源');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(parsed.hostname)
  ) {
    throw new ApiError(400, '实例网址只允许公开 HTTPS 来源，不得包含账号、路径、参数或片段');
  }
  const port = parsed.port ? Number(parsed.port) : 443;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ApiError(400, '实例网址端口无效');

  const deploymentRef = requiredString(body.deploymentRef, '部署标识', 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(deploymentRef)) {
    throw new ApiError(400, '部署标识只能使用英文字母、数字、点、下划线、冒号或连字符');
  }
  return {
    eventKey: requiredUuid(body.eventKey, '操作编号'),
    targetOrigin: parsed.origin.toLowerCase(),
    deploymentRef,
  };
}
