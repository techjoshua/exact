package exactcompiler

import "regexp"

// Test files enter build adapters only through their explicit compileTestModules selection.
// Recognize the same test/spec/jest filename contract for runner-owned module initializers.
var hostOwnedTestFilenamePattern = regexp.MustCompile(`(?i)(?:^|[\\/])[^\\/]+\.(?:test|spec|jest)\.[cm]?[jt]sx?$`)

func hostOwnedTestFilename(filename string) bool {
	return hostOwnedTestFilenamePattern.MatchString(filename)
}
