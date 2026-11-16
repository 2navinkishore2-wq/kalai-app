let counter = 0;

export function uid(prefix = ''): string {
  counter = (counter + 1) % 1296;
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  const c = counter.toString(36).padStart(2, '0');
  return `${prefix}${t}${c}${r}`;
}

export function itemKey(): string {
  return uid('it_');
}
