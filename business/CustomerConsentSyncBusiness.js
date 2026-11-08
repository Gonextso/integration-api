import { createHash } from 'node:crypto';
import CoreClass from '../core/CoreClass.js';
import NebimV3IntegratorAPI from '../apis/NebimV3IntegratorAPI.js';
import ShopifyGqlAPI from '../apis/ShopifyGqlAPI.js';
import ConsentAuditBusiness from './ConsentAuditBusiness.js';
import customerQueries from '../models/shopify/queries/customer.js';
import customerMutations from '../models/shopify/mutations/customer.js';

function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\D/g, '')}`;

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) return `+90${digits.slice(1)}`;
  if (digits.length === 10) return `+90${digits}`;
  if (digits.startsWith('90')) return `+${digits}`;
  return digits;
}

function escapeSearchValue(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export default class CustomerConsentSyncBusiness extends CoreClass {
  constructor(tenant, context = {}) {
    super(tenant);
    this.nebimAPI = new NebimV3IntegratorAPI(tenant);
    this.shopifyAPI = new ShopifyGqlAPI(tenant);
    this.audit = new ConsentAuditBusiness(tenant, {
      sourceSystem: 'NEBIM',
      targetSystem: 'SHOPIFY',
      triggerType: 'CRON',
      ...context,
    });
  }

  sync = async (startDate) => {
    if (!this.tenant.nebim?.host || !this.tenant.nebim?.user || !this.tenant.nebim?.userGroup) {
      this.throws('Nebim connection settings are incomplete', true);
    }
    if (!this.tenant.shopify?.decyrptedApiKey) {
      this.throws('Shopify access token is missing', true);
    }

    const rows = await this.nebimAPI.runProc(
      this.tenant.nebim.procNames.customer.concents,
      { Date: startDate },
    );
    if (!Array.isArray(rows)) this.throws('Customer consent procedure must return an array');

    const summary = {
      received: rows.length,
      updated: 0,
      notFound: 0,
      ambiguous: 0,
      skipped: 0,
      failed: 0,
    };

    for (const row of this.#latestRows(rows)) {
      const channel = this.#resolveChannel(row);
      if (!channel) {
        summary.skipped += 1;
        continue;
      }

      try {
        const customer = await this.#findCustomer(row, channel);
        if (customer.status === 'not_found') {
          summary.notFound += 1;
          continue;
        }
        if (customer.status === 'ambiguous') {
          summary.ambiguous += 1;
          continue;
        }

        await this.#updateConsent(customer.node, row, channel);
        summary.updated += 1;
      } catch (error) {
        summary.failed += 1;
        this.logger.error(error);
      }
    }

    if (summary.failed > 0) {
      const error = new Error(`Customer consent sync completed with ${summary.failed} failed row(s)`);
      error.summary = summary;
      throw error;
    }

    return summary;
  };

  #latestRows = (rows) => {
    const latest = new Map();
    for (const row of rows) {
      const key = `${String(row?.CommunicationTypeCode || '').trim()}:${String(row?.CommAddress || '').trim().toLowerCase()}`;
      const current = latest.get(key);
      const rowDate = new Date(row?.LastUpdatedDate || 0).getTime();
      const currentDate = new Date(current?.LastUpdatedDate || 0).getTime();
      if (!current || rowDate >= currentDate) latest.set(key, row);
    }
    return latest.values();
  };

  #resolveChannel = (row) => {
    const type = String(row?.CommunicationTypeCode || '').trim();
    if (type === '3' && asBoolean(row?.Email)) return 'EMAIL';
    if (type === String(this.tenant.nebim.customer.phoneType) && asBoolean(row?.SMS)) return 'SMS';
    return null;
  };

  #sourceEventId = (row) => createHash('sha256')
    .update([
      row?.CurrAccCode,
      row?.CommunicationTypeCode,
      row?.CommAddress,
      row?.CanSendAdvert,
      row?.LastUpdatedDate,
    ].join('|'))
    .digest('hex');

  #metadata = (row, channel, operation) => ({
    operation,
    channel,
    sourceEventId: this.#sourceEventId(row),
    sourceCustomerRef: row?.CurrAccCode ? String(row.CurrAccCode) : null,
    consentState: asBoolean(row?.CanSendAdvert) ? 'SUBSCRIBED' : 'UNSUBSCRIBED',
    consentUpdatedAt: row?.LastUpdatedDate || null,
    sourcePayloadRaw: row,
  });

  #queryShopify = async (query, variables, userErrorPath) => {
    const response = await this.shopifyAPI.query(query, variables);
    if (response instanceof Error) throw response;
    if (!response) throw new Error('Shopify returned an empty GraphQL response');
    const userErrors = userErrorPath?.(response) || [];
    if (response?.errors?.length || userErrors.length) {
      const error = new Error('Shopify GraphQL request failed');
      error.data = response;
      throw error;
    }
    return response;
  };

  #findCustomer = async (row, channel) => {
    const contact = channel === 'EMAIL'
      ? String(row.CommAddress || '').trim().toLowerCase()
      : normalizePhone(row.CommAddress);
    if (!contact) return { status: 'not_found' };

    const search = channel === 'EMAIL'
      ? `email:"${escapeSearchValue(contact)}"`
      : `phone:${escapeSearchValue(contact)}`;
    const request = { query: search };
    const response = await this.audit.execute(
      this.#metadata(row, channel, 'FIND_CUSTOMER'),
      request,
      () => this.#queryShopify(customerQueries.findByContact, request),
    );
    const nodes = response?.data?.customers?.nodes || [];
    const exact = nodes.filter((node) => channel === 'EMAIL'
      ? String(node.email || '').trim().toLowerCase() === contact
      : normalizePhone(node.phone) === contact);

    if (exact.length === 0) return { status: 'not_found' };
    if (exact.length > 1) return { status: 'ambiguous' };
    return { status: 'found', node: exact[0] };
  };

  #updateConsent = async (customer, row, channel) => {
    const marketingConsent = {
      marketingState: asBoolean(row.CanSendAdvert) ? 'SUBSCRIBED' : 'UNSUBSCRIBED',
      marketingOptInLevel: 'SINGLE_OPT_IN',
      consentUpdatedAt: new Date(row.LastUpdatedDate).toISOString(),
    };

    if (channel === 'EMAIL') {
      const request = {
        input: {
          customerId: customer.id,
          emailMarketingConsent: marketingConsent,
        },
      };
      return this.audit.execute(
        {
          ...this.#metadata(row, channel, 'UPDATE_EMAIL_CONSENT'),
          targetCustomerRef: customer.id,
        },
        request,
        () => this.#queryShopify(
          customerMutations.updateEmailConsent,
          request,
          (response) => response?.data?.customerEmailMarketingConsentUpdate?.userErrors || [],
        ),
      );
    }

    const request = {
      input: {
        customerId: customer.id,
        smsMarketingConsent: marketingConsent,
      },
    };
    return this.audit.execute(
      {
        ...this.#metadata(row, channel, 'UPDATE_SMS_CONSENT'),
        targetCustomerRef: customer.id,
      },
      request,
      () => this.#queryShopify(
        customerMutations.updateSmsConsent,
        request,
        (response) => response?.data?.customerSmsMarketingConsentUpdate?.userErrors || [],
      ),
    );
  };
}
