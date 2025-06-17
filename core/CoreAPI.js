import CoreClass from "./CoreClass.js";
import WebRequestHelper from "../helpers/WebRequestHelper.js";

export default class CoreAPI extends CoreClass {
    constructor(tenant) {
        super(tenant);
        this.httpRequest = new WebRequestHelper(tenant);
    }

    httpRequest = WebRequestHelper;
}