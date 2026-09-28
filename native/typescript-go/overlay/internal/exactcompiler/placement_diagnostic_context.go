package exactcompiler

import "strings"

// placementDiagnosticContext explains the source operations behind a placement
// rejection without suggesting that purity can override an environment restriction.
func placementDiagnosticContext(sources []EnvironmentEffectSource) string {
	var facts []string
	seen := make(map[string]bool)
	opaque, browser, server := false, false, false
	for _, source := range sources {
		fact := source.Description
		if len(source.Path) != 0 {
			fact += " (" + strings.Join(source.Path, " -> ") + ")"
		}
		if fact != "" && !seen[fact] {
			facts = append(facts, fact)
			seen[fact] = true
		}
		opaque = opaque || source.Opaque || source.Environment == "unknown"
		browser = browser || source.Environment == "browser"
		server = server || source.Environment == "server"
	}
	result := ""
	if len(facts) > 0 {
		result = ". Required by: " + strings.Join(facts, ", ")
	}
	if browser && server {
		return result + ". Separate the browser operation and server operation into tasks with the appropriate placement."
	}
	if opaque {
		return result + ". The compiler cannot determine where the unresolved operation can run. Make the helper's implementation available to analysis, or explicitly place its owning task after verifying the operation is available there."
	}
	return result + ". Run this operation in a task whose placement supports it. An explicit placement cannot override a browser-only or server-only dependency."
}
