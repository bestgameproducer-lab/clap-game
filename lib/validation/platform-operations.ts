import { optionalString, requiredEnum, requiredString, requiredUuid, type JsonObject } from '../validation';
import { ApiError } from '../errors';
import {
  getPlatformRuntimeChecklist,
  isPlatformRuntimeChecklistComplete,
  type PlatformRuntimeAttestationStage,
  type PlatformRuntimeChecklist,
} from '../platform/runtime-readiness';

export type PlatformReviewDecision = 'approved' | 'changes_requested';

const OBVIOUS_RUNTIME_SECRET_PATTERNS = [
  /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/:@]+:[^\s@]+@/i,
  /\b(?:sb_secret_|sk_(?:live|test)_|sk-(?:live-|test-)?)[A-Za-z0-9_-]{12,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
];

function rejectObviousRuntimeSecret(value: string) {
  if (OBVIOUS_RUNTIME_SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new ApiError(400, '核验记录不能包含数据库连接串、API 密钥或登录令牌');
  }
  return value;
}

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

export function readPlatformRuntimeAttestationInput(body: JsonObject) {
  if (Object.keys(body).sort().join(',') !== 'checklist,eventKey,note,stage') {
    throw new ApiError(400, '实例核验请求包含不支持的字段');
  }
  const stage = requiredEnum(
    body.stage,
    '实例核验阶段',
    ['verification', 'readiness'] as const,
  ) as PlatformRuntimeAttestationStage;
  if (!body.checklist || typeof body.checklist !== 'object' || Array.isArray(body.checklist)) {
    throw new ApiError(400, '实例核验清单格式不正确');
  }
  const checklist = body.checklist as PlatformRuntimeChecklist;
  if (!isPlatformRuntimeChecklistComplete(stage, checklist)) {
    const missing = getPlatformRuntimeChecklist(stage)
      .filter((item) => checklist[item.id] !== true)
      .map((item) => item.label);
    throw new ApiError(400, missing.length ? `请先完成：${missing.join('、')}` : '实例核验清单格式不正确');
  }
  const note = rejectObviousRuntimeSecret(requiredString(body.note, '核验记录', 1000));
  return {
    eventKey: requiredUuid(body.eventKey, '操作编号'),
    stage,
    checklist,
    note,
  };
}
