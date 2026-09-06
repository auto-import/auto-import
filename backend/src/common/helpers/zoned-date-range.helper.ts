import { BadRequestException } from '@nestjs/common';

type LocalDate = { year: number; month: number; day: number };

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function localMidnightToUtc(local: LocalDate, timezone: string) {
  const desired = Date.UTC(local.year, local.month - 1, local.day);
  let result = new Date(desired);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = zonedParts(result, timezone);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    result = new Date(result.getTime() + desired - represented);
  }
  return result;
}

function addDays(local: LocalDate, days: number): LocalDate {
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function parseDate(value: string): LocalDate {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException('La période personnalisée est invalide.');
  }
  return { year, month, day };
}

export function dossierCreatedRange(
  period: 'today' | 'week' | 'month' | 'year' | 'custom',
  timezone: string,
  from?: string,
  to?: string,
  now = new Date(),
) {
  try {
    new Intl.DateTimeFormat('fr-DZ', { timeZone: timezone }).format(now);
  } catch {
    timezone = 'Africa/Algiers';
  }
  const current = zonedParts(now, timezone);
  let start: LocalDate;
  let end: LocalDate;
  if (period === 'custom') {
    if (!from || !to) {
      throw new BadRequestException(
        'Les dates de début et de fin sont requises.',
      );
    }
    start = parseDate(from);
    end = addDays(parseDate(to), 1);
    if (localMidnightToUtc(start, timezone) >= localMidnightToUtc(end, timezone)) {
      throw new BadRequestException('La date de début doit précéder la date de fin.');
    }
  } else {
    const today = { year: current.year, month: current.month, day: current.day };
    if (period === 'today') start = today;
    else if (period === 'month')
      start = { year: current.year, month: current.month, day: 1 };
    else if (period === 'year')
      start = { year: current.year, month: 1, day: 1 };
    else {
      const weekday = new Date(
        Date.UTC(current.year, current.month - 1, current.day),
      ).getUTCDay();
      start = addDays(today, -(weekday === 0 ? 6 : weekday - 1));
    }
    if (period === 'today' || period === 'week') {
      end = addDays(period === 'today' ? start : start, period === 'today' ? 1 : 7);
    } else if (period === 'month') {
      end =
        current.month === 12
          ? { year: current.year + 1, month: 1, day: 1 }
          : { year: current.year, month: current.month + 1, day: 1 };
    } else {
      end = { year: current.year + 1, month: 1, day: 1 };
    }
  }
  return {
    from: localMidnightToUtc(start, timezone),
    toExclusive: localMidnightToUtc(end, timezone),
    timezone,
  };
}
