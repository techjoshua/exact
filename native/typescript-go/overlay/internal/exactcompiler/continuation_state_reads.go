package exactcompiler

import "strings"

// continuationStateReadContracts supplies exact receiver inputs for dynamic reads.
// A transported ancestor already supplies its descendants, including when an
// authored nullish guard skips those descendants. Only structured source provenance proves
// that receiver. Opaque helper-effect labels cannot authorize additional transport.
func continuationStateReadContracts(effects []StateEffect) []StateEffect {
	result := append([]StateEffect(nil), effects...)
	for _, effect := range effects {
		if effect.Kind != "read" || effect.Confidence != "broad" || effect.pathSegments == nil {
			continue
		}
		for index, segment := range effect.pathSegments {
			if segment != "*" {
				continue
			}
			path := strings.Join(effect.pathSegments[:index], ".")
			if index == 0 {
				path = "*"
			}
			result = append(result, StateEffect{
				pathSegments: append([]string{}, effect.pathSegments[:index]...),
				Path:         path, Kind: "read", Confidence: "exact",
			})
			break
		}
	}
	// Broad effects remain visible as conservative analysis metadata. Only
	// exact read requirements can be redundant with a transported ancestor.
	exact := []StateEffect{}
	retained := []StateEffect{}
	for _, effect := range uniqueStateEffects(result) {
		if effect.Kind == "read" && effect.Confidence == "exact" {
			exact = append(exact, effect)
		} else {
			retained = append(retained, effect)
		}
	}
	return append(retained, minimalStateEffects(exact)...)
}
