package exactcompiler

import "regexp"

var loweredWatchTarget = regexp.MustCompile(`(?i)\.exact\.(client|server)\.[cm]?[jt]sx?$`)

// isLoweredWatchTarget recognizes the paired target names reserved by the
// compiler. Their producer validates them with its lowering context. Consumer
// watches retain their types for resolution without rechecking erased cells.
func isLoweredWatchTarget(fileName string) bool {
	return loweredWatchTarget.MatchString(fileName)
}
