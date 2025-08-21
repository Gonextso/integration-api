import CoreController from "../core/CoreControler.js";
import HttpStatusCodes from "../enums/HttpStatusCodes.js";
import CacheDatabases from "../enums/CacheDatabases.js";
import SystemCache from "../cache/SystemCache.js";
import NebimCache from "../cache/NebimCache.js";
import ShopifyCache from "../cache/ShopifyCache.js";

export default new class CacheController extends CoreController {
    constructor() {
        super();
        this.cacheInstances = {
            SystemCache: SystemCache,
            NebimCache: NebimCache,
            ShopifyCache: ShopifyCache
        };
    }

    getCacheByDbName = async (req, res) => {
        const { dbName, key } = req.query;

        if (!dbName) {
            return this.response(res, {
                status: HttpStatusCodes.BAD_REQUEST,
                error: new Error("dbName parameter is required")
            });
        }

        // Get tenant from authenticated request
        const tenant = req.tenant;

        // Validate database name
        if (!CacheDatabases.DB_NAMES[dbName]) {
            return this.response(res, {
                status: HttpStatusCodes.BAD_REQUEST,
                error: new Error(`Invalid database name. Available databases: ${Object.keys(CacheDatabases.DB_NAMES).join(', ')}`)
            });
        }

        // Get cache instance
        const CacheClass = this.cacheInstances[dbName];
        if (!CacheClass) {
            return this.response(res, {
                status: HttpStatusCodes.BAD_REQUEST,
                error: new Error(`Cache class not found for database: ${dbName}`)
            });
        }

        const cacheInstance = new CacheClass(tenant);

        let result;
        if (key) {
            // Get specific key
            result = await cacheInstance.get(key);
        } else {
            // Get all keys for tenant
            result = await cacheInstance.getAll();
        }

        return this.response(res, {
            status: HttpStatusCodes.SUCCESS,
            content: {
                dbName,
                tenant: tenant.name,
                key: key || 'All',
                data: result
            }
        });
    }

    deleteCacheByDbName = async (req, res) => {
        const { dbName, key } = req.query;

        if (!dbName) {
            return this.response(res, {
                status: HttpStatusCodes.BAD_REQUEST,
                error: new Error("dbName parameter is required")
            });
        }

        // Get tenant from authenticated request
        const tenant = req.tenant;

        // Validate database name
        if (!CacheDatabases.DB_NAMES[dbName]) {
            return this.response(res, {
                status: HttpStatusCodes.BAD_REQUEST,
                error: new Error(`Invalid database name. Available databases: ${Object.keys(CacheDatabases.DB_NAMES).join(', ')}`)
            });
        }

        // Get cache instance
        const CacheClass = this.cacheInstances[dbName];
        if (!CacheClass) {
            return this.response(res, {
                status: HttpStatusCodes.BAD_REQUEST,
                error: new Error(`Cache class not found for database: ${dbName}`)
            });
        }

        const cacheInstance = new CacheClass(tenant);

        if (key) {
            // Delete specific key
            await cacheInstance.delete(key);
        } else {
            // Delete all keys for tenant   
            await cacheInstance.deleteAll();
        }

        return this.response(res, {
            status: HttpStatusCodes.SUCCESS,
            content: {
                message: `Cache ${key ? `key '${key}'` : 'all keys'} deleted successfully for database '${dbName}' and tenant '${tenant.name}'`,
                dbName,
                tenant: tenant.name,
                deletedKey: key || 'all'
            }
        });
    }
}
