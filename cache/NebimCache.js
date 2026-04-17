import CoreCache from "../core/CoreCache.js";
import CacheFields from "../enums/CacheFields.js";
import StringHelper from "../helpers/StringHelper.js";

export default class NebimCache extends CoreCache {
    constructor(tenant) {
        super(tenant);
    }

    findAddressCode = async ({city, district}) => {
        const allAddressCodes = await this.get(CacheFields.NEBIM.ADDRESS_CODES) ?? [];
        this.logger.info(`${allAddressCodes.length} addresses fetched from cache`);
        const sameCityRecords = allAddressCodes.filter(x => StringHelper.compareStrings(x.CityDescription, city));
        const exactMatch = sameCityRecords.find(x => StringHelper.compareStrings(x.DistrictDescription, district));
        if (exactMatch) return exactMatch;

        const fallbackMatch = this.#resolveDistrictCandidate(sameCityRecords, district);

        if (fallbackMatch) {
            this.logger.info(
                `District matched with smart fallback. city:${city}; requested_district:${district}; matched_district:${fallbackMatch.DistrictDescription}; district_code:${fallbackMatch.DistrictCode}`
            );
        }

        return fallbackMatch;
    }

    #resolveDistrictCandidate = (districtCandidates, district) => {
        if (!districtCandidates?.length) return undefined;

        const target = this.#normalizeDistrictValue(district);
        if (!target) return undefined;

        const scoredCandidates = districtCandidates
            .map(candidate => ({
                candidate,
                score: this.#scoreDistrictMatch(target, candidate.DistrictDescription),
                normalizedLength: this.#normalizeDistrictValue(candidate.DistrictDescription).length
            }))
            .filter(item => item.score > 0)
            .sort((left, right) => {
                if (right.score !== left.score) return right.score - left.score;
                return left.normalizedLength - right.normalizedLength;
            });

        return scoredCandidates[0]?.candidate;
    }

    #scoreDistrictMatch = (targetDistrict, rawCandidateDistrict) => {
        const candidate = this.#normalizeDistrictValue(rawCandidateDistrict);
        if (!candidate) return 0;
        if (candidate === targetDistrict) return 100;
        if (candidate.startsWith(targetDistrict) || targetDistrict.startsWith(candidate)) return 80;
        if (candidate.includes(targetDistrict) || targetDistrict.includes(candidate)) return 60;

        return 0;
    }

    #normalizeDistrictValue = (value) => {
        const normalized = StringHelper.normalizeString(value)
            .replaceAll(/\(([^)]*)\)/g, " ")
            .replaceAll(/[^\p{L}\p{N}\s]/gu, " ")
            .replaceAll(/\s+/g, " ")
            .trim();

        return normalized;
    }
}