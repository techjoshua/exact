/**
 * Formats numeric calendar values and native Date objects for HTML input controls.
 * Month numbers count months since January 1970. Other temporal numbers use milliseconds,
 * with UTC fields also used for datetime-local's timezone-free surface. Native Date objects
 * project only for date controls and are never mutated. Invalid calendar values project
 * as an empty string. Non-temporal values retain their authored type.
 * This pure projection is shared by live controls, server markup, and inert text markup.
 */
export function formatNativeInputValue(value: unknown, type: unknown): unknown {
	if (typeof type !== 'string') return value;
	const kind = type.toLowerCase();
	if (kind === 'date' && isNativeInputDate(value))
		return Number.isNaN(value.getTime()) || value.getUTCFullYear() < 1 ? '' : calendarDate(value);
	if (typeof value !== 'number') return value;
	switch (kind) {
		case 'date':
		case 'datetime-local':
		case 'time':
		case 'month':
		case 'week':
			break;
		default:
			return value;
	}
	if (!Number.isFinite(value)) return '';
	if (kind === 'month') {
		const months = Math.trunc(value);
		const year = 1970 + Math.floor(months / 12);
		if (year < 1) return '';
		return `${String(year).padStart(4, '0')}-${String((((months % 12) + 12) % 12) + 1).padStart(2, '0')}`;
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	const pad = (part: number) => String(part).padStart(2, '0');
	if (kind === 'time' || kind === 'datetime-local') {
		let time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
		const milliseconds = date.getUTCMilliseconds();
		if (date.getUTCSeconds() || milliseconds) time += `:${pad(date.getUTCSeconds())}`;
		if (milliseconds) time += `.${String(milliseconds).padStart(3, '0').replace(/0+$/, '')}`;
		if (kind === 'time') return time;
		if (date.getUTCFullYear() < 1) return '';
		return `${calendarDate(date)}T${time}`;
	}
	if (date.getUTCFullYear() < 1) return '';
	if (kind === 'date') return calendarDate(date);
	// An ISO week belongs to the year containing its Thursday. January 4 is always in week 1.
	date.setUTCHours(0, 0, 0, 0);
	date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
	const year = date.getUTCFullYear();
	const first = new Date(0);
	first.setUTCFullYear(year, 0, 4);
	first.setUTCDate(first.getUTCDate() + 4 - (first.getUTCDay() || 7));
	const week = 1 + Math.round((date.getTime() - first.getTime()) / 604_800_000);
	return `${String(year).padStart(4, '0')}-W${pad(week)}`;
}

/** Preserves HTML's positive, at-least-four-digit calendar year rather than ISO's signed years. */
function calendarDate(date: Date): string {
	return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Recognizes native Date values from input documents in another realm without accepting tag spoofs. */
export function isNativeInputDate(value: unknown): value is Date {
	if (value instanceof Date) return true;
	if (
		value === null ||
		typeof value !== 'object' ||
		Object.prototype.toString.call(value) !== '[object Date]'
	)
		return false;
	try {
		Date.prototype.getTime.call(value);
		return true;
	} catch {
		return false;
	}
}
