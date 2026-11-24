/**
 * Optional per-item name ("whose print is this?").
 *
 * One customer can order prints for many people. The bill still belongs to the
 * customer; the name is only a label on that line. Nothing here can change a
 * rate, a dimension or the bill customer.
 */

export const ITEM_NAME_MAX = 60;

/** Trimmed, single-spaced, length-capped. An empty value stays empty. */
export function cleanItemName(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ITEM_NAME_MAX);
}

/** The label printed on invoices/receipts, or '' when no name was entered. */
export function itemNameLabel(value: unknown): string {
  const name = cleanItemName(value);
  return name ? `Item Name: ${name}` : '';
}

/** Short receipt form: `For: பஞ்சு`. */
export function itemNameReceipt(value: unknown): string {
  const name = cleanItemName(value);
  return name ? `For: ${name}` : '';
}
