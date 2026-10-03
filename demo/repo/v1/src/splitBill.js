/**
 * Splits a bill between friends.
 *
 * Amounts are integer cents, so no floating point money is involved.
 *
 * @param {number} totalCents what the bill comes to, in cents
 * @param {number} people how many people share it
 * @returns {number[]} what each person pays, in cents
 */
export function splitBill(totalCents, people) {
  // Round up so nobody is ever short.
  const share = Math.ceil(totalCents / people);
  return Array.from({ length: people }, () => share);
}
