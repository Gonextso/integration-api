import redis from 'redis';
import LogHelper from '../../helpers/LogHelper.js';
import ClientProvider from '../../cache/ClientProvider.js';
import CacheDatabases from '../../enums/CacheDatabases.js';

LogHelper.info2('Building redis started');

ClientProvider.systemClient = redis.createClient({
    url: process.env.REDIS_URI,
    database: CacheDatabases.DB_NAMES.SystemCache
});

ClientProvider.nebimClient = redis.createClient({
    url: process.env.REDIS_URI,
    database: CacheDatabases.DB_NAMES.NebimCache
});

ClientProvider.shopifyClient = redis.createClient({
    url: process.env.REDIS_URI,
    database: CacheDatabases.DB_NAMES.ShopifyCache
});


ClientProvider.systemClient.on('error', (err) => {
    LogHelper.error('Redis system client error:', err);
    process.exit(1);
});

ClientProvider.nebimClient.on('error', (err) => {
    LogHelper.error('Redis nebim client error:', err);
    process.exit(1);
});

ClientProvider.shopifyClient.on('error', (err) => {
    LogHelper.error('Redis shopify client error:', err);
    process.exit(1);
});

ClientProvider.systemClient.connect().then(() => LogHelper.info4('Redis system client Connected')); 
ClientProvider.nebimClient.connect().then(() => LogHelper.info4('Redis nebim client Connected')); 
ClientProvider.shopifyClient.connect().then(() => LogHelper.info4('Redis shopify client Connected')); 