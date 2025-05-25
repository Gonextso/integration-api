import BaseModel from "../base/BaseModel.js";

export default class ProductDetailVariant extends BaseModel {
    constructor(fields) {
        super({
            barcode: "",
            color: "",
            dimention: "",
            base_price: 0,
            sale_price: 0,
            currency: "",
            ...fields
        });
    }
}