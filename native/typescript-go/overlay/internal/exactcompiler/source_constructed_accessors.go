package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceConstructedMemberDemand keeps the constructor source and its member
// observation together without creating an instance or a descriptor proof.
type sourceConstructedMemberDemand struct {
	source     *ast.Node
	projection []string
	name       string
	mode       accessorTraversal
	reference  *sourceGetReference
}

// visitConstructedAccessor resolves member effects of source constructor results.
// Structural result types cannot account for foreign or Proxy Get/Set effects.
func (query *sourceValueQuery) visitConstructedAccessor(demand sourceConstructedMemberDemand, arguments sourceValueBindings, result *accessorCandidates, visit func(*ast.Node, []string, bool), visitOrigins func([]sourceValue, []string, bool)) {
	value, projection, name, mode := demand.source, demand.projection, demand.name, demand.mode

	if query.dependenciesOnly {
		if len(projection) > 0 || name != "" || demand.reference != nil || (mode == accessorEnumerate || mode == accessorEnumerateEntries) {
			query.sourceProxyGetDependencies(value, projection, name, mode, arguments, result, demand.reference)
		}
	} else if (len(projection) > 0 || name != "") && query.possibleProxyGetEffects(value, projection, name, mode, arguments, result) {
		return
	}
	// A structural array type can revoke completeness, never prove native identity.
	if len(projection) > 0 && query.owner.checker.IsArrayLikeType(query.owner.checker.GetTypeAtLocation(value)) {
		result.opaque = true
	}
	if query.dependenciesOnly {
		// Only a reached original New may have supplied this contribution. The
		// ordinary source constructor/Proxy alternatives below remain independent.
		transferStart := len(result.memberHandoffs().standardMemberTransfers)
		if query.standardConstructionMember(demand, arguments, result, visit, visitOrigins) {
			return // Original standard Set source; no normal constructor output.
		}
		var selected *sourcePreparedInvocation
		var completionBindings sourceValueBindings
		if mode == accessorSet|accessorNoGet && query.directConstructionSetAt(value) {
			// The New selected its callee before entering this constructor.
			// Keep the original alternatives. Prototype and writer lookup below
			// still use the live Set cut and its own current bindings.
			frame := query.constructionSetterWrites
			prior := frame.selection
			if len(prior.declarations) == 1 && prior.declarations[0] == frame.constructor.declaration.Parent &&
				!prior.base.valueIncomplete && !prior.acquired.opaque && !prior.acquired.receiverIncomplete {
				selected = prior
				completionBindings = query.acquireCallableScope(arguments, result).bindings
			}
		}
		if selected == nil {
			selected = query.selectSourceConstruction(value, arguments, result)
			completionBindings = selected.scope.bindings
		}
		known := false
		transferComplete := len(selected.declarations) == 0 // authored constructor alternatives keep original recovery
		for _, alternative := range selected.acquired.values {
			if alternative.native != nil && alternative.native.kind != sourceNativeWeakMapConstructor {
				transferComplete = false
			}
		}
		for _, target := range selected.declarations {
			if !ast.IsClassDeclaration(target) && !ast.IsClassExpression(target) {
				// A function constructor can replace its instance with an object
				// whose later Get is independent of constructor body effects.
				if sourceFunctionConstructible(target) {
					transferComplete = false
					result.opaque, result.receiverIncomplete = true, true
				}
				continue
			}
			known = true
			if !query.sourceConstructionFieldReceiver(value, target) && !query.sourceConstructionFieldsMayComplete(target, completionBindings) {
				transferComplete = false
				result.valueIncomplete = true
				continue
			}
			if constructor := ast.GetFirstConstructorWithBody(target); constructor != nil && len(query.owner.summary(constructor).returns) > 0 {
				transferComplete = false
				// Constructor-return replacement has not established this result's
				// lookup owner. Retain actual Get uncertainty beside known donors.
				result.opaque, result.receiverIncomplete = true, true
			}
			visit(target, projection, true)
		}
		if !known || selected.base.valueIncomplete {
			result.opaque, result.receiverIncomplete = true, true
		}
		finishStandardConstructionGet(result, transferStart, value, transferComplete)
		return
	}
	sourceInstance := false
	if definition, selected := query.executable.definition(value.AsNewExpression().Expression); selected {
		result.selected = true
		if definition == nil {
			result.opaque = true
		} else {
			sourceInstance = (ast.IsClassDeclaration(definition) || ast.IsClassExpression(definition)) && !ast.GetSourceFileOfNode(definition).IsDeclarationFile
			visit(definition, projection, true)
		}
		if !sourceInstance && (len(projection) > 0 || name != "") {
			result.receiverIncomplete = true
			result.opaque = true
		}
		return
	}
	symbol := sourceCallableReferenceSymbol(value.AsNewExpression().Expression, query.owner.checker)
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = query.sourceAlias(symbol, result)
	}
	if symbol != nil {
		if argument, exists := arguments[ast.GetSymbolId(symbol)]; exists {
			visitOrigins(argument, projection, true)
		}
		for _, declaration := range symbol.Declarations {
			if ast.IsClassDeclaration(declaration) {
				sourceInstance = !ast.GetSourceFileOfNode(declaration).IsDeclarationFile
				visit(declaration, projection, true)
			}
			if ast.IsVariableDeclaration(declaration) {
				initializer := unwrapSourceCallableReference(declaration.Initializer())
				sourceInstance = sourceInstance || initializer != nil && ast.IsClassExpression(initializer) && !ast.GetSourceFileOfNode(initializer).IsDeclarationFile
				visit(declaration.AsVariableDeclaration().Initializer, projection, true)
			}
		}
	}
	// An unmodeled constructor result may be a Proxy or foreign object.
	// Structural callable/member types do not account for its Get/Set effects.
	if !sourceInstance && (len(projection) > 0 || name != "") {
		result.receiverIncomplete = true
		result.opaque = true
		// An unmodeled callable constructor result may be a Proxy. Its
		// compatible Function methods cannot discharge real Get/trap
		// effects. This withholds authority, never asserts native identity.
		if nativeFunctionInvocation(value, "call", query.owner.checker) {
			result.opaque = true
			result.cause = value
		}
	}
	return

}

// visitImportedPrototypeWriters contributes eager, selected module descriptors
// on the class's prototype to an actual instance Set. The New and its executable
// dependencies delimit the source's placement. The descriptor owner retains
// ordering, evaluation effects and unresolved alternatives.
func (q *sourceValueQuery) visitImportedPrototypeWriters(class, site *ast.Node, projection []string, name string, result *accessorCandidates, yield func(*ast.Node)) {
	if len(projection) > 1 || len(projection) == 1 && name != "" {
		return
	}
	if len(projection) == 1 {
		name = projection[0]
	}
	root := ast.GetSourceFileOfNode(site)
	if root == nil {
		return
	}
	index := q.owner.index(root)
	if len(index.runtimeImports) == 0 {
		return
	}
	classSource := ast.GetSourceFileOfNode(class)
	seen := map[*ast.SourceFile]bool{root: true}
	var visit func(sourceValueIndex)
	visit = func(index sourceValueIndex) {
		for _, edge := range index.runtimeImports {
			dependency, state := q.operationDependencyState(edge, result)
			if state != sourceDependencyAvailable || dependency == nil || seen[dependency] {
				continue
			}
			seen[dependency] = true
			producer := q.owner.index(dependency)
			visit(producer)
			if dependency == classSource {
				continue
			}
			region := producer.operationRegions[nil]
			if region == nil {
				continue
			}
			for _, member := range region.calls {
				if q.matchesImportedPrototypeWriter(member, class, name, result) {
					yield(member)
				}
			}
		}
	}
	visit(index)
}

// matchesImportedPrototypeWriter admits direct class-prototype targets before
// the descriptor owner reads its inputs. Both the class and key constrain this
// extra module search, so an unrelated imported setter supplies no candidate.
func (q *sourceValueQuery) matchesImportedPrototypeWriter(operation, class *ast.Node, name string, result *accessorCandidates) bool {
	if !q.charge(result, operation) || !q.descriptorWriterCall(operation.AsCallExpression()) {
		return false
	}
	arguments := restrictedInvocationArguments(operation.AsCallExpression())
	key := sourceLiteralMemberName(unwrapSourceCallableReference(arguments[1]))
	if key != "" && name != "" && key != name {
		return false
	}
	target := unwrapSourceCallableReference(arguments[0])
	if target == nil || !ast.IsPropertyAccessExpression(target) && !ast.IsElementAccessExpression(target) {
		return false
	}
	receiver, slot := accessorReceiver(target)
	if slot != "prototype" {
		return false
	}
	expression := unwrapSourceCallableReference(receiver)
	if selected, owned := q.executable.definition(expression); owned {
		return selected == class
	}
	symbol := resolvedCallableSymbol(sourceCallableReferenceSymbol(expression, q.owner.checker), q.owner.checker)
	if symbol == nil {
		return false
	}
	declaration := symbol.ValueDeclaration
	if declaration != nil && ast.IsVariableDeclaration(declaration) {
		declaration = unwrapSourceCallableReference(declaration.Initializer())
	}
	return declaration == class
}
