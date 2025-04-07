import env from 'dotenv';
import LogHelper from '../helpers/LogHelper.js';

LogHelper.info2('Building environment started');

env.config();