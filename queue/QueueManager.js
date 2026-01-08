import SyncQueue from './SyncQueue.js';

export default class QueueManager {
    constructor() {
        this.syncQueue = new SyncQueue();
    }

    /**
     * Get queue status for both order and product queues
     */
    async getQueueStatus() {
        const [orderStatus, productStatus] = await Promise.all([
            this.syncQueue.getQueueStatus('order'),
            this.syncQueue.getQueueStatus('product'),
        ]);

        return {
            order: orderStatus,
            product: productStatus,
        };
    }

    /**
     * Retry failed jobs
     * @param {string} queueName - 'order' or 'product'
     * @param {string[]} jobIds - Optional array of job IDs to retry. If not provided, retries all failed jobs
     */
    async retryFailedJobs(queueName, jobIds = null) {
        return await this.syncQueue.retryFailedJobs(queueName, jobIds);
    }

    /**
     * Get failed jobs
     * @param {string} queueName - 'order' or 'product'
     */
    async getFailedJobs(queueName) {
        const queue = queueName === 'order' 
            ? this.syncQueue.orderQueue 
            : this.syncQueue.productQueue;

        const failed = await queue.getFailed();
        return failed.map(job => ({
            id: job.id,
            name: job.name,
            data: job.data,
            failedReason: job.failedReason,
            attemptsMade: job.attemptsMade,
            timestamp: job.timestamp,
        }));
    }

    /**
     * Get active jobs
     * @param {string} queueName - 'order' or 'product'
     */
    async getActiveJobs(queueName) {
        const queue = queueName === 'order' 
            ? this.syncQueue.orderQueue 
            : this.syncQueue.productQueue;

        const active = await queue.getActive();
        return active.map(job => ({
            id: job.id,
            name: job.name,
            data: job.data,
            progress: job.progress,
            timestamp: job.timestamp,
        }));
    }

    /**
     * Get waiting jobs
     * @param {string} queueName - 'order' or 'product'
     */
    async getWaitingJobs(queueName) {
        const queue = queueName === 'order' 
            ? this.syncQueue.orderQueue 
            : this.syncQueue.productQueue;

        const waiting = await queue.getWaiting();
        return waiting.map(job => ({
            id: job.id,
            name: job.name,
            data: job.data,
            timestamp: job.timestamp,
        }));
    }

    /**
     * Remove a job from queue
     * @param {string} queueName - 'order' or 'product'
     * @param {string} jobId - Job ID to remove
     */
    async removeJob(queueName, jobId) {
        const queue = queueName === 'order' 
            ? this.syncQueue.orderQueue 
            : this.syncQueue.productQueue;

        const job = await queue.getJob(jobId);
        if (job) {
            await job.remove();
            return true;
        }
        return false;
    }

    /**
     * Clean queue (remove completed/failed jobs)
     * @param {string} queueName - 'order' or 'product'
     * @param {object} options - Clean options
     */
    async cleanQueue(queueName, options = {}) {
        const queue = queueName === 'order' 
            ? this.syncQueue.orderQueue 
            : this.syncQueue.productQueue;

        const {
            grace = 1000,
            limit = 1000,
            status = 'completed',
        } = options;

        return await queue.clean(grace, limit, status);
    }

    /**
     * Close queue connections
     */
    async close() {
        await this.syncQueue.close();
    }
}

