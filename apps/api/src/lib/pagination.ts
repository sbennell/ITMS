const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

const positiveInt = (value: unknown) => {
  const parsed = parseInt(String(value), 10);
  return parsed > 0 ? parsed : null;
};

export const parsePage = (value: unknown) => positiveInt(value) ?? 1;
export const parseSkip = (value: unknown) => positiveInt(value) ?? 0;
export const parseLimit = (value: unknown) => Math.min(positiveInt(value) ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
