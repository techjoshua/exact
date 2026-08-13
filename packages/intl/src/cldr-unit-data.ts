// Generated from cldr-core 48; do not edit.

/** CLDR release carried by the generated unit-preference projection. */
export const intlCldrVersion = '48';

/** Runtime projection of CLDR preferences for eXact's supported semantic unit selectors. */
// prettier-ignore
export const cldrUnitPreferenceData = {
	"area/floor": {"001":[{"unit":"square-meter"}],"CA":[{"unit":"square-foot"}],"GB":[{"unit":"square-foot"}],"MM":[{"unit":"square-foot"}],"US":[{"unit":"square-foot"}]},
	"area/land": {"001":[{"unit":"hectare"}],"GB":[{"unit":"acre"}],"US":[{"unit":"acre"}]},
	"energy/electricity": {"001":[{"unit":"kilowatt-hour"}]},
	"energy/food": {"001":[{"unit":"kilocalorie"}],"US":[{"unit":"foodcalorie"}]},
	"fuel-economy/road": {"001":[{"unit":"liter-per-100-kilometer"}],"BR":[{"unit":"liter-per-kilometer"}],"CA":[{"unit":"mile-per-gallon-imperial"}],"GB":[{"unit":"mile-per-gallon-imperial"}],"IT":[{"unit":"liter-per-kilometer"}],"JP":[{"unit":"liter-per-kilometer"}],"KR":[{"unit":"liter-per-kilometer"}],"MX":[{"unit":"liter-per-kilometer"}],"MY":[{"unit":"liter-per-kilometer"}],"NL":[{"unit":"liter-per-kilometer"}],"TH":[{"unit":"liter-per-kilometer"}],"TR":[{"unit":"liter-per-kilometer"}],"US":[{"unit":"mile-per-gallon"}]},
	"length/person-height": {"001":[{"unit":"centimeter"}],"AT":[{"unit":"meter-and-centimeter"}],"BE":[{"unit":"meter-and-centimeter"}],"CA":[{"unit":"foot-and-inch","geq":3},{"unit":"inch"}],"DZ":[{"unit":"meter-and-centimeter"}],"EG":[{"unit":"meter-and-centimeter"}],"ES":[{"unit":"meter-and-centimeter"}],"FR":[{"unit":"meter-and-centimeter"}],"GB":[{"unit":"foot-and-inch","geq":3},{"unit":"inch"}],"HK":[{"unit":"meter-and-centimeter"}],"ID":[{"unit":"meter-and-centimeter"}],"IL":[{"unit":"meter-and-centimeter"}],"IN":[{"unit":"foot-and-inch","geq":3},{"unit":"inch"}],"IT":[{"unit":"meter-and-centimeter"}],"JO":[{"unit":"meter-and-centimeter"}],"MY":[{"unit":"meter-and-centimeter"}],"SA":[{"unit":"meter-and-centimeter"}],"SE":[{"unit":"meter-and-centimeter"}],"TR":[{"unit":"meter-and-centimeter"}],"US":[{"unit":"foot-and-inch","geq":3},{"unit":"inch"}],"VN":[{"unit":"meter-and-centimeter"}]},
	"length/road": {"001":[{"unit":"kilometer","geq":0.9},{"unit":"meter","geq":300},{"unit":"meter","geq":10},{"unit":"meter"}],"GB":[{"unit":"mile","geq":0.5},{"unit":"yard","geq":100},{"unit":"yard","geq":10},{"unit":"yard"}],"SE":[{"unit":"mile-scandinavian"},{"unit":"kilometer"},{"unit":"meter","geq":300},{"unit":"meter","geq":10},{"unit":"meter"}],"US":[{"unit":"mile","geq":0.5},{"unit":"foot","geq":100},{"unit":"foot","geq":10},{"unit":"foot"}]},
	"mass/person": {"001":[{"unit":"kilogram"},{"unit":"gram"}],"GB":[{"unit":"stone-and-pound"},{"unit":"pound-and-ounce"}],"HK":[{"unit":"pound-and-ounce"}],"US":[{"unit":"pound"},{"unit":"pound-and-ounce"}]},
	"power/engine": {"001":[{"unit":"kilowatt"}],"GB":[{"unit":"horsepower"}],"US":[{"unit":"horsepower"}]},
	"pressure/weather": {"001":[{"unit":"hectopascal"}],"BR":[{"unit":"millibar"}],"EG":[{"unit":"millibar"}],"GB":[{"unit":"millibar"}],"IL":[{"unit":"millibar"}],"MX":[{"unit":"millimeter-ofhg"}],"RU":[{"unit":"millimeter-ofhg"}],"TH":[{"unit":"millibar"}],"US":[{"unit":"inch-ofhg"}]},
	"speed/road": {"001":[{"unit":"kilometer-per-hour"}],"GB":[{"unit":"mile-per-hour"}],"US":[{"unit":"mile-per-hour"}]},
	"temperature/weather": {"001":[{"unit":"celsius"}],"BS":[{"unit":"fahrenheit"}],"BZ":[{"unit":"fahrenheit"}],"KY":[{"unit":"fahrenheit"}],"PR":[{"unit":"fahrenheit"}],"PW":[{"unit":"fahrenheit"}],"US":[{"unit":"fahrenheit"}]},
	"volume/liquid": {"001":[{"unit":"liter"},{"unit":"milliliter"}],"GB":[{"unit":"gallon-imperial"},{"unit":"fluid-ounce-imperial"}],"US":[{"unit":"gallon"},{"unit":"quart"},{"unit":"pint"},{"unit":"cup"},{"unit":"fluid-ounce"},{"unit":"tablespoon"},{"unit":"teaspoon"}]}
} as const;

/** Measurement-system compatibility derived from CLDR conversion metadata. */
// prettier-ignore
export const cldrUnitSystems = {
	"acre": ["ussystem","uksystem"],
	"celsius": ["metric"],
	"centimeter": ["metric"],
	"cup": ["ussystem"],
	"fahrenheit": ["ussystem","uksystem"],
	"fluid-ounce": ["ussystem"],
	"fluid-ounce-imperial": ["uksystem"],
	"foodcalorie": ["ussystem","uksystem"],
	"foot": ["ussystem","uksystem"],
	"foot-and-inch": ["ussystem","uksystem"],
	"gallon": ["ussystem"],
	"gallon-imperial": ["uksystem"],
	"gram": ["metric"],
	"hectare": ["metric"],
	"hectopascal": ["metric"],
	"horsepower": ["ussystem","uksystem"],
	"inch": ["ussystem","uksystem"],
	"inch-ofhg": ["ussystem","uksystem"],
	"kilocalorie": ["metric"],
	"kilogram": ["metric"],
	"kilometer": ["metric"],
	"kilometer-per-hour": ["metric"],
	"kilowatt": ["metric"],
	"kilowatt-hour": ["metric"],
	"liter": ["metric"],
	"liter-per-100-kilometer": ["metric"],
	"liter-per-kilometer": ["metric"],
	"meter": ["metric"],
	"meter-and-centimeter": ["metric"],
	"mile": ["ussystem","uksystem"],
	"mile-per-gallon": ["ussystem"],
	"mile-per-gallon-imperial": ["uksystem"],
	"mile-per-hour": ["ussystem","uksystem"],
	"mile-scandinavian": ["metric"],
	"millibar": ["metric"],
	"milliliter": ["metric"],
	"millimeter-ofhg": ["metric"],
	"pint": ["ussystem"],
	"pound": ["ussystem","uksystem"],
	"pound-and-ounce": ["ussystem","uksystem"],
	"quart": ["ussystem"],
	"square-foot": ["ussystem","uksystem"],
	"square-meter": ["metric"],
	"stone-and-pound": ["uksystem"],
	"tablespoon": ["ussystem"],
	"teaspoon": ["ussystem"],
	"yard": ["ussystem","uksystem"]
} as const;
