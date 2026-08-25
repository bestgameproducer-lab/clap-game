import { ApiError } from '../errors';
import { requiredUuid, type JsonObject } from '../validation';

export function readPlatformQuoteRequestInput(body: JsonObject) {
  if (Object.keys(body).sort().join(',') !== 'eventKey,projectVersion') {
    throw new ApiError(400, '询价请求包含不支持的字段');
  }
  if (!Number.isInteger(body.projectVersion) || Number(body.projectVersion) < 1) {
    throw new ApiError(400, '询价项目版本不正确');
  }
  return {
    eventKey: requiredUuid(body.eventKey, '操作编号'),
    projectVersion: Number(body.projectVersion),
  };
}
