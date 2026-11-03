/**
 * Strict ISO 8601 Timestamp Parser
 * Conforms to TokTickIT Lab 4 specification (api-spec.md Section 1.1).
 * Rejects non-strict formats, invalid calendar dates (e.g. Feb 30), and invalid timezone offsets.
 */
export const parseStrictIsoTimestamp = (value: unknown): Date | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const timezone = match[7];

  if (
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const isLeapYear =
    year % 4 === 0 &&
    (year % 100 !== 0 || year % 400 === 0);

  const daysPerMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  if (day < 1 || day > daysPerMonth[month - 1]) {
    return null;
  }

  if (timezone !== 'Z') {
    const offset = /^([+-])(\d{2}):(\d{2})$/.exec(timezone);

    if (
      !offset ||
      Number(offset[2]) > 23 ||
      Number(offset[3]) > 59
    ) {
      return null;
    }
  }

  const milliseconds = Date.parse(value);

  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  return new Date(milliseconds);
};
