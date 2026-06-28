import CoreModel from "../core/CoreModel.js";
import ProductDetailVariant from "./ProductDetailVariant.js";

export default class ProductDetail extends CoreModel {
    constructor(fields) {
        super({
            erp_id: "",
            title: "",
            description: "",
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