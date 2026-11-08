import CoreClass from '../core/CoreClass.js';
import CLSHelper from '../helpers/CLSHelper.js';
import StringHelper from '../helpers/StringHelper.js';
import CustomerConsentTransferLog from '../models/db/postgres/CustomerConsentTransferLog.js';

function serializeRaw(value) {
  if (value === undefined) return null;
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default class ConsentAuditBusiness extends CoreClass {
  constructor(tenant, context = {}) {
    super(tenant);
    this.flowId = context.flowId || StringHelper.generateUUID();
    this.sequenceNo = 0;
    this.sourceSystem = context.sourceSystem;
    this.targetSystem = context.targetSystem;
    this.triggerType = context.triggerType;
    this.sourceEventId = context.sourceEventId || null;
    this.sourcePayloadRaw = serializeRaw(context.sourcePayloadRaw);
  }

  execute = async (metadata, targetRequest, executor) => {
    this.sequenceNo += 1;
    const pending = await CustomerConsentTransferLog.createPending({
      flowId: this.flowId,
      sequenceNo: this.sequenceNo,
      tenantId: this.tenant.id || this.tenant._id,
      tenantName: this.tenant.name || null,
      shopDomain: this.tenant.shopify?.domain || null,
      sourceSystem: this.sourceSystem,
      targetSystem: this.targetSystem,
      triggerType: this.triggerType,
      operation: metadata.operation,
      channel: metadata.channel || null,
      sourceEventId: metadata.sourceEventId || this.sourceEventId,
      sourceCustomerRef: metadata.sourceCustomerRef || null,
      targetCustomerRef: metadata.targetCustomerRef || null,
      consentState: metadata.consentState || null,
      consentUpdatedAt: metadata.consentUpdatedAt ? new Date(metadata.consentUpdatedAt) : null,
      sourcePayloadRaw: serializeRaw(metadata.sourcePayloadRaw ?? this.sourcePayloadRaw),
      targetRequestRaw: serializeRaw(targetRequest),
      traceId: CLSHelper.get('traceId') || null,
    });

    try {
      const result = await executor();
      await CustomerConsentTransferLog.complete(pending.id, {
        status: metadata.successStatus || 'SUCCESS',
        targetCustomerRef: metadata.resolveTargetCustomerRef?.(result) || metadata.targetCustomerRef || null,
        targetHttpStatus: metadata.resolveHttpStatus?.(result) || 200,
        targetResponseRaw: serializeRaw(result),
      });
      return result;
    } catch (error) {
      const response = error?.response?.data ?? error?.data ?? {
        name: error?.name,
        message: error?.message || String(error),
      };
      await CustomerConsentTransferLog.complete(pending.id, {
        status: 'FAILED',
        targetHttpStatus: error?.response?.status || error?.status || 0,
        targetResponseRaw: serializeRaw(response),
        errorCode: error?.code || null,
        errorMessage: error?.message || String(error),
      });
      throw error;
    }
  };
}
