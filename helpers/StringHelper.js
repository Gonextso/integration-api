export default class StringHelper {
  static truncateString = (str, maxLength = 1000) => {
    if (!str) return str;

    if (str.length > maxLength) {
      return str.slice(0, maxLength - 3) + '... [truncated by gonextso StringHelper]';
    }
    return str;
  }

  static compareStrings = (str1, str2) => {
    return StringHelper.normalizeString(str1) === StringHelper.normalizeString(str2)
  }

  static normalizeString = (str) => {
    return String(str ?? "")
      .toUpperCase()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
  }
}