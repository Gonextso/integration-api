import mongoose from 'mongoose';
import LogHelper from '../../helpers/LogHelper.js';
import FailedOrder from '../../models/db/FailedOrder.js';
import OrderSyncBatch from '../../models/db/OrderSyncBatch.js';
import Tenant from '../../models/db/Tenant.js';
import SuccessOrder from '../../models/db/SuccessOrder.js';
import RequestLog from '../../models/db/RequestLog.js';
import SyncedBarcode from '../../models/db/SyncedBarcode.js';

const logger = new LogHelper();

logger.info2('Building mongoose started');

// MongoDB connection is optional - only needed for migration
// Application will continue to work even if MongoDB connection fails
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(async () => {
            logger.info4('MongoDB Connected');

            try {
                await FailedOrder.syncIndexes();
                await OrderSyncBatch.syncIndexes();
                await Tenant.syncIndexes();
                await SuccessOrder.syncIndexes();
                await RequestLog.syncIndexes();
                await SyncedBarcode.syncIndexes();
            } catch (indexError) {
                logger.warn(`MongoDB index sync warning: ${indexError.message}`);
            }
        })
        .catch(err => {
            logger.warn(`MongoDB connection failed (optional - only needed for migration): ${err.message}`);
            logger.warn('Application will continue without MongoDB connection');
        });
} else {
    logger.warn('MONGO_URI not set - MongoDB connection skipped (optional - only needed for migration)');
}