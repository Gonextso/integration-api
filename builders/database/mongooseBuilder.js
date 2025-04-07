import mongoose from 'mongoose';
import LogHelper from '../../helpers/LogHelper.js';

LogHelper.info2('Building mongoose started');

mongoose.connect(process.env.MONGO_URI)
    .then(_ => LogHelper.info4('MongoDB Connected'))
    .catch(err => {
        LogHelper.error(err);
        process.exit(1);
    });