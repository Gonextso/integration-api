import CoreModel from "../core/CoreModel.js";

export default class ProductInventory extends CoreModel {
    constructor(fields) {
        super({
            barcode: "",
            quantity: 0,
            ...fields
        });
    }
}