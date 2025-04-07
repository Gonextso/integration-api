import redis from 'redis';
import LogHelper from '../../helpers/LogHelper.js';
import CacheProvider from '../../cache/CacheProvider.js';

LogHelper.info2('Building redis started');

CacheProvider.client = redis.createClient({
    url: process.env.REDIS_URI
}); 

CacheProvider.client.on('error', (err) => {
    LogHelper.error('Redis error:', err);
    process.exit(1);
});

CacheProvider.client.connect().then(() => LogHelper.info4('Redis Connected')); 