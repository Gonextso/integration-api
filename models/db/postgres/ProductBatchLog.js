import prisma from '../../../builders/database/prismaBuilder.js';

class ProductBatchLogModel {
  /**
   * Log a step for a given product sync batch
   * @param {object} data
   * @param {string} data.productSyncedBatchId
   * @param {'INFO'|'WARN'|'ERROR'} data.level
   * @param {string} [data.step]   - e.g. 'PLAN', 'FETCH_MARKETS', 'NEBIM_PRICES', 'WRITE_PRICES'
   * @param {string} data.message
   * @param {object} [data.data]   - arbitrary JSON payload (per currency/locale breakdown)
   */
  async create(data) {
    const log = await prisma.productBatchLog.create({
      data: {
        productSyncedBatchId: data.productSyncedBatchId,
        level: data.level ?? 'INFO',
        step: data.step ?? null,
        message: data.message,
        data: data.data ?? null,
      },
    });
    return log;
  }

  /**
   * Find all logs for a batch
   */
  async findByBatchId(productSyncedBatchId) {
    return prisma.productBatchLog.findMany({
      where: { productSyncedBatchId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Delete all logs for a batch (used by housekeeping)
   */
  async deleteByBatchId(productSyncedBatchId) {
    return prisma.productBatchLog.deleteMany({ where: { productSyncedBatchId } });
  }
}

export default new ProductBatchLogModel();
