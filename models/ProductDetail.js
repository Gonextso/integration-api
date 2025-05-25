import BaseModel from "../base/BaseModel.js";
import ProductDetailVariant from "./ProductDetailVariant.js";

export default class ProductDetail extends BaseModel {
    constructor(fields) {
        super({
            erp_id: "",
            title: "",
            tax_rate: "",
            is_blocked_by_erp: false,
            attributes: [],
            variants: [],
            ...fields
        });
    }

    addVariants = (variant) => {
        this.variants.push(new ProductDetailVariant(variant));
    }
}