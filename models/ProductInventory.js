import BaseModel from "../base/BaseModel.js";

export default class ProductInventory extends BaseModel {
    constructor(fields) {
        super({
            barcode: "",
            quantity: 0,
            ...fields
        });
    }
}