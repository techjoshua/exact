package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

type sourceDependencyState uint8

const (
	sourceDependencyAvailable sourceDependencyState = iota
	sourceDependencyErased
	sourceDependencyReferencesUnavailable
	sourceDependencyExecutableUnavailable
)

// operationDependency resolves one actual syntax edge without enumerating Program
// files or granting execution to a deferred body. Explicit host selection wins.
// A declaration-only edge is unresolved executable input, not an empty initializer.
// This result supplies source references only, never builtin integrity or purity.
func (query *sourceValueQuery) operationDependency(slot *ast.Node, result *accessorCandidates) (*ast.SourceFile, bool) {
	source, state := query.operationDependencyState(slot, result)
	return source, state == sourceDependencyAvailable
}

// operationDependencyState preserves an explicitly opaque selected executable
// edge separately from unavailable may-reference inventory behind an ordinary
// declaration. Neither supplies a known empty initializer. Legacy consumers keep
// refusing both. Native scalar effects need no missing then/return inventory.
func (query *sourceValueQuery) operationDependencyState(slot *ast.Node, result *accessorCandidates) (*ast.SourceFile, sourceDependencyState) {
	if slot == nil || !query.charge(result, slot) {
		return nil, sourceDependencyExecutableUnavailable
	}
	owner := query.executable
	if owner != nil {
		if source, owned := owner.selectedModule(slot); owned {
			if source == nil {
				return nil, sourceDependencyExecutableUnavailable
			}
			return source, sourceDependencyAvailable
		}
	}
	if query.dependencyEdgeErased(slot) {
		return nil, sourceDependencyErased
	}
	reference, _ := executableDeclarationReference(slot)
	if reference == nil || !ast.IsStringLiteralLike(reference) {
		return nil, sourceDependencyExecutableUnavailable
	}
	if owner != nil && owner.project != nil {
		resolved := owner.project.program.GetResolvedModuleFromModuleSpecifier(ast.GetSourceFileOfNode(slot), reference)
		if resolved != nil && resolved.IsResolved() {
			source := owner.project.program.GetSourceFile(resolved.ResolvedFileName)
			if source != nil && !source.IsDeclarationFile {
				return source, sourceDependencyAvailable
			}
			if source != nil && source.IsDeclarationFile {
				return nil, sourceDependencyReferencesUnavailable
			}
			return nil, sourceDependencyExecutableUnavailable
		}
	}
	// A checker-bound physical source is the existing ordinary-resolution route.
	// It cannot select a runtime body behind an authored declaration-only package.
	if symbol := query.owner.checker.GetSymbolAtLocation(reference); symbol != nil {
		if source := moduleSourceFile(symbol); source != nil {
			if source.IsDeclarationFile {
				return nil, sourceDependencyReferencesUnavailable
			}
			return source, sourceDependencyAvailable
		}
	}
	return nil, sourceDependencyExecutableUnavailable
}
