package exactcompiler

import (
	"fmt"
	"regexp"

	"golang.org/x/text/language"
)

// Intl uses Unicode locale identifiers. The language parser also accepts older
// BCP 47 forms and underscores, which native Intl rejects. Prove the syntax
// before canonicalization can erase an authored invalid-locale error.
var intlLocaleSyntax = regexp.MustCompile(`(?i)^(?:[a-z]{2,3}|[a-z]{5,8})(?:-[a-z]{4})?(?:-(?:[a-z]{2}|[0-9]{3}))?(?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*(?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*(?:-x(?:-[a-z0-9]{1,8})+)?$`)

func intlParseLocale(value string) (language.Tag, error) {
	if !intlLocaleSyntax.MatchString(value) {
		return language.Und, fmt.Errorf("invalid Unicode locale identifier %q", value)
	}
	return language.Parse(value)
}

// Locale extensions carry authored calendar, numbering and other policies. A
// descriptor that keeps only the target locale cannot safely omit those settings.
func intlExtractableLocale(value string) bool {
	tag, err := intlParseLocale(value)
	return err == nil && len(tag.Extensions()) == 0
}
