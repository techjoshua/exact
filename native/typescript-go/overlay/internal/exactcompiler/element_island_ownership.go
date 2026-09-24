package exactcompiler

// retainIndependentElementIslands removes element exports absorbed by a resumable component.
// Its callbacks remain lexical to that owner; publishing separate islands would manufacture
// unbound references and advertise boundaries the server projection never emits.
func retainIndependentElementIslands(
	components []Component,
	symbols []SymbolRecord,
	boundaries []Boundary,
	continuations []Continuation,
	resumptions []ComponentResumption,
) ([]SymbolRecord, []Boundary) {
	owners := indexContinuationComponents(continuations)
	for _, component := range components {
		if component.Placement != "isomorphic" {
			delete(owners, component.ID)
		}
	}
	removed := make(map[string]struct{})
	keptSymbols := symbols[:0]
	for _, symbol := range symbols {
		_, owned := owners[symbol.ComponentID]
		if owned && symbol.Role == "client-island" {
			removed[symbol.ID] = struct{}{}
			removed[symbol.ID+":children"] = struct{}{}
			continue
		}
		keptSymbols = append(keptSymbols, symbol)
	}
	keptBoundaries := boundaries[:0]
	for _, boundary := range boundaries {
		if _, discarded := removed[boundary.ID]; !discarded {
			keptBoundaries = append(keptBoundaries, boundary)
		}
	}
	retain := func(ids []string) []string {
		kept := make([]string, 0, len(ids))
		for _, id := range ids {
			if _, discarded := removed[id]; !discarded {
				kept = append(kept, id)
			}
		}
		return kept
	}
	for index := range continuations {
		continuations[index].Effects.Boundaries = retain(continuations[index].Effects.Boundaries)
	}
	for index := range resumptions {
		resumptions[index].Client.Boundaries = retain(resumptions[index].Client.Boundaries)
	}
	return keptSymbols, keptBoundaries
}
