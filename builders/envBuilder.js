import env from 'dotenv';
import LogHelper from '../helpers/LogHelper.js';

const logger = new LogHelper();

logger.info2('Building environment started');

env.config();