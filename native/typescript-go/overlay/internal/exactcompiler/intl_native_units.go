package exactcompiler

import "strings"

// ECMA-402 sanctioned single units own native NumberFormat validation independently of
// the framework's semantic measurement repertoire. Compounds contain exactly one -per-.
var intlNativeSingleUnits = func() map[string]bool {
	result := map[string]bool{}
	for _, unit := range strings.Fields("acre bit byte celsius centimeter day degree fahrenheit fluid-ounce foot gallon gigabit gigabyte gram hectare hour inch kilobit kilobyte kilogram kilometer liter megabit megabyte meter microsecond mile mile-scandinavian milliliter millimeter millisecond minute month nanosecond ounce percent petabyte pound second stone terabit terabyte week yard year") {
		result[unit] = true
	}
	return result
}()

func intlNativeUnitIdentifier(unit string) bool {
	if intlNativeSingleUnits[unit] {
		return true
	}
	numerator, denominator, compound := strings.Cut(unit, "-per-")
	return compound && intlNativeSingleUnits[numerator] && intlNativeSingleUnits[denominator]
}
