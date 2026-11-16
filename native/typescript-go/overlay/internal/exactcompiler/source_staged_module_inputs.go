package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedModuleInput names a host-selected source binding dependency. It
// supplies availability/initialization membership, never an imported value or
// permission to replay an initializer. Execution Effects stay on the module fact
// rather than being copied into a definition that merely references its binding.
type sourceStagedModuleInput struct {
	reference, importEdge, declaration *ast.Node
}

// stagedModuleInputRead authenticates the actual import edge and checker binding
// against the existing executable selection. Declaration-only, erased, barrel
// identity and unavailable-source gaps stay pending instead of an empty module.
func (work *callableEffectWork) stagedModuleInputRead(facts []callableFacts, source *sourceStagedNativeGetSource, expression *ast.Node, owner *executableBodyOwner) bool {
	if expression == nil || !ast.IsIdentifier(expression) || source == nil || owner == nil || owner.values == nil {
		return false
	}
	symbol := owner.checker.GetSymbolAtLocation(expression)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias == 0 || owner.values.bindingWritten(symbol) {
		return false
	}
	canonical := owner.checker.GetAliasedSymbol(symbol)
	if canonical == nil || canonical.ValueDeclaration == nil || !ast.IsVariableDeclaration(canonical.ValueDeclaration) || owner.values.bindingWritten(canonical) {
		return false
	}
	declaration := canonical.ValueDeclaration
	file := ast.GetSourceFileOfNode(declaration)
	if file == nil || file.IsDeclarationFile || declaration.Initializer() == nil {
		return false
	}
	target := sourceStagedModuleOwner(declaration.Initializer())
	if target == nil || !runtimeModuleEvaluation(target) {
		return false
	}
	query := newSourceDependencyQuery(expression, owner.checker, owner, source.request.consumer)
	defer query.publishDependencyStatistics()
	for _, binding := range symbol.Declarations {
		for edge := binding; edge != nil && !ast.IsSourceFile(edge); edge = edge.Parent {
			if !ast.IsImportDeclaration(edge) {
				continue
			}
			result := accessorCandidates{}
			selected, state := query.operationDependencyState(edge, &result)
			if state != sourceDependencyAvailable || selected != file || result.opaque {
				return false
			}
			input := sourceStagedModuleInput{reference: expression, importEdge: edge, declaration: target}
			for _, prior := range source.moduleSources {
				if prior == input {
					return true
				}
			}
			source.moduleSources = append(source.moduleSources, input)
			return true
		}
	}
	return false
}

// stagedCreationInputEffects follows expression construction without acquiring
// its result. Imports contribute real selected module requirements. Computed
// names are handled by the separate key consumer, not by a primitive type test.
func (work *callableEffectWork) stagedCreationInputEffects(facts []callableFacts, source *sourceStagedNativeGetSource, expression *ast.Node, owner *executableBodyOwner) bool {
	if expression == nil {
		return false
	}
	if stagedLiteralInputEffects(expression, owner) {
		return true
	}
	if ast.IsIdentifier(expression) {
		return work.stagedModuleInputRead(facts, source, expression, owner)
	}
	if expression == nil || !ast.IsObjectLiteralExpression(expression) {
		return false
	}
	complete := true
	for _, member := range expression.AsObjectLiteralExpression().Properties.Nodes {
		if member.Name() == nil || ast.IsComputedPropertyName(member.Name()) || ast.IsSpreadAssignment(member) {
			complete = false
			continue
		}
		switch {
		case ast.IsPropertyAssignment(member):
			complete = work.stagedCreationInputEffects(facts, source, member.AsPropertyAssignment().Initializer, owner) && complete
		case ast.IsShorthandPropertyAssignment(member):
			complete = member.AsShorthandPropertyAssignment().ObjectAssignmentInitializer == nil && work.stagedCreationInputEffects(facts, source, member.Name(), owner) && complete
		case ast.IsMethodDeclaration(member), ast.IsGetAccessorDeclaration(member), ast.IsSetAccessorDeclaration(member):
		default:
			complete = false
		}
	}
	return complete
}

func (work *callableEffectWork) registerNativeModuleInputs(facts []callableFacts, id sourceStagedOperationID) {
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	var activationImports []sourceStagedActivationImport
	var activationRequest sourceStagedOperationRequest
	if recipe.nativeGet != nil && state.key.selector.field == "callee-get" {
		activationImports, activationRequest = recipe.nativeGet.activationImports, recipe.nativeGet.request
	} else if recipe.memberSource != nil && recipe.memberSource.moduleExcluded != nil {
		activationImports, activationRequest = recipe.memberSource.moduleImports, recipe.memberSource.parent
	} else if recipe.entryLaw != nil {
		if proof := work.entryLawReceipts[state.key]; proof != nil && proof.prefix != nil {
			activationImports, activationRequest = proof.imports, proof.prefix.source.request
		}
	}
	if len(activationImports) != 0 && len(state.moduleInputs) == 0 {
		consumer, known := work.memberNodes[activationRequest.consumer]
		if !known {
			state.invalid = true
			return
		}
		for _, input := range activationImports {
			if input.edge == nil || !runtimeModuleEvaluation(input.declaration) {
				state.invalid = true
				return
			}
			edge := fmt.Sprintf("%s:module-activation:%s:%d", activationRequest.edge, ast.GetSourceFileOfNode(input.declaration).FileName(), input.declaration.Pos())
			work.registerOperationModuleInput(facts, id, consumer, input.declaration, edge, activationRequest)
		}
		return
	}
	if recipe.nativeGet == nil || state.key.selector.field != "eager-inputs" || len(recipe.nativeGet.moduleSources) == 0 || len(state.moduleInputs) != 0 {
		return
	}
	source := recipe.nativeGet
	consumer, known := work.memberNodes[source.request.consumer]
	if !known {
		state.invalid = true
		return
	}
	for _, input := range source.moduleSources {
		if input.reference == nil || input.importEdge == nil || !runtimeModuleEvaluation(input.declaration) || ast.GetSourceFileOfNode(input.reference) != facts[consumer].sourceFile {
			state.invalid = true
			return
		}
		edge := fmt.Sprintf("%s:module-input:%d:%d", source.request.edge, input.reference.Pos(), input.declaration.Pos())
		work.registerOperationModuleInput(facts, id, consumer, input.declaration, edge, source.request)
	}
}

// A per-file graph may encounter an authenticated import before the project
// merge registers its initializer. Preserve that original declaration rather
// than poisoning the local producer. Publication still requires real delivery.
func (work *callableEffectWork) registerOperationModuleInput(facts []callableFacts, id sourceStagedOperationID, consumer int, declaration *ast.Node, edge string, request sourceStagedOperationRequest) {
	producer, bound := work.memberNodes[declaration]
	if !bound {
		if ast.GetSourceFileOfNode(declaration) == facts[consumer].sourceFile {
			work.operations[id.index].invalid = true
			return
		}
		producer = -1
	} else {
		work.requireSourceModuleAvailability(facts, consumer, producer, edge, request.producer.operation, request.cut)
	}
	work.operations[id.index].moduleInputs = append(work.operations[id.index].moduleInputs, sourceStagedModuleRequirement{producer: producer, edge: edge, declaration: declaration})
	work.indexEntryLawModuleInput(id, consumer, sourceStagedModuleRequirement{producer: producer, edge: edge, declaration: declaration}, request)
	if n := work.nativeCapabilityNotifications; n != nil {
		for _, watch := range n.eagerOwners[work.operations[id.index].key] {
			m := sourceStagedDependencyKey{consumer, edge}
			n.eagerModules[m] = appendNativeEagerWatch(n.eagerModules[m], watch)
		}
		for key := range n.operations[work.operations[id.index].key] {
			work.indexNativeCapabilityModule(sourceStagedDependencyKey{consumer, edge}, key)
		}
	}
}
