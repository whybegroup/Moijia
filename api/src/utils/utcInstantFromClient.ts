/**
 * Event and suggestion `DateTime` fields are persisted in UTC (Prisma/SQLite).
 * Clients should send RFC 3339 / ISO-8601 instants with a `Z` offset (UTC).
 */

export function utcInstantFromClient(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw Object.assign(new Error('Invalid datetime'), { status: 400 });
  }
  return d;
}
