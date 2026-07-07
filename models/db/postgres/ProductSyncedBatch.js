import prisma from '../../../builders/database/prismaBuilder.js';
import SystemCodes from '../../../enums/SystemCodes.js';

class ProductSyncedBatchModel {
  /**
   * Find product sync batches by query
   */
  async find(query = {}) {
    const where = this._buildWhereClause(query);
    const batches = await prisma.productSyncedBatch.findMany({
      where,
      include: {
        tenant: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return batches.map(b => this._transformToMongoFormat(b));
  }

  /**
   * Find one product sync batch
   */
  async findOne(query) {
    const where = this._buildWhereClause(query);
    const batch = await prisma.productSyncedBatch.findFirst({
      where,
      include: {
        tenant: true,
      },
    });

    if (!batch) return null;

    return this._transformToMongoFormat(batch);
  }

  /**
   * Create product sync batch
   */
  async create(data) {
    const normalized = this._normalizeFromMongoFormat(data);

    // Because we include the tenant relation, Prisma requires the relation form
    // instead of the scalar tenantId. Convert it to a connect.
    const createData = { ...normalized };
    if (normalized.tenantId) {
      createData.tenant = {
        connect: { id: normalized.tenantId },
      };
      delete createData.tenantId;
    }

    const batch = await prisma.productSyncedBatch.create({
      data: createData,
      include: {
        tenant: true,
      },
    });

    return this._transformToMongoFormat(batch);
  }

  /**
   * Update a product sync batch by id (used to finalize counters at the end of a run)
   */
  async update(query, data) {
    const where = this._buildWhereClause(query);
    const normalized = this._normalizeFromMongoFormat(data);

    // Only persist fields that were explicitly provided to avoid clobbering with nulls.
    const updateData = {};
    if (data.numbers) {
      if (data.numbers.total !== undefined) updateData.total = data.numbers.total;
      if (data.numbers.createProductTotal !== undefined) updateData.createProductTotal = data.numbers.createProductTotal;
      if (data.numbers.createProductSuccess !== undefined) updateData.createProductSuccess = data.numbers.createProductSuccess;
      if (data.numbers.createProductError !== undefined) updateData.createProductError = data.numbers.createProductError;
      if (data.numbers.createProductSkippedTotal !== undefined) updateData.createProductSkippedTotal = data.numbers.createProductSkippedTotal;
      if (data.numbers.createProductSkippedAlreadySynced !== undefined) updateData.createProductSkippedAlreadySynced = data.numbers.createProductSkippedAlreadySynced;
      if (data.numbers.createProductSkippedFailed !== undefined) updateData.createProductSkippedFailed = data.numbers.createProductSkippedFailed;
    }
    if (data.isErrorLogExistsForThisBatch !== undefined) {
      updateData.isErrorLogExistsForBatch = data.isErrorLogExistsForThisBatch;
    }
    if (data.request?.startDate !== undefined) updateData.requestStartDate = normalized.requestStartDate;
    if (data.request?.endDate !== undefined) updateData.requestEndDate = normalized.requestEndDate;

    const batch = await prisma.productSyncedBatch.update({
      where: { id: where.id },
      data: updateData,
      include: { tenant: true },
    });

    return this._transformToMongoFormat(batch);
  }

  /**
   * Delete many product sync batches
   */
  async deleteMany(query) {
    const where = this._buildWhereClause(query);
    const result = await prisma.productSyncedBatch.deleteMany({
      where,
    });

    return { acknowledged: true, deletedCount: result.count };
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

    if (query.process) {
      where.process = query.process;
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
      process: data.process,
      requestStartDate: data.request?.startDate || null,
      requestEndDate: data.request?.endDate || null,
      requestProductNumberList: data.request?.productNumberList || [],
      total: data.numbers?.total || null,
      createProductTotal: data.numbers?.createProductTotal || null,
      createProductSuccess: data.numbers?.createProductSuccess || null,
      createProductError: data.numbers?.createProductError || null,
      createProductSkippedTotal: data.numbers?.createProductSkippedTotal || null,
      createProductSkippedAlreadySynced: data.numbers?.createProductSkippedAlreadySynced || null,
      createProductSkippedFailed: data.numbers?.createProductSkippedFailed || null,
      isErrorLogExistsForBatch: data.isErrorLogExistsForThisBatch || null,
      traceId: data.traceId,
    };

    if (data.tenant) {
      normalized.tenantId = typeof data.tenant === 'object' ? data.tenant._id || data.tenant.id : data.tenant;
    }

    return normalized;
  }

  /**
   * Transform Prisma format to MongoDB-like format
   */
  _transformToMongoFormat(batch) {
    return {
      _id: batch.id,
      id: batch.id,
      request: {
        startDate: batch.requestStartDate,
        endDate: batch.requestEndDate,
        productNumberList: batch.requestProductNumberList,
      },
      numbers: {
        total: batch.total,
        createProductTotal: batch.createProductTotal,
        createProductSuccess: batch.createProductSuccess,
        createProductError: batch.createProductError,
        createProductSkippedTotal: batch.createProductSkippedTotal,
        createProductSkippedAlreadySynced: batch.createProductSkippedAlreadySynced,
        createProductSkippedFailed: batch.createProductSkippedFailed,
      },
      isErrorLogExistsForThisBatch: batch.isErrorLogExistsForBatch,
      process: batch.process,
      tenant: batch.tenant ? {
        _id: batch.tenant.id,
        id: batch.tenant.id,
      } : batch.tenantId,
      traceId: batch.traceId,
      createdAt: batch.createdAt,
    };
  }
}

// Export singleton instance
export default new ProductSyncedBatchModel();

