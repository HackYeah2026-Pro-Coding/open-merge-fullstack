/**
 * Splits a bill between friends.
 *
 * Amounts are integer cents, so no floating point money is involved. The shares
 * always add up to the total: when it does not divide evenly, the first people
 * in the list pay one extra cent each.
 *
 * @param {number} totalCents what the bill comes to, in cents
 * @param {number} people how many people share it
 * @returns {number[]} what each person pays, in cents
 * @throws {RangeError} when `people` is not a positive integer
 */
export function splitBill(totalCents, people) {
  if (!Number.isInteger(people) || people < 1) {
    throw new RangeError(`people must be a positive integer, got ${people}`);
  }

  const base = Math.floor(totalCents / people);
  const extraCents = totalCents % people;
  return Array.from({ length: people }, (_, index) => (index < extraCents ? base + 1 : base));
}
