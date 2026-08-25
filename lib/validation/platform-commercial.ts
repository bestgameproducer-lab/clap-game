import { ApiError } from '../errors';
import { requiredBoolean, requiredUuid, type JsonObject } from '../validation';

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

export function readPlatformQuoteProceedInput(body: JsonObject) {
  if (Object.keys(body).sort().join(',') !== 'acknowledgedNoPayment,eventKey,quoteId') {
    throw new ApiError(400, '报价下一步请求包含不支持的字段');
  }
  const acknowledgedNoPayment = requiredBoolean(body.acknowledgedNoPayment, '非付款确认');
  if (!acknowledgedNoPayment) {
    throw new ApiError(400, '请先确认这不是付款、订单或合同接受');
  }
  return {
    eventKey: requiredUuid(body.eventKey, '操作编号'),
    quoteId: requiredUuid(body.quoteId, '报价编号'),
    acknowledgedNoPayment,
  };
}
