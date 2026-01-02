import prisma from '../../../builders/database/prismaBuilder.js';
import moment from 'moment';
import SystemCodes from '../../../enums/SystemCodes.js';

class TenantModel {
  /**
   * Find tenant by ID (read-only)
   * If related records don't exist, creates them with default values
   */
  async findById(id) {
    let tenant = await prisma.tenantInfo.findUnique({
      where: { id },
      include: {
        shopify: true,
        nebim: true,
        shopifyAuth: true,
        nebimAuth: true,
        pricing: true,
        schedules: true,
      },
    });

    if (!tenant) return null;

    // Ensure default records exist (MongoDB behavior)
    tenant = await this._ensureDefaultRecords(tenant);

    return this._transformToMongoFormat(tenant);
  }

  /**
   * Find one tenant by query (read-only)
   * If related records don't exist, creates them with default values
   */
  async findOne(query) {
    const where = this._buildWhereClause(query);
    let tenant = await prisma.tenantInfo.findFirst({
      where,
      include: {
        shopify: true,
        nebim: true,
        shopifyAuth: true,
        nebimAuth: true,
        pricing: true,
        schedules: true,
      },
    });

    if (!tenant) return null;

    // Ensure default records exist (MongoDB behavior)
    tenant = await this._ensureDefaultRecords(tenant);

    return this._transformToMongoFormat(tenant);
  }

  /**
   * Ensure default records exist for tenant (MongoDB behavior)
   * Creates shopify, nebim, pricing, schedules with default values if they don't exist
   */
  async _ensureDefaultRecords(tenant) {
    const updates = {};

    // Create shopify if not exists
    if (!tenant.shopify) {
      updates.shopify = {
        upsert: {
          create: {
            isInventoryTracking: true,
            isColorOptionFirst: true,
            isEnterprise: false,
            isActive: true,
            skuFieldsNebim: [
              SystemCodes.NEBIM_SKU_FIELDS.ITEM_CODE,
              SystemCodes.NEBIM_SKU_FIELDS.COLOR_CODE,
              SystemCodes.NEBIM_SKU_FIELDS.ITEM_DIM1_CODE
            ],
            skuFieldsSeparator: SystemCodes.SEPARATORS.DASH,
          },
          update: {},
        },
      };
    }

    // Create nebim if not exists
    if (!tenant.nebim) {
      updates.nebim = {
        upsert: {
          create: {
            isActive: true,
            productCategoryKeysFrom: [],
            customerPhoneType: '7',
            customerAddressType: '1',
            customerConsentSource: 'HS_WEB',
            orderPosTerminalId: 1,
            procProductDetails: 'sp_INV_GetProductDetails',
            procProductInventory: 'sp_INV_GetProductInventory',
            procProductPrice: 'sp_INV_GetProductPrice',
            procCustomerCheck: 'qry_B2C_GetCustomer',
            procOrderStatus: 'sp_INV_OrderStatus',
            procDefaultsAddressCodes: 'sp_INV_GetAddressList',
          },
          update: {},
        },
      };
    }

    // Create pricing if not exists
    if (!tenant.pricing) {
      updates.pricing = {
        upsert: {
          create: {
            planKey: 'BASIC', // PlanKey enum value
            orderLimit: 10,
            orderUsed: 0,
            productDetailsLimit: 1000,
            productDetailsUsed: 0,
            periodStart: new Date(),
            periodEnd: moment().add(1, 'months').toDate(),
            isBlocked: false,
          },
          update: {},
        },
      };
    }

    // Create schedules if not exists
    if (!tenant.schedules) {
      updates.schedules = {
        upsert: {
          create: {
            nebimProductInventoryInterval: '0 * * * *',
            nebimProductInventoryStartDate: moment().subtract(1, 'hours').toDate(),
            nebimProductInventoryIsActive: false,
            nebimProductDetailsInterval: '0 0 * * *',
            nebimProductDetailsStartDate: moment().subtract(1, 'days').toDate(),
            nebimProductDetailsIsActive: false,
            nebimOrderCreateCancelInterval: '*/30 * * * *',
            nebimOrderCreateCancelStartDate: moment().subtract(30, 'minutes').toDate(),
            nebimOrderCreateCancelIsActive: false,
            nebimOrderStatusInterval: '0 0 * * *',
            nebimOrderStatusStartDate: moment().subtract(1, 'days').toDate(),
            nebimOrderStatusIsActive: false,
            redentionLogsInterval: '0 0 * * *',
            redentionLogsStartDate: moment().subtract(1, 'days').toDate(),
            redentionLogsIsActive: true,
          },
          update: {},
        },
      };
    }

    // Update tenant with missing records
    if (Object.keys(updates).length > 0) {
      tenant = await prisma.tenantInfo.update({
        where: { id: tenant.id },
        data: updates,
        include: {
          shopify: true,
          nebim: true,
          shopifyAuth: true,
          nebimAuth: true,
          pricing: true,
          schedules: true,
        },
      });
    }

    return tenant;
  }

  /**
   * Update tenant (limited - only for pricing updates from integration-api)
   */
  async updateOne(query, update) {
    const where = this._buildWhereClause(query);
    
    // Only allow pricing updates (billing limits)
    const updateData = {};
    
    // Handle nested path updates like "shopify.billing.limits.order.used"
    let limitsUpdate = null;
    
    // Check direct nested structure
    if (update.shopify?.billing?.limits) {
      limitsUpdate = update.shopify.billing.limits;
    }
    
    // Check flat key structure (e.g., "shopify.billing.limits": { "order": { "used": 5 } })
    for (const [key, value] of Object.entries(update)) {
      if (key === 'shopify.billing.limits' && typeof value === 'object' && value !== null) {
        // Direct nested object structure: { "shopify.billing.limits": { "order": { "used": 5 } } }
        limitsUpdate = value;
      } else if (key.startsWith('shopify.billing.limits.')) {
        // Dot notation path: "shopify.billing.limits.order.used"
        const parts = key.split('.');
        if (parts.length >= 4) {
          if (!limitsUpdate) limitsUpdate = {};
          if (!limitsUpdate[parts[3]]) limitsUpdate[parts[3]] = {};
          if (parts[4]) {
            limitsUpdate[parts[3]][parts[4]] = value;
          }
        }
      }
    }
    
    if (limitsUpdate) {
      // Get current pricing to preserve other fields
      const currentTenant = await prisma.tenantInfo.findUnique({
        where,
        include: { pricing: true },
      });
      
      const currentPricing = currentTenant?.pricing;
      
      const updateFields = {};
      if (limitsUpdate.order?.used !== undefined) {
        updateFields.orderUsed = limitsUpdate.order.used;
      } else if (currentPricing) {
        updateFields.orderUsed = currentPricing.orderUsed;
      }
      
      if (limitsUpdate.product_details?.used !== undefined) {
        updateFields.productDetailsUsed = limitsUpdate.product_details.used;
      } else if (currentPricing) {
        updateFields.productDetailsUsed = currentPricing.productDetailsUsed;
      }
      
      updateData.pricing = {
        upsert: {
          create: {
            planKey: 'BASIC',
            orderLimit: 10,
            orderUsed: limitsUpdate.order?.used ?? 0,
            productDetailsLimit: 1000,
            productDetailsUsed: limitsUpdate.product_details?.used ?? 0,
            periodStart: new Date(),
            periodEnd: moment().add(1, 'months').toDate(),
            isBlocked: false,
          },
          update: updateFields,
        },
      };
    }
    
    if (Object.keys(updateData).length === 0) {
      throw new Error('Only pricing (billing limits) updates are allowed from integration-api');
    }
    
    const tenant = await prisma.tenantInfo.update({
      where,
      data: updateData,
      include: {
        shopify: true,
        nebim: true,
        shopifyAuth: true,
        nebimAuth: true,
        pricing: true,
        schedules: true,
      },
    });

    return this._transformToMongoFormat(tenant);
  }

  /**
   * Build where clause from MongoDB-style query
   */
  _buildWhereClause(query) {
    const where = {};

    if (query._id || query.id) {
      where.id = query._id || query.id;
    }

    if (query.name) {
      where.name = query.name;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    // Handle nested queries like "shopify.shopId"
    if (query['shopify.shopId'] || query['shopify.shop_id']) {
      where.shopify = {
        shopId: query['shopify.shopId'] || query['shopify.shop_id'],
      };
    }

    if (query['shopify.domain']) {
      where.shopify = {
        ...where.shopify,
        domain: query['shopify.domain'],
      };
    }

    if (query['shopify.apiKey.hash']) {
      where.shopifyAuth = {
        apiKeyHash: query['shopify.apiKey.hash'],
      };
    }

    return where;
  }

  /**
   * Transform Prisma format to MongoDB-like format
   */
  _transformToMongoFormat(tenant) {
    const result = {
      _id: tenant.id,
      id: tenant.id,
      name: tenant.name,
      isActive: tenant.isActive,
      isTestStore: tenant.isTestStore,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };

    // Always include shopify (with defaults if shopify doesn't exist)
    result.shopify = {
      name: tenant.shopify?.name || null,
      domain: tenant.shopify?.domain || null,
      shopId: tenant.shopify?.shopId || null,
      customerEmail: tenant.shopify?.customerEmail || null,
      isInventoryTracking: tenant.shopify?.isInventoryTracking ?? true,
      isColorOptionFirst: tenant.shopify?.isColorOptionFirst ?? true,
      isEnterprise: tenant.shopify?.isEnterprise ?? false,
      isActive: tenant.shopify?.isActive ?? true,
      skuFields: {
        nebim: {
          fields: tenant.shopify?.skuFieldsNebim && tenant.shopify.skuFieldsNebim.length > 0
            ? tenant.shopify.skuFieldsNebim
            : [
                SystemCodes.NEBIM_SKU_FIELDS.ITEM_CODE,
                SystemCodes.NEBIM_SKU_FIELDS.COLOR_CODE,
                SystemCodes.NEBIM_SKU_FIELDS.ITEM_DIM1_CODE
              ],
          separator: tenant.shopify?.skuFieldsSeparator || SystemCodes.SEPARATORS.DASH,
        },
      },
    };

    if (tenant.shopifyAuth) {
      result.shopify.apiKey = {
        hash: tenant.shopifyAuth.apiKeyHash,
        encryptedData: tenant.shopifyAuth.apiKeyEncryptedData,
        iv: tenant.shopifyAuth.apiKeyIv,
        authTag: tenant.shopifyAuth.apiKeyAuthTag,
      };
    }

    // Always include billing (with defaults if pricing doesn't exist)
    result.shopify.billing = {
      planKey: tenant.pricing?.planKey || 'BASIC',
      subscription: {
        id: tenant.pricing?.subscriptionId || null,
        lineId: tenant.pricing?.subscriptionLineId || null,
      },
      limits: {
        order: {
          limit: tenant.pricing?.orderLimit ?? 10,
          used: tenant.pricing?.orderUsed ?? 0,
        },
        product_details: {
          limit: tenant.pricing?.productDetailsLimit ?? 1000,
          used: tenant.pricing?.productDetailsUsed ?? 0,
        },
      },
      periodStart: tenant.pricing?.periodStart ? tenant.pricing.periodStart.toISOString() : new Date().toISOString(),
      periodEnd: tenant.pricing?.periodEnd ? tenant.pricing.periodEnd.toISOString() : moment().add(1, 'months').toISOString(),
      isBlocked: tenant.pricing?.isBlocked ?? false,
      pendingNonce: tenant.pricing?.pendingNonce || null,
      pendingPlanKey: tenant.pricing?.pendingPlanKey || null,
    };

    // Always include schedules (with defaults if schedules doesn't exist)
    result.shopify.schedules = {
      nebim: {
        product: {
          inventory: {
            interval: tenant.schedules?.nebimProductInventoryInterval || '0 * * * *',
            startDate: tenant.schedules?.nebimProductInventoryStartDate?.toISOString() || null,
            isActive: tenant.schedules?.nebimProductInventoryIsActive ?? false,
          },
          details: {
            interval: tenant.schedules?.nebimProductDetailsInterval || '0 0 * * *',
            startDate: tenant.schedules?.nebimProductDetailsStartDate?.toISOString() || null,
            isActive: tenant.schedules?.nebimProductDetailsIsActive ?? false,
          },
        },
        order: {
          create_and_cancel: {
            interval: tenant.schedules?.nebimOrderCreateCancelInterval || '*/30 * * * *',
            startDate: tenant.schedules?.nebimOrderCreateCancelStartDate?.toISOString() || null,
            isActive: tenant.schedules?.nebimOrderCreateCancelIsActive ?? false,
          },
          status: {
            interval: tenant.schedules?.nebimOrderStatusInterval || '0 0 * * *',
            startDate: tenant.schedules?.nebimOrderStatusStartDate?.toISOString() || null,
            isActive: tenant.schedules?.nebimOrderStatusIsActive ?? false,
          },
        },
      },
      redention: {
        logs: {
          interval: tenant.schedules?.redentionLogsInterval || '0 0 * * *',
          startDate: tenant.schedules?.redentionLogsStartDate?.toISOString() || null,
          isActive: tenant.schedules?.redentionLogsIsActive ?? true,
        },
      },
    };

    // Always include nebim (with defaults if nebim doesn't exist)
    result.nebim = {
      host: tenant.nebim?.host || null,
      user: tenant.nebim?.user || null,
      userGroup: tenant.nebim?.userGroup || null,
      salesUrl: tenant.nebim?.salesUrl || null,
      isActive: tenant.nebim?.isActive ?? true,
      product: {
        categoryKeysFrom: tenant.nebim?.productCategoryKeysFrom || [],
      },
      customer: {
        phoneType: tenant.nebim?.customerPhoneType || '7',
        addressType: tenant.nebim?.customerAddressType || '1',
        confirmationFormTypeCode: tenant.nebim?.customerConfirmationFormTypeCode || null,
        confirmationFormStatusCode: tenant.nebim?.customerConfirmationFormStatusCode || null,
        consentSource: tenant.nebim?.customerConsentSource || 'HS_WEB',
        inactivationReasonCode: tenant.nebim?.customerInactivationReasonCode || null,
      },
      order: {
        deliveryCompany: tenant.nebim?.orderDeliveryCompany || null,
        posTerminalId: tenant.nebim?.orderPosTerminalId ?? 1,
        creditCardType: tenant.nebim?.orderCreditCardType || null,
        office: tenant.nebim?.orderOffice || null,
        store: tenant.nebim?.orderStore || null,
        company: tenant.nebim?.orderCompany || null,
        warehouse: tenant.nebim?.orderWarehouse || null,
        cancelReason: tenant.nebim?.orderCancelReason || null,
      },
      procNames: {
        product: {
          details: tenant.nebim?.procProductDetails || 'sp_INV_GetProductDetails',
          inventory: tenant.nebim?.procProductInventory || 'sp_INV_GetProductInventory',
          price: tenant.nebim?.procProductPrice || 'sp_INV_GetProductPrice',
        },
        customer: {
          check: tenant.nebim?.procCustomerCheck || 'qry_B2C_GetCustomer',
        },
        order: {
          status: tenant.nebim?.procOrderStatus || 'sp_INV_OrderStatus',
        },
        defaults: {
          addressCodes: tenant.nebim?.procDefaultsAddressCodes || 'sp_INV_GetAddressList',
        },
      },
    };

    if (tenant.nebimAuth) {
      result.nebim.password = {
        hash: tenant.nebimAuth.passwordHash,
        encryptedData: tenant.nebimAuth.passwordEncryptedData,
        iv: tenant.nebimAuth.passwordIv,
        authTag: tenant.nebimAuth.passwordAuthTag,
      };
    }

    return result;
  }
}

// Export singleton instance
export default new TenantModel();

