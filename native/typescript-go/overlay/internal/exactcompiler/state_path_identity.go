package exactcompiler

import (
	"strconv"
	"strings"
)

// statePathIdentity preserves property boundaries for compiler-owned path indexes.
// Display labels and emitted artifact paths keep their existing representation.
func statePathIdentity(path []string) string {
	var key strings.Builder
	for _, segment := range path {
		key.WriteString(strconv.Quote(segment))
		key.WriteByte(',')
	}
	return key.String()
}
