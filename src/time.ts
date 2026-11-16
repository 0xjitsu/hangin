const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-16T14:00" (already Asia/Manila) -> "16 Nov, 2:00 PM PHT". */
export function formatPht(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return '';
  const h = Number(m[4]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}, ${h12}:${m[5]} ${h < 12 ? 'AM' : 'PM'} PHT`;
}

/** Hour label "14:00" for table rows and bars. */
export function hourLabel(iso: string): string {
  return iso.slice(11, 16);
}

/** Format an epoch ms in Asia/Manila (UTC+8, no DST) as a PHT string. */
export function formatEpochPht(ms: number): string {
  const d = new Date(ms + 8 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return formatPht(`${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`);
}
