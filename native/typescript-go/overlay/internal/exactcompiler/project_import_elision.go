package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// importElisionReceipt uses the concrete project's ordinary primary checker.
// Session serialization permits a synchronous resolver-only suspension. It is
// unavailable after final close, during lowering, or to an unowned checker.
// Ordinary inventory work and index publication remain outside this method.
func (generation *projectGeneration) importElisionReceipt(source *ast.SourceFile, imports []*ast.Node) (map[*ast.Node]bool, bool) {
	if !generation.canPrepareImportElision(source) {
		return nil, false
	}
	if source.IsDeclarationFile || generation.program.Options().VerbatimModuleSyntax.IsTrue() || ast.IsInJSFile(source.AsNode()) {
		return nil, true
	}
	resolver := generation.checker.GetEmitResolver()
	if resolver == nil {
		return nil, false
	}
	// Retain only local decisions until every resolver operation and lease
	// restoration succeeds. The guard on the owning index remains installed.
	completed := false
	generation.leaseRelease()
	generation.leaseRelease = nil
	defer func() { generation.restoreImportPreparation(completed) }()
	resolver.MarkLinkedReferencesRecursively(source)
	erased := make(map[*ast.Node]bool)
	for _, slot := range imports {
		if emittedImportDeclarationErased(slot, resolver) {
			erased[slot] = true
		}
	}
	completed = true
	return erased, true
}

func (generation *projectGeneration) canPrepareImportElision(source *ast.SourceFile) bool {
	return generation != nil && generation.active && generation.prepareImports && generation.leaseRelease != nil &&
		generation.project != nil && !generation.project.abandoned && generation.project.activeGeneration == generation &&
		generation.project.program == generation.program && source != nil && generation.checker != nil &&
		generation.program.GetSourceFile(source.FileName()) == source && ast.IsParseTreeNode(source.AsNode())
}

// restoreImportPreparation is also the narrow exceptional-cleanup test seam.
// Resolver methods unlock on panic. Reacquisition precedes any publication or
// ordinary checker work, but cannot roll back their partial mutations.
func (generation *projectGeneration) restoreImportPreparation(completed bool) {
	checker, release := generation.program.GetCheckerPool().GetChecker(generation.ctx, nil)
	if checker != generation.checker {
		release()
		generation.abandon()
		panic("import reference preparation changed primary checker")
	}
	generation.leaseRelease = release
	if !completed {
		generation.abandon()
	}
}

// abandon prevents a recovered failed request from retaining partially marked
// checker state. Final close still releases its restored current acquisition.
func (generation *projectGeneration) abandon() {
	generation.prepareImports = false
	generation.releaseLanguageOwners()
	if generation.project != nil && generation.project.program == generation.program {
		generation.project.abandoned = true
		generation.project.invalidateAnalysisCaches()
	}
}
