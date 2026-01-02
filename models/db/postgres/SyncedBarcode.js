import prisma from '../../../builders/database/prismaBuilder.js';

class SyncedBarcodeModel {
  /**
   * Find synced barcodes by query
   */
  async find(query = {}) {
    try {
      const where = this._buildWhereClause(query);
      const barcodes = await prisma.syncedBarcode.findMany({
        where,
        include: {
          tenant: true,
        },
        orderBy: {
          syncedAt: 'desc',
        },
      });

      return barcodes.map(b => this._transformToMongoFormat(b));
    } catch (error) {
      // P2021: Table does not exist - return empty array instead of crashing
      if (error.code === 'P2021') {
        console.warn(`[SyncedBarcode] Table does not exist: ${error.meta?.table || 'unknown'}. Returning empty array.`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Find one synced barcode
   */
  async findOne(query) {
    try {
      const where = this._buildWhereClause(query);
      const barcode = await prisma.syncedBarcode.findFirst({
        where,
        include: {
          tenant: true,
        },
      });

      if (!barcode) return null;

      return this._transformToMongoFormat(barcode);
    } catch (error) {
      // P2021: Table does not exist - return null instead of crashing
      if (error.code === 'P2021') {
        console.warn(`[SyncedBarcode] Table does not exist: ${error.meta?.table || 'unknown'}. Returning null.`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Create synced barcode
   */
  async create(data) {
    const normalized = this._normalizeFromMongoFormat(data);
    
    try {
      const barcode = await prisma.syncedBarcode.create({
        data: normalized,
        include: {
          tenant: true,
        },
      });

      return this._transformToMongoFormat(barcode);
    } catch (error) {
      // P2021: Table does not exist - return null instead of crashing
      if (error.code === 'P2021') {
        console.warn(`[SyncedBarcode] Table does not exist: ${error.meta?.table || 'unknown'}. Returning null for create.`);
        return null;
      }
      // Handle unique constraint violation (duplicate barcode)
      if (error.code === 'P2002') {
        // Try to find existing barcode
        const existing = await prisma.syncedBarcode.findFirst({
          where: {
            barcode: normalized.barcode,
            tenantId: normalized.tenantId,
          },
        });
        if (existing) {
          return this._transformToMongoFormat(existing);
        }
      }
      throw error;
    }
  }

  /**
   * Update one synced barcode (with optional upsert support)
   */
  async updateOne(query, update, options = {}) {
    try {
      const where = this._buildWhereClause(query);
      const normalized = this._normalizeFromMongoFormat(update);
      
      // Handle $set operator in update
      if (update.$set) {
        Object.assign(normalized, this._normalizeFromMongoFormat(update.$set));
      }
      
      if (options.upsert) {
        // Use Prisma upsert
        const barcode = await prisma.syncedBarcode.upsert({
          where: where.id ? { id: where.id } : {
            barcode_tenantId: {
              barcode: where.barcode,
              tenantId: where.tenantId,
            },
          },
          update: normalized,
          create: {
            ...normalized,
            ...where,
          },
          include: {
            tenant: true,
          },
        });
        return this._transformToMongoFormat(barcode);
      } else {
        // Regular update
        const barcode = await prisma.syncedBarcode.update({
          where,
          data: normalized,
          include: {
            tenant: true,
          },
        });
        return this._transformToMongoFormat(barcode);
      }
    } catch (error) {
      // P2021: Table does not exist - return null instead of crashing
      if (error.code === 'P2021') {
        console.warn(`[SyncedBarcode] Table does not exist: ${error.meta?.table || 'unknown'}. Returning null for updateOne.`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete many synced barcodes
   */
  async deleteMany(query) {
    try {
      const where = this._buildWhereClause(query);
      const result = await prisma.syncedBarcode.deleteMany({
        where,
      });

      return { acknowledged: true, deletedCount: result.count };
    } catch (error) {
      // P2021: Table does not exist - return empty result instead of crashing
      if (error.code === 'P2021') {
        console.warn(`[SyncedBarcode] Table does not exist: ${error.meta?.table || 'unknown'}. Returning empty result for deleteMany.`);
        return { acknowledged: true, deletedCount: 0 };
      }
      throw error;
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

    if (query.barcode) {
      // Handle $in operator
      if (typeof query.barcode === 'object' && query.barcode.$in) {
        where.barcode = { in: query.barcode.$in };
      } else {
        where.barcode = query.barcode;
      }
    }

    if (query.productId) {
      where.productId = query.productId;
    }

    if (query.variantId) {
      where.variantId = query.variantId;
    }

    return where;
  }

  /**
   * Normalize MongoDB format to Prisma format
   */
  _normalizeFromMongoFormat(data) {
    const normalized = {
      barcode: data.barcode,
      productId: data.productId || null,
      variantId: data.variantId || null,
    };

    if (data.tenant) {
      normalized.tenantId = typeof data.tenant === 'object' ? data.tenant._id || data.tenant.id : data.tenant;
    }

    return normalized;
  }

  /**
   * Transform Prisma format to MongoDB-like format
   */
  _transformToMongoFormat(barcode) {
    return {
      _id: barcode.id,
      id: barcode.id,
      barcode: barcode.barcode,
      productId: barcode.productId,
      variantId: barcode.variantId,
      tenant: barcode.tenant ? {
        _id: barcode.tenant.id,
        id: barcode.tenant.id,
      } : barcode.tenantId,
      syncedAt: barcode.syncedAt,
    };
  }
}

// Export singleton instance
export default new SyncedBarcodeModel();

