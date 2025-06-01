import mongoose from 'mongoose';
import LogHelper from '../../helpers/LogHelper.js';
import FailedOrder from '../../models/db/FailedOrder.js';
import OrderSyncLog from '../../models/db/OrderSyncLog.js';
import Tenant from '../../models/db/Tenant.js';

LogHelper.info2('Building mongoose started');

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        LogHelper.info4('MongoDB Connected');

        await FailedOrder.syncIndexes();
        await OrderSyncLog.syncIndexes();
        await Tenant.syncIndexes();
    })
    .catch(err => {
        LogHelper.error(err);
        process.exit(1);
    });