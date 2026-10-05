package exactcompiler

import "strings"

// continuationStateReadContracts retains broad effects for analysis while supplying
// exact receiver inputs for dynamic reads. Only structured source provenance proves
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
	return uniqueStateEffects(result)
}
