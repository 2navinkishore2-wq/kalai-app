/**
 * Reliable invoice numbering.
 *
 * A configurable pattern supports {PREFIX}, {YYYY}, {YY}, {MM} and {SEQ}
 * (optionally {SEQ:4} to pad). The sequence is allocated by an atomic
 * Firestore transaction online and derived from the largest local number
 * offline; duplicates are reconciled on the next online session.
 */
export function formatBillNumber(pattern: string, prefix: string, seq: number, date: Date): string {
  const safeSeq = Math.max(1, Math.floor(seq));
  const seqToken = pattern.match(/\{SEQ(?::(\d+))?\}/);
  const pad = seqToken?.[1] ? parseInt(seqToken[1], 10) : 4;
  const seqText = String(safeSeq).padStart(pad, '0');
  return (pattern || '{PREFIX}-{YYYY}-{SEQ}')
    .replace(/\{PREFIX\}/g, prefix)
    .replace(/\{YYYY\}/g, String(date.getFullYear()))
    .replace(/\{YY\}/g, String(date.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, '0'))
    .replace(/\{SEQ(?::\d+)?\}/g, seqText)
    .replace(/[<>:"/\\|?*]/g, '-');
}

export function parseBillSequence(number: string): number {
  const matches = String(number).match(/\d+/g);
  if (!matches || matches.length === 0) return 0;
  return parseInt(matches[matches.length - 1], 10) || 0;
}

export function validateInvoicePattern(pattern: string): string | null {
  if (!pattern.trim()) return 'Invoice format is required.';
  if (!pattern.includes('{SEQ')) return 'Invoice format must include a {SEQ} token.';
  if (!pattern.includes('{PREFIX}') && !pattern.includes('{YYYY}') && !pattern.includes('{YY}') && !pattern.includes('{MM}')) {
    return 'Add at least one prefix or date token (e.g. {PREFIX}) so numbers stay unique.';
  }
  return null;
}

export function previewInvoiceNumber(pattern: string, prefix: string, start: number): string {
  return formatBillNumber(pattern, prefix, Math.max(1, start), new Date());
}
