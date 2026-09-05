/** One dimensionally typed unit understood by the bounded intl runtime. */
export interface IntlUnitDefinition<Dimension extends string = string> {
	readonly dimension: Dimension;
	readonly symbol: string;
	readonly toBase: (value: number) => number;
	readonly fromBase: (value: number) => number;
}

const scaled = <const Dimension extends string>(
	dimension: Dimension,
	symbol: string,
	scale: number
): IntlUnitDefinition<Dimension> =>
	Object.freeze({
		dimension,
		symbol,
		toBase: (value: number) => value * scale,
		fromBase: (value: number) => value / scale
	});

const reciprocal = <const Dimension extends string>(
	dimension: Dimension,
	symbol: string,
	factor: number
): IntlUnitDefinition<Dimension> =>
	Object.freeze({
		dimension,
		symbol,
		toBase: (value: number) => factor / value,
		fromBase: (value: number) => factor / value
	});

/** Shared unit vocabulary and conversion contract used by validation and rendering. */
const finiteIntlUnitDefinitions = Object.freeze({
	meter: scaled('length', 'm', 1),
	kilometer: scaled('length', 'km', 1_000),
	centimeter: scaled('length', 'cm', 0.01),
	millimeter: scaled('length', 'mm', 0.001),
	mile: scaled('length', 'mi', 1_609.344),
	'mile-scandinavian': scaled('length', 'mil', 10_000),
	yard: scaled('length', 'yd', 0.9144),
	foot: scaled('length', 'ft', 0.3048),
	inch: scaled('length', 'in', 0.0254),

	'square-meter': scaled('area', 'm²', 1),
	'square-kilometer': scaled('area', 'km²', 1_000_000),
	'square-centimeter': scaled('area', 'cm²', 0.0001),
	'square-mile': scaled('area', 'mi²', 2_589_988.110336),
	'square-yard': scaled('area', 'yd²', 0.83612736),
	'square-foot': scaled('area', 'ft²', 0.09290304),
	'square-inch': scaled('area', 'in²', 0.00064516),
	acre: scaled('area', 'ac', 4_046.8564224),
	hectare: scaled('area', 'ha', 10_000),

	gram: scaled('mass', 'g', 0.001),
	kilogram: scaled('mass', 'kg', 1),
	milligram: scaled('mass', 'mg', 0.000001),
	'metric-ton': scaled('mass', 't', 1_000),
	ounce: scaled('mass', 'oz', 0.028349523125),
	pound: scaled('mass', 'lb', 0.45359237),
	stone: scaled('mass', 'st', 6.35029318),
	ton: scaled('mass', 'ton', 907.18474),

	liter: scaled('volume', 'L', 1),
	milliliter: scaled('volume', 'mL', 0.001),
	centiliter: scaled('volume', 'cL', 0.01),
	'cubic-meter': scaled('volume', 'm³', 1_000),
	gallon: scaled('volume', 'gal', 3.785411784),
	'gallon-imperial': scaled('volume', 'imp gal', 4.54609),
	'fluid-ounce': scaled('volume', 'fl oz', 0.0295735295625),
	'fluid-ounce-imperial': scaled('volume', 'imp fl oz', 0.0284130625),
	quart: scaled('volume', 'qt', 0.946352946),
	pint: scaled('volume', 'pt', 0.473176473),
	cup: scaled('volume', 'cup', 0.2365882365),

	'meter-per-second': scaled('speed', 'm/s', 1),
	'kilometer-per-hour': scaled('speed', 'km/h', 1 / 3.6),
	'mile-per-hour': scaled('speed', 'mph', 0.44704),
	knot: scaled('speed', 'kn', 0.5144444444444445),

	pascal: scaled('pressure', 'Pa', 1),
	hectopascal: scaled('pressure', 'hPa', 100),
	kilopascal: scaled('pressure', 'kPa', 1_000),
	megapascal: scaled('pressure', 'MPa', 1_000_000),
	bar: scaled('pressure', 'bar', 100_000),
	millibar: scaled('pressure', 'mbar', 100),
	'pound-force-per-square-inch': scaled('pressure', 'psi', 6_894.757293168),
	'inch-of-mercury': scaled('pressure', 'inHg', 3_386.389),
	'millimeter-of-mercury': scaled('pressure', 'mmHg', 133.322387415),

	joule: scaled('energy', 'J', 1),
	kilojoule: scaled('energy', 'kJ', 1_000),
	megajoule: scaled('energy', 'MJ', 1_000_000),
	calorie: scaled('energy', 'cal', 4.184),
	kilocalorie: scaled('energy', 'kcal', 4_184),
	'watt-hour': scaled('energy', 'Wh', 3_600),
	'kilowatt-hour': scaled('energy', 'kWh', 3_600_000),

	watt: scaled('power', 'W', 1),
	kilowatt: scaled('power', 'kW', 1_000),
	megawatt: scaled('power', 'MW', 1_000_000),
	horsepower: scaled('power', 'hp', 745.6998715822702),

	'liter-per-100-kilometer': scaled('fuel-economy', 'L/100 km', 1),
	'liter-per-kilometer': scaled('fuel-economy', 'L/km', 100),
	'mile-per-gallon': reciprocal('fuel-economy', 'mpg', 235.214583),
	'mile-per-gallon-imperial': reciprocal('fuel-economy', 'mpg imp', 282.480936),

	bit: scaled('digital', 'bit', 0.125),
	byte: scaled('digital', 'B', 1),
	kilobit: scaled('digital', 'kb', 125),
	kilobyte: scaled('digital', 'kB', 1_000),
	megabit: scaled('digital', 'Mb', 125_000),
	megabyte: scaled('digital', 'MB', 1_000_000),
	gigabit: scaled('digital', 'Gb', 125_000_000),
	gigabyte: scaled('digital', 'GB', 1_000_000_000),
	terabit: scaled('digital', 'Tb', 125_000_000_000),
	terabyte: scaled('digital', 'TB', 1_000_000_000_000),
	petabyte: scaled('digital', 'PB', 1_000_000_000_000_000),

	celsius: Object.freeze({
		dimension: 'temperature',
		symbol: '°C',
		toBase: (value: number) => value + 273.15,
		fromBase: (value: number) => value - 273.15
	}),
	fahrenheit: Object.freeze({
		dimension: 'temperature',
		symbol: '°F',
		toBase: (value: number) => ((value + 459.67) * 5) / 9,
		fromBase: (value: number) => (value * 9) / 5 - 459.67
	}),
	kelvin: scaled('temperature', 'K', 1)
} satisfies Readonly<Record<string, IntlUnitDefinition>>);

/** Canonical finite unit identifier accepted by public preference overrides. */
export type IntlUnitName = keyof typeof finiteIntlUnitDefinitions;

/** Finite unit identifiers belonging to one physical dimension. */
export type IntlUnitForDimension<Dimension extends string> = {
	[Unit in IntlUnitName]: (typeof finiteIntlUnitDefinitions)[Unit]['dimension'] extends Dimension
		? Unit
		: never;
}[IntlUnitName];

/** Runtime lookup view retaining finite public names while accepting validated protocol strings. */
export const intlUnitDefinitions: typeof finiteIntlUnitDefinitions &
	Readonly<Record<string, IntlUnitDefinition>> = finiteIntlUnitDefinitions;

/** Canonical unit identifiers accepted by the analyzer and runtime. */
export const intlUnitIdentifiers = Object.freeze(Object.keys(intlUnitDefinitions));

/** Converts between units only when both belong to the same physical dimension. @exact pure */
export function convertIntlUnit(value: number, source: string, destination: string): number {
	if (source === destination) return value;
	const from = intlUnitDefinitions[source];
	const to = intlUnitDefinitions[destination];
	if (!from || !to || from.dimension !== to.dimension)
		throw new TypeError(`Unsupported intl unit conversion from ${source} to ${destination}`);
	return to.fromBase(from.toBase(value));
}
