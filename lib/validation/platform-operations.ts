import { optionalString, requiredEnum, requiredInteger, requiredString, requiredUuid, type JsonObject } from '../validation';
import { ApiError } from '../errors';
import {
  getPlatformRuntimeChecklist,
  isPlatformRuntimeChecklistComplete,
  type PlatformRuntimeAttestationStage,
  type PlatformRuntimeChecklist,
} from '../platform/runtime-readiness';
import {
  getPlatformRuntimeReleaseChecklist,
  isPlatformRuntimeReleaseChecklistComplete,
  type PlatformRuntimeReleaseAction,
  type PlatformRuntimeReleaseChecklist,
} from '../platform/runtime-release';
import { PLATFORM_QUOTE_BILLING_INTERVALS, PLATFORM_QUOTE_CURRENCIES } from '../platform/commercial';

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

function readRuntimeOperationsNote(value: unknown) {
  const note = requiredString(value, '操作记录', 1000);
  if (note.length < 4) throw new ApiError(400, '操作记录至少需要 4 个字');
  return rejectObviousRuntimeSecret(note);
}

function readCustomerDeliveryMessage(value: unknown) {
  const message = requiredString(value, '客户可见说明', 500);
  if (message.length < 4) throw new ApiError(400, '客户可见说明至少需要 4 个字');
  if (
    /https?:\/\//i.test(message)
    || /\b[0-9a-f]{64}\b/i.test(message)
    || /\b(?:preview|production|deploy(?:ment)?)[.:][A-Za-z0-9._:-]+\b/i.test(message)
  ) {
    throw new ApiError(400, '客户可见说明不能包含网址、配置指纹或内部部署标识');
  }
  return rejectObviousRuntimeSecret(message);
}

function readCommercialQuoteText(value: unknown, label: string, minimum: number, maximum: number) {
  const result = requiredString(value, label, maximum);
  if (result.length < minimum) throw new ApiError(400, `${label}至少需要 ${minimum} 个字`);
  if (/[<>]/.test(result) || /https?:\/\//i.test(result)) {
    throw new ApiError(400, `${label}不能包含 HTML 或网址`);
  }
  if (OBVIOUS_RUNTIME_SECRET_PATTERNS.some((pattern) => pattern.test(result))) {
    throw new ApiError(400, `${label}不能包含数据库连接串、API 密钥或登录令牌`);
  }
  return result;
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

export function readPlatformCommercialQuoteInput(body: JsonObject) {
  if (Object.keys(body).sort().join(',') !== 'amountMinor,billingInterval,currency,eventKey,quoteRequestId,serviceSummary,termsSummary,validUntil') {
    throw new ApiError(400, '商业报价请求包含不支持的字段');
  }
  const validUntil = requiredString(body.validUntil, '报价有效期', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) throw new ApiError(400, '报价有效期格式不正确');
  const parsed = new Date(`${validUntil}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== validUntil) {
    throw new ApiError(400, '报价有效期格式不正确');
  }
  return {
    eventKey: requiredUuid(body.eventKey, '操作编号'),
    quoteRequestId: requiredUuid(body.quoteRequestId, '询价编号'),
    amountMinor: requiredInteger(body.amountMinor, '报价金额', 1, 1_000_000_000),
    currency: requiredEnum(body.currency, '报价币种', PLATFORM_QUOTE_CURRENCIES),
    billingInterval: requiredEnum(body.billingInterval, '计费周期', PLATFORM_QUOTE_BILLING_INTERVALS),
    validUntil,
    serviceSummary: readCommercialQuoteText(body.serviceSummary, '服务摘要', 4, 1000),
    termsSummary: readCommercialQuoteText(body.termsSummary, '商业条款摘要', 20, 4000),
  };
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
  const note = readRuntimeOperationsNote(body.note);
  return {
    eventKey: requiredUuid(body.eventKey, '操作编号'),
    stage,
    checklist,
    note,
  };
}

export function readPlatformRuntimeReleaseInput(body: JsonObject) {
  if (Object.keys(body).sort().join(',') !== 'action,checklist,customerMessage,eventKey,note') {
    throw new ApiError(400, '正式发布请求包含不支持的字段');
  }
  const action = requiredEnum(body.action, '正式发布动作', ['release', 'hold'] as const) as PlatformRuntimeReleaseAction;
  if (!body.checklist || typeof body.checklist !== 'object' || Array.isArray(body.checklist)) {
    throw new ApiError(400, '正式发布清单格式不正确');
  }
  const checklist = body.checklist as PlatformRuntimeReleaseChecklist;
  if (!isPlatformRuntimeReleaseChecklistComplete(action, checklist)) {
    const missing = getPlatformRuntimeReleaseChecklist(action)
      .filter((item) => checklist[item.id] !== true)
      .map((item) => item.label);
    throw new ApiError(400, missing.length ? `请先完成：${missing.join('、')}` : '正式发布清单格式不正确');
  }
  return {
    eventKey: requiredUuid(body.eventKey, '操作编号'),
    action,
    checklist,
    note: readRuntimeOperationsNote(body.note),
    customerMessage: readCustomerDeliveryMessage(body.customerMessage),
  };
}
