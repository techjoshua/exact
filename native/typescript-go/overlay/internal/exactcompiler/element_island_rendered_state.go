package exactcompiler

// renderedIslandStateReads projects state dependencies to their rendered consumers before
// selecting a common island owner. Setup snapshots cannot be bounded by a JSX ancestor and
// must not prevent sibling consumers from sharing state. Live setup-derived bindings instead
// contribute their rendered reference positions, following chained definitions transitively.
func renderedIslandStateReads(
	elements []componentElement,
	component string,
	reads []StateRead,
	bindings []ReactiveBinding,
) []StateRead {
	result := []StateRead{}
	for _, read := range reads {
		if read.Component != component {
			continue
		}
		visited := make(map[int]bool)
		var visit func(SourceSpan)
		visit = func(span SourceSpan) {
			if visited[span.Start] {
				return
			}
			visited[span.Start] = true
			for _, element := range elements {
				if span.Start >= element.fullStart && span.Start < element.fullEnd {
					consumer := read
					consumer.Start, consumer.Length = span.Start, span.Length
					result = append(result, consumer)
					return
				}
			}
			for _, binding := range bindings {
				if binding.Component != component || !reactiveProvenance(binding.Provenance) ||
					span.Start < binding.Definition.Start ||
					span.Start >= binding.Definition.Start+binding.Definition.Length {
					continue
				}
				for _, reference := range binding.References {
					visit(reference)
				}
			}
		}
		visit(SourceSpan{Start: read.Start, Length: read.Length})
	}
	return result
}
