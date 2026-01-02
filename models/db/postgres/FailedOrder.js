import prisma from '../../../builders/database/prismaBuilder.js';
import SystemCodes from '../../../enums/SystemCodes.js';

class FailedOrderModel {
  /**
   * Find failed orders by query
   */
  async find(query = {}) {
    const where = this._buildWhereClause(query);
    const orders = await prisma.syncFailedOrder.findMany({
      where,
      include: {
        tenant: true,
        syncBatch: true,
      },
    });

    return orders.map(o => this._transformToMongoFormat(o));
  }

  /**
   * Find one failed order
   */
  async findOne(query) {
    const where = this._buildWhereClause(query);
    const order = await prisma.syncFailedOrder.findFirst({
      where,
      include: {
        tenant: true,
        syncBatch: true,
      },
    });

    if (!order) return null;

    return this._transformToMongoFormat(order);
  }

  /**
   * Create failed order
   */
  async create(data) {
    const normalized = this._normalizeFromMongoFormat(data);
    
    const order = await prisma.syncFailedOrder.create({
      data: normalized,
      include: {
        tenant: true,
        syncBatch: true,
      },
    });

    return this._transformToMongoFormat(order);
  }

  /**
   * Delete one failed order
   */
  async deleteOne(query) {
    const where = this._buildWhereClause(query);
    
    // Prisma delete() requires a unique identifier (id)
    // If query has id, use it directly; otherwise find first and then delete by id
    if (where.id) {
      await prisma.syncFailedOrder.delete({
        where: { id: where.id },
      });
      return { acknowledged: true, deletedCount: 1 };
    } else {
      // Find the record first
      const existing = await prisma.syncFailedOrder.findFirst({
        where,
      });
      
      if (existing) {
        await prisma.syncFailedOrder.delete({
          where: { id: existing.id },
        });
        return { acknowledged: true, deletedCount: 1 };
      } else {
        return { acknowledged: true, deletedCount: 0 };
      }
    }
  }

  /**
   * Delete many failed orders
   */
  async deleteMany(query) {
    const where = this._buildWhereClause(query);
    const result = await prisma.syncFailedOrder.deleteMany({
      where,
    });

    return { acknowledged: true, deletedCount: result.count };
  }

  /**
   * Update one failed order (with optional upsert support)
   */
  async updateOne(query, update, options = {}) {
    const where = this._buildWhereClause(query);
    const normalized = this._normalizeFromMongoFormat(update);
    
    // Handle $set operator in update
    if (update.$set) {
      Object.assign(normalized, this._normalizeFromMongoFormat(update.$set));
    }
    
    if (options.upsert) {
      // Use Prisma upsert - need to find existing or create
      const existing = await prisma.syncFailedOrder.findFirst({
        where,
      });
      
      if (existing) {
        const order = await prisma.syncFailedOrder.update({
          where: { id: existing.id },
          data: normalized,
          include: {
            tenant: true,
            syncBatch: true,
          },
        });
        return this._transformToMongoFormat(order);
      } else {
        // Create new record with combined data
        const createData = {
          ...normalized,
          ...where,
        };
        const order = await prisma.syncFailedOrder.create({
          data: createData,
          include: {
            tenant: true,
            syncBatch: true,
          },
        });
        return this._transformToMongoFormat(order);
      }
    } else {
      // Regular update - Prisma update() requires a unique identifier
      // If query has id, use it directly; otherwise find first and then update by id
      if (where.id) {
        const order = await prisma.syncFailedOrder.update({
          where: { id: where.id },
          data: normalized,
          include: {
            tenant: true,
            syncBatch: true,
          },
        });
        return this._transformToMongoFormat(order);
      } else {
        // Find the record first
        const existing = await prisma.syncFailedOrder.findFirst({
          where,
        });
        
        if (existing) {
          const order = await prisma.syncFailedOrder.update({
            where: { id: existing.id },
            data: normalized,
            include: {
              tenant: true,
              syncBatch: true,
            },
          });
          return this._transformToMongoFormat(order);
        } else {
          throw new Error('Record not found for update');
        }
      }
    }
  }

  /**
   * Build where clause from MongoDB-style query
   */
  _buildWhereClause(query) {
    const where = {};

    if (query._id || query.id) {
      where.id = query._id || query.id;
    }

    if (query.tenant) {
      where.tenantId = typeof query.tenant === 'object' ? query.tenant._id || query.tenant.id : query.tenant;
    }

    if (query.syncBatchId) {
      where.syncBatchId = typeof query.syncBatchId === 'object' ? query.syncBatchId._id || query.syncBatchId.id : query.syncBatchId;
    }

    if (query.shopifyOrderId || query.ecommerceId) {
      where.shopifyOrderId = query.shopifyOrderId || query.ecommerceId;
    }

    // Handle $in operator for ecommerceId
    if (query.ecommerceId && typeof query.ecommerceId === 'object' && query.ecommerceId.$in) {
      where.shopifyOrderId = { in: query.ecommerceId.$in };
    }

    if (query.process) {
      where.process = query.process;
    }

    if (query.isCancelled !== undefined) {
      where.isCancelled = query.isCancelled;
    }

    if (query.traceId) {
      where.traceId = query.traceId;
    }

    return where;
  }

  /**
   * Normalize MongoDB format to Prisma format
   */
  _normalizeFromMongoFormat(data) {
    const normalized = {
      shopifyOrderId: data.ecommerceId || data.shopifyOrderId,
      orderData: data.orderData || null,
      reason: data.reason || null,
      process: data.process,
      isCancelled: data.isCancelled ?? false,
      traceId: data.traceId,
    };

    if (data.tenant) {
      normalized.tenantId = typeof data.tenant === 'object' ? data.tenant._id || data.tenant.id : data.tenant;
    }

    if (data.syncBatchId) {
      normalized.syncBatchId = typeof data.syncBatchId === 'object' ? data.syncBatchId._id || data.syncBatchId.id : data.syncBatchId;
    }

    return normalized;
  }

  /**
   * Transform Prisma format to MongoDB-like format
   */
  _transformToMongoFormat(order) {
    return {
      _id: order.id,
      id: order.id,
      shopifyOrderId: order.shopifyOrderId,
      ecommerceId: order.shopifyOrderId, // For backward compatibility
      orderData: order.orderData,
      reason: order.reason,
      process: order.process,
      isCancelled: order.isCancelled,
      tenant: order.tenant ? {
        _id: order.tenant.id,
        id: order.tenant.id,
      } : order.tenantId,
      syncBatchId: order.syncBatch ? order.syncBatch.id : (order.syncBatchId || ''),
      traceId: order.traceId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}

// Export singleton instance
export default new FailedOrderModel();

