// Datas de hospedagem são datas de calendário (sem hora nem fuso): "YYYY-MM-DD".
// Toda conta é feita em UTC para não sofrer com horário de verão.

export type IsoDate = string;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function toUtcDate(value: IsoDate): Date {
  if (!isIsoDate(value)) throw new Error(`Data inválida: ${value}`);
  return new Date(`${value}T00:00:00Z`);
}

export function fromUtcDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return fromUtcDate(new Date(toUtcDate(value).getTime() + days * DAY_MS));
}

export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / DAY_MS);
}

/** Data de hoje no fuso da operação (padrão: João Pessoa, UTC-3, sem horário de verão). */
export function todayIn(timeZone = "America/Fortaleza", now = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
