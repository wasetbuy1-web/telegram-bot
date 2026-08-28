/**
 * Rounds up to the next multiple of 10, absorbing binary floating-point
 * noise first so a value that is 170 in every meaningful sense (but
 * 170.00000000000003 in IEEE-754) does not jump to 180.
 *
 * 161 -> 170 · 165 -> 170 · 170 -> 170 · 171 -> 180 · 189 -> 190 · 201 -> 210
 */
export function roundUpToNearestTen(amount: number): number {
  const tens = amount / 10;
  const nearest = Math.round(tens);
  const isWholeTen = Math.abs(tens - nearest) < 1e-9;
  return (isWholeTen ? nearest : Math.ceil(tens)) * 10;
}

/**
 * Indirect shipping prices are shown rounded UP to the nearest 10 SAR. The
 * value stored in the session and submitted to the website keeps its full
 * precision -- only what the operator and the customer read is rounded.
 */
export function formatShippingPrice(amount: number, currency: string): string {
  return `${roundUpToNearestTen(amount)} ${currency}`;
}

/** A plain SAR amount for internal summaries, e.g. "1,900 SAR". */
export function formatSar(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")} SAR`;
}

/**
 * Riyal amount for the customer message, e.g. "1,900 ر.س" or "224.75 ر.س".
 * Kept to two decimals rather than whole riyals because tax figures are
 * rarely round and the customer checks them against the ZATCA calculator.
 */
export function formatRiyal(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded.toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
}
