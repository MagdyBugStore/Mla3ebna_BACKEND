function normalizeDayName(jsDay: number) {
  switch (jsDay) {
    case 0:
      return 'sunday';
    case 1:
      return 'monday';
    case 2:
      return 'tuesday';
    case 3:
      return 'wednesday';
    case 4:
      return 'thursday';
    case 5:
      return 'friday';
    case 6:
      return 'saturday';
    default:
      return 'sunday';
  }
}

function parseTimeToMinutes(hhmm: any) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 24) return null;
  if (mm < 0 || mm > 59) return null;
  if (hh === 24 && mm !== 0) return null;
  return hh * 60 + mm;
}

function minutesToHHMM(minutes: number) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function isPeakTime(startMinutes: number) {
  const hh = Math.floor(startMinutes / 60);
  return hh >= 18 && hh < 22;
}

function buildSlotsForDate(field: any, bookings: any[], dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const dayName = normalizeDayName(date.getUTCDay());
  const schedule = Array.isArray(field.schedule) ? field.schedule : [];
  const dayCfg = schedule.find((d: any) => d.day === dayName) || null;
  if (!dayCfg || dayCfg.enabled === false) {
    return { date: dateStr, slots: [] };
  }

  const openMin = parseTimeToMinutes(dayCfg.open_time || '08:00') ?? 8 * 60;
  const closeMin = parseTimeToMinutes(dayCfg.close_time || '24:00') ?? 24 * 60;
  const start = Math.max(0, Math.min(openMin, 24 * 60));
  const end = Math.max(0, Math.min(closeMin, 24 * 60));
  if (end <= start) return { date: dateStr, slots: [] };

  const bookedSet = new Set(
    bookings
      .filter((b: any) => b.status !== 'cancelled')
      .map((b: any) => `${b.start_time}-${b.end_time}`)
  );

  const slots = [];
  for (let t = start; t + 60 <= end; t += 60) {
    const start_time = minutesToHHMM(t);
    const end_time = minutesToHHMM(t + 60);
    const key = `${start_time}-${end_time}`;
    const status = bookedSet.has(key) ? 'booked' : 'available';
    const is_peak = isPeakTime(t);
    const id = `slot_${field.id}_${dateStr}_${start_time.replace(':', '')}`;
    slots.push({ id, start_time, end_time, status, is_peak });
  }

  return { date: dateStr, slots };
}

module.exports = { buildSlotsForDate, isPeakTime };

export {};
