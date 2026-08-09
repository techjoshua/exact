import { intl } from '@exactjs/core';
import type { SourceCurrencyLabel } from './source-locale-profile.js';

/** Bounded shorthand that supplements native Intl data for one authored source language. */
export interface SourceLanguageInference {
	readonly unitLabels?: Readonly<Record<string, string>>;
	readonly currencyLabels?: Readonly<Record<string, SourceCurrencyLabel>>;
	readonly defaultCurrencyLabels?: readonly string[];
	readonly ordinalMarkers?: readonly string[];
	readonly ordinalWrappers?: readonly SourceOrdinalWrapper[];
}

/** One distinctive literal wrapper that proves a numeric placeholder is ordinal. */
export interface SourceOrdinalWrapper {
	readonly prefix: string;
	readonly suffix: string;
}

const englishUnitLabels: Readonly<Record<string, string>> = Object.freeze({
	mi: 'mile',
	mile: 'mile',
	miles: 'mile',
	km: 'kilometer',
	kilometer: 'kilometer',
	kilometers: 'kilometer',
	m: 'meter',
	meter: 'meter',
	meters: 'meter',
	ft: 'foot',
	foot: 'foot',
	feet: 'foot',
	in: 'inch',
	inch: 'inch',
	inches: 'inch',
	yd: 'yard',
	yard: 'yard',
	yards: 'yard',
	cm: 'centimeter',
	centimeter: 'centimeter',
	centimeters: 'centimeter',
	mm: 'millimeter',
	millimeter: 'millimeter',
	millimeters: 'millimeter',
	c: 'celsius',
	celsius: 'celsius',
	f: 'fahrenheit',
	fahrenheit: 'fahrenheit',
	k: 'kelvin',
	kelvin: 'kelvin',
	'm²': 'square-meter',
	'square meter': 'square-meter',
	'square meters': 'square-meter',
	'km²': 'square-kilometer',
	'square kilometer': 'square-kilometer',
	'square kilometers': 'square-kilometer',
	'cm²': 'square-centimeter',
	'square centimeter': 'square-centimeter',
	'square centimeters': 'square-centimeter',
	'ft²': 'square-foot',
	'square foot': 'square-foot',
	'square feet': 'square-foot',
	'mi²': 'square-mile',
	'square mile': 'square-mile',
	'square miles': 'square-mile',
	'yd²': 'square-yard',
	'square yard': 'square-yard',
	'square yards': 'square-yard',
	'in²': 'square-inch',
	'square inch': 'square-inch',
	'square inches': 'square-inch',
	ac: 'acre',
	acre: 'acre',
	acres: 'acre',
	ha: 'hectare',
	hectare: 'hectare',
	hectares: 'hectare',
	g: 'gram',
	gram: 'gram',
	grams: 'gram',
	kg: 'kilogram',
	kilogram: 'kilogram',
	kilograms: 'kilogram',
	mg: 'milligram',
	milligram: 'milligram',
	milligrams: 'milligram',
	t: 'metric-ton',
	'metric ton': 'metric-ton',
	'metric tons': 'metric-ton',
	tonne: 'metric-ton',
	tonnes: 'metric-ton',
	oz: 'ounce',
	ounce: 'ounce',
	ounces: 'ounce',
	lb: 'pound',
	pound: 'pound',
	pounds: 'pound',
	st: 'stone',
	stone: 'stone',
	stones: 'stone',
	ton: 'ton',
	tons: 'ton',
	L: 'liter',
	liter: 'liter',
	liters: 'liter',
	litre: 'liter',
	litres: 'liter',
	mL: 'milliliter',
	milliliter: 'milliliter',
	milliliters: 'milliliter',
	cL: 'centiliter',
	centiliter: 'centiliter',
	centiliters: 'centiliter',
	'm³': 'cubic-meter',
	'cubic meter': 'cubic-meter',
	'cubic meters': 'cubic-meter',
	gal: 'gallon',
	gallon: 'gallon',
	gallons: 'gallon',
	'imp gal': 'gallon-imperial',
	'imperial gallon': 'gallon-imperial',
	'imperial gallons': 'gallon-imperial',
	'fl oz': 'fluid-ounce',
	'fluid ounce': 'fluid-ounce',
	'fluid ounces': 'fluid-ounce',
	'imp fl oz': 'fluid-ounce-imperial',
	'imperial fluid ounce': 'fluid-ounce-imperial',
	'imperial fluid ounces': 'fluid-ounce-imperial',
	qt: 'quart',
	quart: 'quart',
	quarts: 'quart',
	pt: 'pint',
	pint: 'pint',
	pints: 'pint',
	cup: 'cup',
	cups: 'cup',
	'm/s': 'meter-per-second',
	'meters per second': 'meter-per-second',
	'km/h': 'kilometer-per-hour',
	'kilometers per hour': 'kilometer-per-hour',
	mph: 'mile-per-hour',
	'miles per hour': 'mile-per-hour',
	kn: 'knot',
	knot: 'knot',
	knots: 'knot',
	Pa: 'pascal',
	pascal: 'pascal',
	pascals: 'pascal',
	hPa: 'hectopascal',
	hectopascal: 'hectopascal',
	hectopascals: 'hectopascal',
	kPa: 'kilopascal',
	kilopascal: 'kilopascal',
	kilopascals: 'kilopascal',
	MPa: 'megapascal',
	megapascal: 'megapascal',
	megapascals: 'megapascal',
	bar: 'bar',
	bars: 'bar',
	mbar: 'millibar',
	millibar: 'millibar',
	millibars: 'millibar',
	psi: 'pound-force-per-square-inch',
	'pounds per square inch': 'pound-force-per-square-inch',
	inHg: 'inch-of-mercury',
	'inches of mercury': 'inch-of-mercury',
	J: 'joule',
	joule: 'joule',
	joules: 'joule',
	kJ: 'kilojoule',
	kilojoule: 'kilojoule',
	kilojoules: 'kilojoule',
	MJ: 'megajoule',
	megajoule: 'megajoule',
	megajoules: 'megajoule',
	cal: 'calorie',
	calorie: 'calorie',
	calories: 'calorie',
	kcal: 'kilocalorie',
	kilocalorie: 'kilocalorie',
	kilocalories: 'kilocalorie',
	Wh: 'watt-hour',
	'watt-hour': 'watt-hour',
	'watt-hours': 'watt-hour',
	kWh: 'kilowatt-hour',
	'kilowatt-hour': 'kilowatt-hour',
	'kilowatt-hours': 'kilowatt-hour',
	W: 'watt',
	watt: 'watt',
	watts: 'watt',
	kW: 'kilowatt',
	kilowatt: 'kilowatt',
	kilowatts: 'kilowatt',
	MW: 'megawatt',
	megawatt: 'megawatt',
	megawatts: 'megawatt',
	hp: 'horsepower',
	horsepower: 'horsepower',
	'L/100 km': 'liter-per-100-kilometer',
	'liters per 100 kilometers': 'liter-per-100-kilometer',
	mpg: 'mile-per-gallon',
	'miles per gallon': 'mile-per-gallon',
	'mpg imp': 'mile-per-gallon-imperial',
	'miles per imperial gallon': 'mile-per-gallon-imperial',
	bit: 'bit',
	bits: 'bit',
	byte: 'byte',
	bytes: 'byte',
	kb: 'kilobit',
	kilobit: 'kilobit',
	kilobits: 'kilobit',
	kB: 'kilobyte',
	kilobyte: 'kilobyte',
	kilobytes: 'kilobyte',
	Mb: 'megabit',
	megabit: 'megabit',
	megabits: 'megabit',
	MB: 'megabyte',
	megabyte: 'megabyte',
	megabytes: 'megabyte',
	Gb: 'gigabit',
	gigabit: 'gigabit',
	gigabits: 'gigabit',
	GB: 'gigabyte',
	gigabyte: 'gigabyte',
	gigabytes: 'gigabyte',
	Tb: 'terabit',
	terabit: 'terabit',
	terabits: 'terabit',
	TB: 'terabyte',
	terabyte: 'terabyte',
	terabytes: 'terabyte',
	PB: 'petabyte',
	petabyte: 'petabyte',
	petabytes: 'petabyte'
});

const englishCurrencyLabels: Readonly<Record<string, SourceCurrencyLabel>> = Object.freeze({
	'us dollar': Object.freeze({ currency: 'USD', display: 'name' }),
	'us dollars': Object.freeze({ currency: 'USD', display: 'name' }),
	'canadian dollar': Object.freeze({ currency: 'CAD', display: 'name' }),
	'canadian dollars': Object.freeze({ currency: 'CAD', display: 'name' }),
	'australian dollar': Object.freeze({ currency: 'AUD', display: 'name' }),
	'australian dollars': Object.freeze({ currency: 'AUD', display: 'name' }),
	euro: Object.freeze({ currency: 'EUR', display: 'name' }),
	euros: Object.freeze({ currency: 'EUR', display: 'name' }),
	pound: Object.freeze({ currency: 'GBP', display: 'name' }),
	pounds: Object.freeze({ currency: 'GBP', display: 'name' }),
	yen: Object.freeze({ currency: 'JPY', display: 'name' }),
	'€': Object.freeze({ currency: 'EUR', display: 'symbol' }),
	'£': Object.freeze({ currency: 'GBP', display: 'symbol' }),
	'¥': Object.freeze({ currency: 'JPY', display: 'symbol' })
});

const sourceLanguageInferences: Readonly<Record<string, SourceLanguageInference>> = Object.freeze({
	en: Object.freeze({
		unitLabels: englishUnitLabels,
		currencyLabels: englishCurrencyLabels,
		defaultCurrencyLabels: Object.freeze(['$']),
		ordinalMarkers: Object.freeze(['st', 'nd', 'rd', 'th', 'ˢᵗ', 'ⁿᵈ', 'ʳᵈ', 'ᵗʰ'])
	}),
	de: ordinalProfile(['.']),
	fr: ordinalProfile(
		['er', 're', 'e', 'ᵉʳ', 'ʳᵉ', 'ᵉ'],
		[
			{ prefix: '', suffix: 'er' },
			{ prefix: '', suffix: 're' },
			{ prefix: '', suffix: 'ᵉʳ' },
			{ prefix: '', suffix: 'ʳᵉ' }
		]
	),
	es: ordinalProfile(
		['º', 'ª', 'ᵒ', 'ᵃ'],
		[
			{ prefix: '', suffix: '.º' },
			{ prefix: '', suffix: '.ª' },
			{ prefix: '', suffix: 'º' },
			{ prefix: '', suffix: 'ª' }
		]
	),
	pt: ordinalProfile(
		['º', 'ª', 'ᵒ', 'ᵃ'],
		[
			{ prefix: '', suffix: '.º' },
			{ prefix: '', suffix: '.ª' },
			{ prefix: '', suffix: 'º' },
			{ prefix: '', suffix: 'ª' }
		]
	),
	it: ordinalProfile(
		['º', 'ª', '°'],
		[
			{ prefix: '', suffix: 'º' },
			{ prefix: '', suffix: 'ª' },
			{ prefix: '', suffix: '°' }
		]
	),
	nl: ordinalProfile(
		['e', 'de', 'ste'],
		[
			{ prefix: '', suffix: 'de' },
			{ prefix: '', suffix: 'ste' }
		]
	),
	pl: ordinalProfile(['.']),
	uk: ordinalProfile(
		['-й', '-а', '-е', '-ша', '-ше'],
		[
			{ prefix: '', suffix: '-й' },
			{ prefix: '', suffix: '-а' },
			{ prefix: '', suffix: '-е' }
		]
	),
	ru: ordinalProfile(
		['-й', '-я', '-е', '-ая', '-ое'],
		[
			{ prefix: '', suffix: '-й' },
			{ prefix: '', suffix: '-я' },
			{ prefix: '', suffix: '-е' }
		]
	),
	ar: ordinalProfile(['الأول', 'الأولى', 'الثاني', 'الثانية', 'الثالث', 'الثالثة']),
	hi: ordinalProfile(
		['वाँ', 'वीं', 'वें'],
		[
			{ prefix: '', suffix: 'वाँ' },
			{ prefix: '', suffix: 'वीं' },
			{ prefix: '', suffix: 'वें' }
		]
	),
	ja: ordinalProfile(
		['第', '位', '番目'],
		[
			{ prefix: '第', suffix: '位' },
			{ prefix: '第', suffix: '番目' }
		]
	),
	zh: ordinalProfile(
		['第', '名', '个', '次'],
		[
			{ prefix: '第', suffix: '名' },
			{ prefix: '第', suffix: '个' },
			{ prefix: '第', suffix: '次' }
		]
	),
	ko: ordinalProfile(
		['제', '번째', '차'],
		[
			{ prefix: '제', suffix: '번째' },
			{ prefix: '제', suffix: '차' }
		]
	),
	tr: ordinalProfile(
		['-ıncı', '-inci', '-uncu', '-üncü'],
		[
			{ prefix: '', suffix: '-ıncı' },
			{ prefix: '', suffix: '-inci' },
			{ prefix: '', suffix: '-uncu' },
			{ prefix: '', suffix: '-üncü' }
		]
	),
	id: ordinalProfile(['ke-'], [{ prefix: 'ke-', suffix: '' }])
});

function ordinalProfile(
	markers: readonly string[],
	wrappers: readonly SourceOrdinalWrapper[] = []
): SourceLanguageInference {
	return Object.freeze({
		ordinalMarkers: Object.freeze([...markers]),
		ordinalWrappers: Object.freeze(wrappers.map((wrapper) => Object.freeze({ ...wrapper })))
	});
}

/** Resolves optional authored-language shorthand without coupling the native analyzer to a language. */
export function sourceLanguageInference(locale: string): SourceLanguageInference {
	const language = intl.Locale(locale).language;
	return sourceLanguageInferences[language] ?? Object.freeze({});
}
