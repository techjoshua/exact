package exactcompiler

// edgeForwardsComponentReceiver checks analysis evidence in forwarded-surface tests.
func edgeForwardsComponentReceiver(edge CallEdge) bool {
	for _, binding := range edge.ReceiverBindings {
		if binding.Source == "component" && len(binding.Path) == 0 {
			return true
		}
	}
	return false
}
