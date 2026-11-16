package exactcompiler

// Map field roles reuse the original field/source lifecycle while retaining the
// exact entry association. This validates descriptive transport, not entry
// selection, source completion or a returned descriptor value.
func validStagedMapFieldRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.nativeGet
	if source == nil || source.descriptorEntry == nil || source.descriptorMap == nil {
		return false
	}
	entry := source.descriptorEntry
	if entry.generation == nil || entry.source == nil || !sameNativeGetSource(entry.source, source) {
		return false
	}
	request, valid := stagedMapEntryRequest(entry.source, entry.entry)
	if !valid || !sameOperationRequest(request, entry.request) {
		return false
	}
	for _, field := range reflectiveDescriptorKeys {
		parent := stagedMapEntryFieldRequest(entry, field)
		roles, valid := fieldSourceRequests(parent)
		if !valid {
			return false
		}
		if recipe.key == parent.producer {
			expected := []sourceStagedOperationRequest{roles.ownWriters, roles.prototype}
			if argument, needed := stagedModuleArgumentFieldRequest(source, parent); needed {
				expected = append(expected, argument)
			}
			return !recipe.delta.extracted && operationDeltaSize(recipe.delta) == len(expected) && len(recipe.delta.required) == len(expected) && operationPrefix(recipe.delta.required, expected, sameOperationRequest)
		}
		if recipe.key == roles.ownWriters.producer || recipe.key == roles.prototype.producer {
			return len(recipe.delta.exposures)+len(recipe.delta.relative) == 0
		}
	}
	return false
}

func stagedMapFieldRequest(recipe sourceStagedOperationRecipe, request sourceStagedOperationRequest) bool {
	entry := recipe.nativeGet.descriptorEntry
	for _, field := range reflectiveDescriptorKeys {
		parent := stagedMapEntryFieldRequest(entry, field)
		roles, valid := fieldSourceRequests(parent)
		if valid {
			for _, expected := range []sourceStagedOperationRequest{parent, roles.ownWriters, roles.prototype} {
				if sameOperationRequest(request, expected) {
					return true
				}
			}
		}
	}
	return false
}

// Mutable detached payloads are copied. Original AST and source occurrence
// associations remain generation-relative and carry no graph delivery state.
func cloneStagedMapContribution(entry *sourceStagedMapEntryContribution) *sourceStagedMapEntryContribution {
	out := *entry
	out.entry = cloneStagedMapEntry(entry.entry)
	if entry.read != nil {
		read := *entry.read
		read.entry = cloneStagedMapEntry(read.entry)
		read.descriptor = cloneSourceRelativeEndpoint(read.descriptor)
		read.bound = cloneSourceRelativeBoundInputs(read.bound)
		out.read = &read
	}
	return &out
}

// Source refinement may fill a previously pending entry read, but cannot swap
// the original group, member, parent request or generation. Fresh graph input
// delivery remains separate from these sealed source descriptions.
func sameStagedMapRecipeSource(a, b sourceStagedOperationRecipe) bool {
	if (a.mapEntry == nil) != (b.mapEntry == nil) || a.mapEntry != nil && (!sameOperationRequest(a.mapEntry.request, b.mapEntry.request) || !sameStagedMapEntry(a.mapEntry.entry, b.mapEntry.entry) || a.mapEntry.generation != b.mapEntry.generation || !sameNativeGetSource(a.mapEntry.source, b.mapEntry.source)) {
		return false
	}
	if a.mapProtocol != nil && b.mapProtocol != nil {
		return a.mapProtocol.generation == b.mapProtocol.generation && sameOperationRequest(a.mapProtocol.request, b.mapProtocol.request)
	}
	// Initial protocol registration is refined by its original source driver.
	return a.mapProtocol == nil || b.mapProtocol == nil
}
