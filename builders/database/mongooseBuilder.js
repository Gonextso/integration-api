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

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        logger.info4('MongoDB Connected');

        await FailedOrder.syncIndexes();
        await OrderSyncBatch.syncIndexes();
        await Tenant.syncIndexes();
        await SuccessOrder.syncIndexes();
        await RequestLog.syncIndexes();
        await SyncedBarcode.syncIndexes();
    })
    .catch(err => {
        logger.error(err);
        process.exit(1);
    });