package exactcompiler

import (
	"strconv"
)

// stateEffectPathKey preserves property boundaries for compiler-owned dependency identity.
// Effects without structured provenance remain opaque labels, never parsed as property paths.
func stateEffectPathKey(effect StateEffect) string {
	if effect.pathSegments == nil {
		return "label:" + strconv.Quote(effect.Path)
	}
	return "path:" + statePathIdentity(effect.pathSegments)
}

// stateEffectPathContains reports strict ancestry only when both effects retain path provenance.
// Missing provenance cannot justify dropping a dependency from the effect graph.
func stateEffectPathContains(parent StateEffect, child StateEffect) bool {
	if parent.pathSegments == nil || child.pathSegments == nil ||
		len(parent.pathSegments) >= len(child.pathSegments) {
		return false
	}
	for index, segment := range parent.pathSegments {
		if segment != child.pathSegments[index] {
			return false
		}
	}
	return true
}
