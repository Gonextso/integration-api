import CoreClass from "../core/CoreClass.js";
import OrderBusiness from "./OrderBusiness.js";

export default class OrderSetupBusiness extends CoreClass {
    constructor(tenant) {
        super(tenant);
    }

    runSetupTest = async (orderId) => {
        const trimmed = orderId?.trim();
        if (!trimmed) {
            throw new Error("OrderId is required");
        }

        const orderBusiness = new OrderBusiness(this.tenant);
        return await orderBusiness.pushSingleOrder(trimmed);
    }
}
