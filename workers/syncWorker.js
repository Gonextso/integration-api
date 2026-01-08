import '../builders/envBuilder.js';
import '../builders/cache/redisBuilder.js';
import SyncQueue from '../queue/SyncQueue.js';
import { processOrderJob } from '../queue/workers/OrderSyncWorker.js';
import { processProductJob } from '../queue/workers/ProductSyncWorker.js';
import LogHelper from '../helpers/LogHelper.js';

const logger = new LogHelper();

logger.info2('Starting sync worker process...');

// Create queue instance
const syncQueue = new SyncQueue();

// Initialize workers
logger.info2('Initializing workers...');
const { orderWorker, productWorker } = syncQueue.initializeWorkers(
    processOrderJob,
    processProductJob
);

logger.info4('Sync workers initialized');

// Setup error handlers for order worker
orderWorker.on('ready', async () => {
    logger.info4('Order worker is ready to process jobs');
    console.log('[Worker] Order worker ready');
    
    // Check queue status when worker becomes ready
    try {
        const status = await syncQueue.getQueueStatus('order');
        console.log('[Worker] Order queue status when worker ready:', status);
    } catch (err) {
        console.error('[Worker] Error checking order queue status:', err);
    }
});

orderWorker.on('active', (job) => {
    logger.info4(`Order job ${job.id} is now active`);
    console.log(`[Worker] Order job ${job.id} is now active`);
});

orderWorker.on('completed', (job, result) => {
    logger.info4(`Order job ${job.id} completed`);
    console.log(`[Worker] Order job ${job.id} completed:`, result);
});

orderWorker.on('failed', (job, err) => {
    logger.error(new Error(`Order job ${job?.id || 'unknown'} failed: ${err?.message || err}`));
    console.error(`[Worker] Order job ${job?.id || 'unknown'} failed:`, err);
});

orderWorker.on('error', (err) => {
    logger.error(new Error(`Order worker error: ${err.message}`));
    console.error('[Worker] Order worker error:', err);
});

orderWorker.on('stalled', (jobId) => {
    console.log(`[Worker] Order job ${jobId} stalled`);
});

// Setup error handlers for product worker
productWorker.on('ready', async () => {
    logger.info4('Product worker is ready to process jobs');
    console.log('[Worker] Product worker ready');
    
    // Check queue status when worker becomes ready
    try {
        const status = await syncQueue.getQueueStatus('product');
        console.log('[Worker] Product queue status when worker ready:', status);
    } catch (err) {
        console.error('[Worker] Error checking product queue status:', err);
    }
});

productWorker.on('active', (job) => {
    logger.info4(`Product job ${job.id} is now active`);
    console.log(`[Worker] Product job ${job.id} (jobId: ${job.opts?.jobId || 'N/A'}) is now active`);
});

productWorker.on('completed', (job, result) => {
    logger.info4(`Product job ${job.id} completed`);
    console.log(`[Worker] Product job ${job.id} (jobId: ${job.opts?.jobId || 'N/A'}) completed:`, result);
});

productWorker.on('failed', (job, err) => {
    logger.error(new Error(`Product job ${job?.id || 'unknown'} failed: ${err?.message || err}`));
    console.error(`[Worker] Product job ${job?.id || 'unknown'} (jobId: ${job?.opts?.jobId || 'N/A'}) failed:`, err);
});

productWorker.on('error', (err) => {
    logger.error(new Error(`Product worker error: ${err.message}`));
    console.error('[Worker] Product worker error:', err);
});

productWorker.on('stalled', (jobId) => {
    console.log(`[Worker] Product job ${jobId} stalled`);
});

productWorker.on('drained', () => {
    console.log('[Worker] Product worker queue drained (no more jobs to process)');
});

// Periodically log queue status
setInterval(async () => {
    try {
        const orderStatus = await syncQueue.getQueueStatus('order');
        const productStatus = await syncQueue.getQueueStatus('product');
        if (orderStatus.waiting > 0 || orderStatus.active > 0 || productStatus.waiting > 0 || productStatus.active > 0) {
            console.log('[Worker] Queue status check:', {
                order: orderStatus,
                product: productStatus,
            });
        }
    } catch (err) {
        console.error('[Worker] Error checking queue status:', err);
    }
}, 30000); // Every 30 seconds

// Graceful shutdown
const shutdown = async (signal) => {
    logger.info2(`Received ${signal}, shutting down gracefully...`);
    
    try {
        // Close workers
        await orderWorker.close();
        await productWorker.close();
        await syncQueue.close();
        
        logger.info2('Workers closed successfully');
        process.exit(0);
    } catch (error) {
        logger.error(new Error(`Error during shutdown: ${error.message}`));
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
    logger.error(new Error(`Unhandled Rejection at: ${promise}, reason: ${reason}`));
});

process.on('uncaughtException', (error) => {
    logger.error(new Error(`Uncaught Exception: ${error.message}`));
    process.exit(1);
});

logger.info4('Sync worker process started and ready to process jobs');

