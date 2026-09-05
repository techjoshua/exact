package exactcompiler

import "strings"

// componentHasResumption reports whether a component exposes any browser-visible activation data.
func componentHasResumption(componentID string, resumptions []ComponentResumption) bool {
	for _, resumption := range resumptions {
		if resumption.ComponentID == componentID &&
			(len(resumption.Client.StatePaths) != 0 ||
				len(resumption.Client.ValueCaptures) != 0 ||
				len(resumption.Client.Contexts) != 0 ||
				len(resumption.Client.Boundaries) != 0) {
			return true
		}
	}
	return false
}

// componentHasReconstructibleResumption proves that setup recreates a context-free activation.
func componentHasReconstructibleResumption(
	componentID string,
	resumptions []ComponentResumption,
) bool {
	for _, resumption := range resumptions {
		if resumption.ComponentID == componentID {
			return len(resumption.Client.Contexts) == 0 &&
				allResumptionStateReconstructible(resumption.Client)
		}
	}
	return false
}

// allResumptionStateReconstructible proves that setup recreates every serialized state path. An
// exact primitive parent default also recreates the absence of each compiler-observed descendant.
func allResumptionStateReconstructible(resumption ClientResumptionRecord) bool {
	inputs := make(map[string]struct{}, len(resumption.StateInputs))
	for _, input := range resumption.StateInputs {
		inputs[input.StatePath] = struct{}{}
	}
	defaults := make([]string, 0, len(resumption.StateDefaults))
	for _, value := range resumption.StateDefaults {
		defaults = append(defaults, value.StatePath)
	}
	for _, path := range resumption.StatePaths {
		if _, exists := inputs[path]; exists {
			continue
		}
		reconstructed := false
		for _, candidate := range defaults {
			if path == candidate || strings.HasPrefix(path, candidate+".") {
				reconstructed = true
				break
			}
		}
		if !reconstructed {
			return false
		}
	}
	return true
}

// directServerResumptionSupported identifies records a request-local state/context frame can
// publish without durable client-style component ownership. Context-bearing components select the
// focused direct context frame during artifact emission; their resumption records therefore do not
// require the generic server component lane.
func directServerResumptionSupported(
	componentID string,
	resumptions []ComponentResumption,
) bool {
	for _, resumption := range resumptions {
		if resumption.ComponentID == componentID {
			return true
		}
	}
	return false
}
