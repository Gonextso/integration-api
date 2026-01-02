import mongoose from 'mongoose';
import { PrismaClient } from '@prisma/client';
import LogHelper from '../helpers/LogHelper.js';

// MongoDB Models
import FailedOrderMongo from '../models/db/FailedOrder.js';
import SuccessOrderMongo from '../models/db/SuccessOrder.js';
import OrderSyncBatchMongo from '../models/db/OrderSyncBatch.js';
import RequestLogMongo from '../models/db/RequestLog.js';
import ProductSyncedBatchMongo from '../models/db/ProductSyncedBatch.js';
import SyncedBarcodeMongo from '../models/db/SyncedBarcode.js';
import TenantMongo from '../models/db/Tenant.js';

// PostgreSQL Models (wrappers)
import FailedOrderPostgres from '../models/db/postgres/FailedOrder.js';
import SuccessOrderPostgres from '../models/db/postgres/SuccessOrder.js';
import OrderSyncBatchPostgres from '../models/db/postgres/OrderSyncBatch.js';
import RequestLogPostgres from '../models/db/postgres/RequestLog.js';
import ProductSyncedBatchPostgres from '../models/db/postgres/ProductSyncedBatch.js';
import SyncedBarcodePostgres from '../models/db/postgres/SyncedBarcode.js';

const prisma = new PrismaClient();
const logger = new LogHelper();

// Tenant ID mapping (MongoDB _id -> PostgreSQL UUID)
const tenantIdMap = new Map();

/**
 * Migrate tenants (get mapping from config-api or create if needed)
 */
async function migrateTenants() {
  logger.info2('Starting tenant ID mapping...');
  
  const tenants = await TenantMongo.find({});
  logger.info2(`Found ${tenants.length} tenants to map`);

  for (const tenant of tenants) {
    try {
      // Try to find existing tenant in PostgreSQL by shopify.shopId
      const existingTenant = await prisma.tenantInfo.findFirst({
        where: {
          shopify: {
            shopId: tenant.shopify?.shopId ? String(tenant.shopify.shopId) : undefined,
          },
        },
      });

      if (existingTenant) {
        tenantIdMap.set(tenant._id.toString(), existingTenant.id);
        logger.info2(`Mapped tenant: ${tenant.name} (${tenant._id} -> ${existingTenant.id})`);
      } else {
        logger.warn(`Tenant ${tenant.name} not found in PostgreSQL. Skipping related records.`);
      }
    } catch (error) {
      logger.error(`Error mapping tenant ${tenant.name}: ${error.message}`);
    }
  }
}

/**
 * Migrate order sync batches
 */
async function migrateSyncBatches() {
  logger.info2('Starting order sync batch migration...');
  
  const batches = await OrderSyncBatchMongo.find({});
  logger.info2(`Found ${batches.length} batches to migrate`);

  const batchIdMap = new Map();
  let migrated = 0;

  for (const batch of batches) {
    try {
      const tenantId = tenantIdMap.get(batch.tenant.toString());
      if (!tenantId) {
        logger.warn(`Skipping batch ${batch._id} - tenant not found`);
        continue;
      }

      const batchData = {
        tenant: tenantId,
        process: batch.process,
        requestStartDate: batch.request?.startDate || null,
        requestEndDate: batch.request?.endDate || null,
        requestOrderNumberList: batch.request?.orderNumberList || [],
        total: batch.numbers?.total || null,
        createOrderTotal: batch.numbers?.createOrderTotal || null,
        createOrderSuccess: batch.numbers?.createOrderSuccess || null,
        createOrderError: batch.numbers?.createOrderError || null,
        createOrderSkippedTotal: batch.numbers?.createOrderSkippedTotal || null,
        createOrderSkippedAlreadySynced: batch.numbers?.createOrderSkippedAlreadySynced || null,
        createOrderSkippedFailed: batch.numbers?.createOrderSkippedFailed || null,
        cancelOrderTotal: batch.numbers?.cancelOrderTotal || null,
        cancelOrderSuccess: batch.numbers?.cancelOrderSuccess || null,
        cancelOrderError: batch.numbers?.cancelOrderError || null,
        cancelOrderSkippedTotal: batch.numbers?.cancelOrderSkippedTotal || null,
        cancelOrderSkippedAlreadySynced: batch.numbers?.cancelOrderSkippedAlreadySynced || null,
        cancelOrderSkippedFailed: batch.numbers?.cancelOrderSkippedFailed || null,
        cancelOrderSkippedNotFound: batch.numbers?.cancelOrderSkippedNotFound || null,
        isErrorLogExistsForBatch: batch.isErrorLogExistsForThisBatch || false,
        traceId: batch.traceId,
      };

      const created = await OrderSyncBatchPostgres.create(batchData);
      batchIdMap.set(batch._id.toString(), created.id);
      migrated++;
    } catch (error) {
      logger.error(`Error migrating batch ${batch._id}: ${error.message}`);
    }
  }

  logger.info2(`Order sync batch migration completed. Migrated ${migrated}/${batches.length} batches.`);
  return batchIdMap;
}

/**
 * Migrate failed orders
 */
async function migrateFailedOrders(batchIdMap) {
  logger.info2('Starting failed order migration...');
  
  const orders = await FailedOrderMongo.find({});
  logger.info2(`Found ${orders.length} failed orders to migrate`);

  let migrated = 0;

  for (const order of orders) {
    try {
      const tenantId = tenantIdMap.get(order.tenant.toString());
      if (!tenantId) {
        logger.warn(`Skipping failed order ${order._id} - tenant not found`);
        continue;
      }

      const syncBatchId = batchIdMap.get(order.syncBatchId?.toString());
      if (!syncBatchId) {
        logger.warn(`Skipping failed order ${order._id} - sync batch not found`);
        continue;
      }

      const orderData = {
        tenant: tenantId,
        syncBatchId: syncBatchId,
        shopifyOrderId: order.ecommerceId || order.shopifyOrderId,
        orderData: order.orderData || null,
        reason: order.reason || null,
        process: order.process,
        isCancelled: order.isCancelled || false,
        traceId: order.traceId,
      };

      await FailedOrderPostgres.create(orderData);
      migrated++;
    } catch (error) {
      logger.error(`Error migrating failed order ${order._id}: ${error.message}`);
    }
  }

  logger.info2(`Failed order migration completed. Migrated ${migrated}/${orders.length} orders.`);
}

/**
 * Migrate success orders
 */
async function migrateSuccessOrders(batchIdMap) {
  logger.info2('Starting success order migration...');
  
  const orders = await SuccessOrderMongo.find({});
  logger.info2(`Found ${orders.length} success orders to migrate`);

  let migrated = 0;

  for (const order of orders) {
    try {
      const tenantId = tenantIdMap.get(order.tenant.toString());
      if (!tenantId) {
        logger.warn(`Skipping success order ${order._id} - tenant not found`);
        continue;
      }

      const syncBatchId = batchIdMap.get(order.syncBatchId?.toString());
      if (!syncBatchId) {
        logger.warn(`Skipping success order ${order._id} - sync batch not found`);
        continue;
      }

      const orderData = {
        tenant: tenantId,
        syncBatchId: syncBatchId,
        nebimOrderId: order.erpId || order.nebimOrderId || null,
        shopifyOrderId: order.ecommerceId || order.shopifyOrderId || null,
        lines: order.lines || null,
        partiallyCancelledLines: order.partiallyCancelledLines || null,
        isCancelled: order.isCancelled || false,
        isShipped: order.isShipped || false,
        isPartiallyCancelled: order.isPartiallyCancelled || false,
        traceId: order.traceId,
        cleared: order.cleared || false,
      };

      await SuccessOrderPostgres.create(orderData);
      migrated++;
    } catch (error) {
      logger.error(`Error migrating success order ${order._id}: ${error.message}`);
    }
  }

  logger.info2(`Success order migration completed. Migrated ${migrated}/${orders.length} orders.`);
}

/**
 * Migrate request logs
 */
async function migrateRequestLogs() {
  logger.info2('Starting request log migration...');
  
  const logs = await RequestLogMongo.find({});
  logger.info2(`Found ${logs.length} request logs to migrate`);

  let migrated = 0;

  for (const log of logs) {
    try {
      const tenantId = tenantIdMap.get(log.tenant.toString());
      if (!tenantId) {
        logger.warn(`Skipping request log ${log._id} - tenant not found`);
        continue;
      }

      const logData = {
        tenant: tenantId,
        requestId: log.requestId || null,
        method: log.method || null,
        url: log.url || null,
        body: log.body || null,
        headers: log.headers || null,
        status: log.status || null,
        responseTime: log.responseTime || null,
        response: log.response || null,
        traceId: log.traceId,
        transactionId: log.transactionId || null,
        isError: log.isError || null,
      };

      await RequestLogPostgres.create(logData);
      migrated++;
    } catch (error) {
      logger.error(`Error migrating request log ${log._id}: ${error.message}`);
    }
  }

  logger.info2(`Request log migration completed. Migrated ${migrated}/${logs.length} logs.`);
}

/**
 * Migrate product synced batches
 */
async function migrateProductSyncedBatches() {
  logger.info2('Starting product synced batch migration...');
  
  const batches = await ProductSyncedBatchMongo.find({});
  logger.info2(`Found ${batches.length} product batches to migrate`);

  let migrated = 0;

  for (const batch of batches) {
    try {
      const tenantId = tenantIdMap.get(batch.tenant.toString());
      if (!tenantId) {
        logger.warn(`Skipping product batch ${batch._id} - tenant not found`);
        continue;
      }

      const batchData = {
        tenant: tenantId,
        process: batch.process,
        requestStartDate: batch.request?.startDate || null,
        requestEndDate: batch.request?.endDate || null,
        requestProductNumberList: batch.request?.productNumberList || [],
        total: batch.numbers?.total || null,
        createProductTotal: batch.numbers?.createProductTotal || null,
        createProductSuccess: batch.numbers?.createProductSuccess || null,
        createProductError: batch.numbers?.createProductError || null,
        createProductSkippedTotal: batch.numbers?.createProductSkippedTotal || null,
        createProductSkippedAlreadySynced: batch.numbers?.createProductSkippedAlreadySynced || null,
        createProductSkippedFailed: batch.numbers?.createProductSkippedFailed || null,
        isErrorLogExistsForBatch: batch.isErrorLogExistsForThisBatch || false,
        traceId: batch.traceId,
      };

      await ProductSyncedBatchPostgres.create(batchData);
      migrated++;
    } catch (error) {
      logger.error(`Error migrating product batch ${batch._id}: ${error.message}`);
    }
  }

  logger.info2(`Product synced batch migration completed. Migrated ${migrated}/${batches.length} batches.`);
}

/**
 * Migrate synced barcodes
 */
async function migrateSyncedBarcodes() {
  logger.info2('Starting synced barcode migration...');
  
  const barcodes = await SyncedBarcodeMongo.find({});
  logger.info2(`Found ${barcodes.length} barcodes to migrate`);

  let migrated = 0;
  let skipped = 0;

  for (const barcode of barcodes) {
    try {
      const tenantId = tenantIdMap.get(barcode.tenant.toString());
      if (!tenantId) {
        logger.warn(`Skipping barcode ${barcode._id} - tenant not found`);
        continue;
      }

      const barcodeData = {
        tenant: tenantId,
        barcode: barcode.barcode,
        productId: barcode.productId || null,
        variantId: barcode.variantId || null,
      };

      try {
        await SyncedBarcodePostgres.create(barcodeData);
        migrated++;
      } catch (error) {
        // Handle unique constraint violation (duplicate barcode)
        if (error.code === 'P2002') {
          skipped++;
          logger.warn(`Skipping duplicate barcode: ${barcode.barcode} for tenant ${tenantId}`);
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error(`Error migrating barcode ${barcode._id}: ${error.message}`);
    }
  }

  logger.info2(`Synced barcode migration completed. Migrated ${migrated}/${barcodes.length} barcodes (${skipped} duplicates skipped).`);
}

/**
 * Main migration function
 */
async function migrate() {
  try {
    logger.info2('Starting MongoDB to PostgreSQL migration for integration-api...');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    logger.info4('Connected to MongoDB');

    // Migrate in order (due to foreign key dependencies)
    await migrateTenants();
    const batchIdMap = await migrateSyncBatches();
    await migrateFailedOrders(batchIdMap);
    await migrateSuccessOrders(batchIdMap);
    await migrateRequestLogs();
    await migrateProductSyncedBatches();
    await migrateSyncedBarcodes();

    logger.info4('Migration completed successfully!');
    
    // Close connections
    await mongoose.disconnect();
    await prisma.$disconnect();
    
    process.exit(0);
  } catch (error) {
    logger.error(`Migration failed: ${error.message}`);
    console.error(error);
    await mongoose.disconnect();
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Run migration if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}

