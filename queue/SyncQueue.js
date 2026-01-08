import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import CacheDatabases from '../enums/CacheDatabases.js';

export default class SyncQueue {
    constructor() {
        // Create Redis connection for BullMQ (using SystemCache DB - DB 0)
        // Parse REDIS_URI and ensure we use the correct database
        let redisOptions = {
            db: CacheDatabases.DB_NAMES.SystemCache,
            maxRetriesPerRequest: null,
        };

        if (process.env.REDIS_URI) {
            // If REDIS_URI is a full URL, parse it
            if (process.env.REDIS_URI.includes('://')) {
                try {
                    const url = new URL(process.env.REDIS_URI);
                    redisOptions.host = url.hostname;
                    redisOptions.port = parseInt(url.port) || 6379;
                    if (url.password) {
                        redisOptions.password = decodeURIComponent(url.password);
                    }
                    // Override database from URL if specified, otherwise use SystemCache
                    if (url.pathname && url.pathname.length > 1) {
                        const dbFromUrl = parseInt(url.pathname.substring(1));
                        if (!isNaN(dbFromUrl)) {
                            redisOptions.db = dbFromUrl;
                        }
                    }
                } catch (e) {
                    // If URL parsing fails, use REDIS_URI as host
                    redisOptions.host = process.env.REDIS_URI;
                }
            } else {
                // If REDIS_URI is just a host, use it as host
                redisOptions.host = process.env.REDIS_URI;
            }
        }

        // Always use SystemCache DB (DB 0) for queues, override any URL database
        redisOptions.db = CacheDatabases.DB_NAMES.SystemCache;

        this.connection = new Redis(redisOptions);
        
        // Log connection details for verification
        console.log('[Queue] Creating Redis connection for BullMQ:', {
            host: redisOptions.host || 'localhost',
            port: redisOptions.port || 6379,
            db: redisOptions.db,
            queueNames: ['order-sync', 'product-sync'],
        });
        
        // Add connection event listeners
        this.connection.on('connect', () => {
            console.log(`[Queue] Redis connected to DB ${redisOptions.db} (host: ${redisOptions.host || 'localhost'}, port: ${redisOptions.port || 6379})`);
        });
        
        this.connection.on('ready', () => {
            console.log(`[Queue] Redis ready on DB ${redisOptions.db} (host: ${redisOptions.host || 'localhost'}, port: ${redisOptions.port || 6379})`);
            
            // Verify connection details
            const actualOptions = this.connection.options;
            console.log('[Queue] Verified Redis connection details:', {
                host: actualOptions.host,
                port: actualOptions.port,
                db: actualOptions.db,
                status: this.connection.status,
            });
        });
        
        this.connection.on('error', (err) => {
            console.error('[Queue] Redis error:', err);
        });

        // Order Sync Queue
        this.orderQueue = new Queue('order-sync', { 
            connection: this.connection,
            defaultJobOptions: {
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 500 },
                attempts: 5,
                backoff: {
                    type: 'exponential',
                    delay: 2000, // 2s, 4s, 8s, 16s, 32s
                },
            },
        });

        // Product Sync Queue
        this.productQueue = new Queue('product-sync', { 
            connection: this.connection,
            defaultJobOptions: {
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 500 },
                attempts: 5,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
            },
        });

        // Workers will be initialized separately
        this.orderWorker = null;
        this.productWorker = null;
    }

    /**
     * Initialize workers (called from worker process)
     */
    initializeWorkers(orderProcessor, productProcessor) {
        console.log('[Queue] Initializing workers with connection:', {
            host: this.connection.options.host,
            port: this.connection.options.port,
            db: this.connection.options.db,
            queueName: 'order-sync, product-sync',
        });

        // Order Sync Worker
        this.orderWorker = new Worker('order-sync', async (job) => {
            try {
                console.log(`[Worker] [Queue] Processing order job ${job.id} (jobId: ${job.opts?.jobId || 'N/A'})`, JSON.stringify(job.data));
                const result = await orderProcessor(job);
                console.log(`[Worker] [Queue] Order job ${job.id} completed with result:`, result?.ok ? 'success' : 'failed');
                return result;
            } catch (error) {
                console.error(`[Worker] [Queue] Order job ${job.id} threw error:`, error);
                throw error;
            }
        }, {
            connection: this.connection,
            concurrency: 1, // Process one order at a time
        });

        // Product Sync Worker
        this.productWorker = new Worker('product-sync', async (job) => {
            try {
                console.log(`[Worker] [Queue] Processing product job ${job.id} (jobId: ${job.opts?.jobId || 'N/A'})`, JSON.stringify(job.data));
                const result = await productProcessor(job);
                console.log(`[Worker] [Queue] Product job ${job.id} completed with result:`, result?.ok ? 'success' : 'failed');
                return result;
            } catch (error) {
                console.error(`[Worker] [Queue] Product job ${job.id} threw error:`, error);
                throw error;
            }
        }, {
            connection: this.connection,
            concurrency: 2, // Process 2 products in parallel
        });

        // Setup event listeners
        this.setupEventListeners();

        // Log initial queue status after connection is ready
        this.connection.once('ready', async () => {
            try {
                console.log('[Queue] Redis connection ready, checking initial queue status...');
                const orderStatus = await this.getQueueStatus('order');
                const productStatus = await this.getQueueStatus('product');
                console.log('[Queue] Initial queue status:', {
                    order: orderStatus,
                    product: productStatus,
                });
            } catch (err) {
                console.error('[Queue] Error getting initial queue status:', err);
            }
        });

        // Also log queue status after a short delay (fallback)
        setTimeout(async () => {
            try {
                const orderStatus = await this.getQueueStatus('order');
                const productStatus = await this.getQueueStatus('product');
                if (orderStatus.waiting > 0 || orderStatus.active > 0 || productStatus.waiting > 0 || productStatus.active > 0) {
                    console.log('[Queue] Queue status check (2s delay):', {
                        order: orderStatus,
                        product: productStatus,
                    });
                }
            } catch (err) {
                console.error('[Queue] Error getting queue status:', err);
            }
        }, 2000);

        return {
            orderWorker: this.orderWorker,
            productWorker: this.productWorker,
        };
    }

    setupEventListeners() {
        // Order queue events
        const orderEvents = new QueueEvents('order-sync', { connection: this.connection });
        
        orderEvents.on('completed', ({ jobId }) => {
            console.log(`[Queue] [Events] Order job ${jobId} completed`);
        });
        
        orderEvents.on('failed', ({ jobId, failedReason }) => {
            console.error(`[Queue] [Events] Order job ${jobId} failed:`, failedReason);
        });

        orderEvents.on('active', ({ jobId }) => {
            console.log(`[Queue] [Events] Order job ${jobId} is now active`);
        });

        orderEvents.on('waiting', ({ jobId }) => {
            console.log(`[Queue] [Events] Order job ${jobId} is waiting to be processed`);
        });

        // Product queue events
        const productEvents = new QueueEvents('product-sync', { connection: this.connection });
        
        productEvents.on('completed', ({ jobId }) => {
            console.log(`[Queue] [Events] Product job ${jobId} completed`);
        });
        
        productEvents.on('failed', ({ jobId, failedReason }) => {
            console.error(`[Queue] [Events] Product job ${jobId} failed:`, failedReason);
        });

        productEvents.on('active', ({ jobId }) => {
            console.log(`[Queue] [Events] Product job ${jobId} is now active`);
        });

        productEvents.on('waiting', ({ jobId }) => {
            console.log(`[Queue] [Events] Product job ${jobId} is waiting to be processed`);
        });
    }

    /**
     * Add a single order job to queue
     * Only adds if job is not already in the queue
     */
    async addOrderJob(tenant, order, jobType = 'create', options = {}) {
        const jobId = `order-${jobType}-${order.order_id}-${tenant.id}`;
        
        // Check if job already exists in queue
        const exists = await this.isJobInQueue(this.orderQueue, jobId);
        if (exists) {
            return null; // Job already in queue
        }
        
        return await this.orderQueue.add(
            `order-${jobType}-${order.order_id}`,
            {
                tenantId: tenant.id,
                orderId: order.order_id,
                orderData: order,
                jobType,
            },
            {
                jobId,
                ...options,
            }
        );
    }

    /**
     * Add a single product job to queue
     * Only adds if job is not already in the queue
     */
    async addProductJob(tenant, product, options = {}) {
        const jobId = `product-${product.erp_id}-${tenant.id}`;
        
        // Check if job already exists in queue
        const exists = await this.isJobInQueue(this.productQueue, jobId);
        if (exists) {
            return null; // Job already in queue
        }
        
        return await this.productQueue.add(
            `product-${product.erp_id}`,
            {
                tenantId: tenant.id,
                productData: product,
            },
            {
                jobId,
                ...options,
            }
        );
    }

    /**
     * Check if a job exists in queue (waiting, active, or delayed)
     * Completed or failed jobs are NOT considered "in queue" and can be re-added
     */
    async isJobInQueue(queue, jobId) {
        try {
            const job = await queue.getJob(jobId);
            if (!job) {
                return false;
            }
            
            const state = await job.getState();
            // Only consider jobs that are actually waiting to be processed
            // Completed, failed, or paused jobs are not "in queue" and can be re-added
            const inQueueStates = ['waiting', 'active', 'delayed'];
            const isInQueue = inQueueStates.includes(state);
            
            // Debug log for troubleshooting
            if (state !== 'completed' && state !== 'failed') {
                console.log(`[Queue] Job ${jobId} state: ${state}, inQueue: ${isInQueue}`);
            }
            
            return isInQueue;
        } catch (error) {
            // If job doesn't exist or error getting state, it's not in queue
            console.log(`[Queue] Job ${jobId} check error or not found: ${error.message || 'not found'}`);
            return false;
        }
    }

    /**
     * Add multiple order jobs to queue (batch)
     * Only adds jobs that are not already in the queue
     */
    async addOrderBatch(tenant, orders, jobType = 'create', batchId = null) {
        const jobsToAdd = [];
        
        for (const order of orders) {
            const jobId = `order-${jobType}-${order.order_id}-${tenant.id}`;
            const exists = await this.isJobInQueue(this.orderQueue, jobId);
            
            if (!exists) {
                jobsToAdd.push({
                    name: `order-${jobType}-${order.order_id}`,
                    data: {
                        tenantId: tenant.id,
                        orderId: order.order_id,
                        orderData: order,
                        jobType,
                        ...(batchId ? { batchId } : {}),
                    },
                    opts: {
                        jobId,
                    },
                });
            }
        }

        if (jobsToAdd.length > 0) {
            return await this.orderQueue.addBulk(jobsToAdd);
        }
        
        return [];
    }

    /**
     * Add multiple product jobs to queue (batch)
     * Only adds jobs that are not already in the queue
     */
    async addProductBatch(tenant, products) {
        const jobsToAdd = [];
        let skippedCount = 0;
        
        console.log(`[Queue] Checking ${products.length} products for queue addition (tenant: ${tenant.id})`);
        
        for (const product of products) {
            const jobId = `product-${product.erp_id}-${tenant.id}`;
            const exists = await this.isJobInQueue(this.productQueue, jobId);
            
            if (!exists) {
                jobsToAdd.push({
                    name: `product-${product.erp_id}`,
                    data: {
                        tenantId: tenant.id,
                        productData: product,
                    },
                    opts: {
                        jobId,
                    },
                });
            } else {
                skippedCount++;
            }
        }

        if (jobsToAdd.length > 0) {
            console.log(`[Queue] Adding ${jobsToAdd.length} product jobs to queue (${skippedCount} skipped - already in queue)`);
            
            try {
                const result = await this.productQueue.addBulk(jobsToAdd);
                const addedCount = Array.isArray(result) ? result.filter(j => j !== null && j !== undefined).length : (result ? 1 : 0);
                
                console.log(`[Queue] Product jobs added successfully, result count: ${addedCount}`);
                
                // Verify jobs were actually added by checking queue status
                const status = await this.getQueueStatus('product');
                console.log(`[Queue] Queue status after adding: waiting=${status.waiting}, active=${status.active}, completed=${status.completed}, failed=${status.failed}`);
                
                return result;
            } catch (error) {
                console.error(`[Queue] Error adding product jobs to queue: ${error.message}`, error);
                throw error;
            }
        }
        
        console.log(`[Queue] No new product jobs to add (${skippedCount} already in queue)`);
        return [];
    }

    /**
     * Get queue status
     * Note: completed and failed counts include historical jobs (up to removeOnComplete/removeOnFail limits)
     */
    async getQueueStatus(queueName) {
        const queue = queueName === 'order' ? this.orderQueue : this.productQueue;
        
        const [waiting, active, completed, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
        ]);

        // Log queue status for debugging
        if (waiting > 0 || active > 0) {
            console.log(`[Queue] ${queueName} queue status: waiting=${waiting}, active=${active}, completed=${completed} (historical), failed=${failed} (historical)`);
        }

        return { waiting, active, completed, failed };
    }

    /**
     * Retry failed jobs
     */
    async retryFailedJobs(queueName, jobIds = null) {
        const queue = queueName === 'order' ? this.orderQueue : this.productQueue;

        if (jobIds) {
            // Retry specific jobs
            return await Promise.all(jobIds.map(id => queue.retryJob(id)));
        } else {
            // Retry all failed jobs
            const failed = await queue.getFailed();
            return await Promise.all(failed.map(job => job.retry()));
        }
    }

    /**
     * Close connections gracefully
     */
    async close() {
        if (this.orderWorker) {
            await this.orderWorker.close();
        }
        if (this.productWorker) {
            await this.productWorker.close();
        }
        await this.orderQueue.close();
        await this.productQueue.close();
        await this.connection.quit();
    }
}

