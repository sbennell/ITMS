// Item numbers sort by their digits ("2" before "10"), which the database cannot do.
// Returns the ids for one page, so full rows only need loading for that page.
export function itemNumberPageIds(
  items: { id: string; itemNumber: string }[],
  sortOrder: unknown,
  skip: number,
  limit: number
): string[] {
  const direction = sortOrder === 'asc' ? 1 : -1;
  const digits = (itemNumber: string) => parseInt(itemNumber.replace(/\D/g, '') || '0', 10);

  return [...items]
    .sort((a, b) => direction * (digits(a.itemNumber) - digits(b.itemNumber) || a.itemNumber.localeCompare(b.itemNumber)))
    .slice(skip, skip + limit)
    .map((item) => item.id);
}
