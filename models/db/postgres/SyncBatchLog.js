import prisma from '../../../builders/database/prismaBuilder.js';

class SyncBatchLogModel {
  /**
   * Log a step for a given sync batch
   * @param {object} data
   * @param {string} data.syncBatchId
   * @param {'INFO'|'WARN'|'ERROR'} data.level
   * @param {string} [data.step]   - e.g. 'FETCH_STATUS', 'UPDATE_FULFILLMENT', 'CREATE_ORDER'
   * @param {string} data.message
   * @param {object} [data.data]   - arbitrary JSON payload
   */
  async create(data) {
    const log = await prisma.syncBatchLog.create({
      data: {
        syncBatchId: data.syncBatchId,
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
  async findByBatchId(syncBatchId) {
    return prisma.syncBatchLog.findMany({
      where: { syncBatchId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Delete all logs for a batch (used by housekeeping)
   */
  async deleteByBatchId(syncBatchId) {
    return prisma.syncBatchLog.deleteMany({ where: { syncBatchId } });
  }
}

export default new SyncBatchLogModel();
