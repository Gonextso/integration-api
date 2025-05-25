import CoreClass from "./CoreClass.js";
import WebRequestHelper from "../helpers/WebRequestHelper.js";

export default class CoreAPI extends CoreClass {
    constructor() {
        super();
    }

    webRequest = new WebRequestHelper();
}