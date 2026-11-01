package exactcompiler

// acquireLanguageOwner binds publication to final generation cleanup without
// retaining the checker, project or activation in a receipt. Standalone legacy
// owners have no publication namespace. Temporary lease suspension stays live.
func (generation *projectGeneration) acquireLanguageOwner() *languageOwner {
	if generation == nil || !generation.active || generation.project == nil || generation.project.abandoned {
		return nil
	}
	owner := newLanguageOwner()
	generation.languageOwners = append(generation.languageOwners, owner)
	return owner
}

// releaseLanguageOwners fences retained receipts on final release or abandon.
// Dropping the registry preserves immutable history without retaining namespaces.
func (generation *projectGeneration) releaseLanguageOwners() {
	for _, owner := range generation.languageOwners {
		owner.dispose()
	}
	generation.languageOwners = nil
}
