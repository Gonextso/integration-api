import CoreModel from "../core/CoreModel.js";

export default class ProductDetailVariant extends CoreModel {
    constructor(fields) {
        super({
            barcode: "",
            color: "",
            dimention: "",
            base_price: 0,
            sale_price: 0,
            compare_at_price: null,
            currency: "",
            is_blocked_by_erp: false,
            ...fields
        });
    }
}