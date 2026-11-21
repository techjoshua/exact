package exactcompiler

// componentPublishesLocalActivation selects an independent client owner. A delivered provider
// island is the selective fallback for a whole-component owner under a server parent.
func componentPublishesLocalActivation(component Component, serverComponents bool) bool {
	return component.Placement == "isomorphic" && (!serverComponents || component.ClientIslandCount == 0 || component.ownsDeliveredProvider) &&
		(component.Interactions || component.Lifecycle || component.ownsDeliveredProvider || componentOwnsMutableContext(component))
}

// A stateful context provider must recreate its durable owner for descendant commands.
// Its consumers may be supplied by another module or a server slot, so absence of a local
// event handler cannot prove that the provided state is passive. Server-only owners retain
// their residency, and ordinary context readers do not manufacture a provider activation.
func componentOwnsMutableContext(component Component) bool {
	if component.Placement != "isomorphic" || len(component.StateSlots) == 0 {
		return false
	}
	for _, effect := range component.Contexts {
		if effect.Kind == "write" {
			return true
		}
	}
	return false
}

// Context commands and their state remain under one owner rather than detached element islands.
func retainMutableContextOwners(components []Component) {
	for index := range components {
		if componentOwnsMutableContext(components[index]) {
			components[index].ClientIslandCount = 0
		}
	}
}
