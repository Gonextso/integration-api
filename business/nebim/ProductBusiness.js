import NebimV3IntegratorAPI from "../../apis/NebimV3IntegratorAPI.js";
import CoreClass from "../../core/CoreClass.js";
import NebimObjectHelper from "../../helpers/NebimObjectHelper.js";

export default class NebimProductBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.api = new NebimV3IntegratorAPI(tenant);
    }

    getProductDetailList = async startDate => {
        const query = { "Date": startDate };

        const details = await this.api.runProc(this.tenant.nebim.procNames.product.details, query);
        const prices = await this.api.runProc(this.tenant.nebim.procNames.product.price, query); 
 
        return NebimObjectHelper.getDetailList(details, prices, this.tenant);
    }

    fetchInventories = async startDate => {
        const query = { "Date": startDate };

        const inventory = await this.api.runProc(this.tenant.nebim.procNames.product.inventory, query);

        return NebimObjectHelper.getInventories(inventory);
    }
}