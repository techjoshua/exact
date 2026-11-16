package exactcompiler

// sourceStagedWriterProjection keeps dormant source exposures separate from
// unfinished source endpoints. Neither channel activates a stored callable.
type sourceStagedWriterProjection struct {
	delta         sourceStagedOperationDelta
	pending       []sourceRelativeEndpoint
	resultContext bool // Original owner represented every premise except these result reads.
}

// describeStagedWriterProjection reduces an original writer receipt without
// authenticating it. Known prefixes survive unknown, incomplete and unsupported
// siblings. Input tickets, activation, inventory closure and publication rights
// remain with the original owner, not this detached projection.
func describeStagedWriterProjection(read sourceStagedWriterRead) sourceStagedWriterProjection {
	result := sourceStagedWriterProjection{}
	result.delta.extracted = read.rhs.unsupported == relativeInputsSupported && !read.incomplete && read.invocation.actualsKnown
	project := func(endpoint sourceRelativeEndpoint) sourceRelativeEndpoint {
		endpoint = cloneSourceRelativeEndpoint(endpoint)
		endpoint.projection = append(endpoint.projection, read.projection...)
		return endpoint
	}
	for _, binding := range read.rhs.bindings {
		for _, endpoint := range binding.sources {
			result.delta.exposures = append(result.delta.exposures, sourceStagedOperationAlternative{endpoint: project(endpoint)})
		}
		for _, endpoint := range binding.pending {
			result.pending = append(result.pending, project(endpoint))
		}
		if binding.unknown || len(binding.pending) != 0 || len(binding.sources) == 0 {
			result.delta.extracted = false
		}
	}
	if read.rhs.unsupported != relativeInputsSupported {
		result.pending = append(result.pending, project(read.value))
	} else if len(read.rhs.bindings) == 0 {
		result.delta.exposures = append(result.delta.exposures, sourceStagedOperationAlternative{endpoint: project(read.value)})
	}
	result.resultContext = !read.incomplete && (read.invocation.actualsKnown || read.region == nil || read.call == nil && enclosingCallableNode(read.readCut.use) == read.region)
	return result
}
