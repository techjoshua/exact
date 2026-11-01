package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
)

// taskDependencyType preserves source checking and portable executable context.
func (lowering *jsxLowering) taskDependencyType(location *ast.Node) *ast.Node {
	return lowering.taskCaptureAnnotation(authoredTaskCaptureType(location, lowering.checker))
}

// taskCaptureAnnotation applies the same lexical policy to freshly authored and
// pre-captured types. Checking retains the full constraint before relocation.
func (lowering *jsxLowering) taskCaptureAnnotation(typeNode *ast.Node) *ast.Node {
	if typeNode != nil && (lowering.checking || portableTaskCaptureType(typeNode)) {
		return typeNode
	}
	// Executable artifacts may relocate, so source-relative or free type names
	// remain owned by the authored checking projection.
	return lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword)
}

// authoredTaskCaptureType records source types before generated dependency reads
// erase them. Callers relocating the result must check its lexical portability.
func authoredTaskCaptureType(location *ast.Node, typeChecker *checker.Checker) *ast.Node {
	if location == nil || typeChecker == nil || ast.NodeIsSynthesized(location) || location.Parent == nil {
		return nil
	}
	value := typeChecker.GetTypeAtLocation(location)
	if value == nil {
		return nil
	}
	if ast.IsParameterDeclaration(location) && location.AsParameterDeclaration().Initializer != nil {
		// Defaults are normalized before work runs. Retain undefined only when the
		// initializer can itself produce it, rather than importing caller optionality.
		initial := typeChecker.GetWidenedLiteralType(typeChecker.GetTypeAtLocation(location.AsParameterDeclaration().Initializer))
		value = typeChecker.GetUnionType([]*checker.Type{typeChecker.RemoveMissingOrUndefinedType(value), initial})
	}
	return typeChecker.TypeToTypeNode(value, location,
		nodebuilder.FlagsNoTruncation|nodebuilder.FlagsInTypeAlias, nil)
}

// taskCallbackParameterType materializes authored callback inference before
// capture erasure can remove it. Recursive contexts need not expand indefinitely.
// The checking projection keeps implicit parameters and rejects missing context.
func (lowering *jsxLowering) taskCallbackParameterType(node *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	if lowering.checking || lowering.checker == nil || !ast.IsParameterDeclaration(node) ||
		node.Type() != nil || node.Parent == nil ||
		(!ast.IsArrowFunction(node.Parent) && !ast.IsFunctionExpression(node.Parent)) ||
		lowering.checker.GetContextualType(node.Parent, checker.ContextFlagsNone) == nil {
		return nil
	}
	typeNode := lowering.taskDependencyType(node)
	parameter := visitor.VisitEachChild(node).AsParameterDeclaration()
	return lowering.factory.UpdateParameterDeclaration(parameter, parameter.Modifiers(),
		parameter.DotDotDotToken, parameter.Name(), parameter.QuestionToken, typeNode, parameter.Initializer)
}

// taskCaptureTypeScope owns only parameters declared inside this annotation.
func taskCaptureTypeScope(node *ast.Node, bound map[string]bool) map[string]bool {
	callable := node.FunctionLikeData()
	if callable == nil || callable.TypeParameters == nil {
		return bound
	}
	parameters := callable.TypeParameters.Nodes
	scope := make(map[string]bool, len(bound)+len(parameters))
	for name := range bound {
		scope[name] = true
	}
	for _, parameter := range parameters {
		scope[parameter.Name().Text()] = true
	}
	return scope
}

// portableTaskCaptureType rejects references owned by the authored module or
// enclosing component. Parameters declared inside the annotation retain their
// lexical scope, so generic callbacks remain contextual without free type names.
func portableTaskCaptureType(typeNode *ast.Node) bool {
	return taskCaptureTypeWithValues(typeNode, nil)
}

// taskCaptureTypeWithValues shares the annotation traversal with the narrowly
// certified mutation lane. A spelling alone never establishes a value binding.
func taskCaptureTypeWithValues(typeNode *ast.Node, valueName func(*ast.Node) bool) bool {
	var visit func(*ast.Node, map[string]bool) bool
	visit = func(node *ast.Node, bound map[string]bool) bool {
		if ast.IsTypeReferenceNode(node) {
			name := node.AsTypeReferenceNode().TypeName
			if !ast.IsIdentifier(name) || !bound[name.Text()] {
				return false
			}
		}
		if ast.IsTypeQueryNode(node) {
			query := node.AsTypeQueryNode()
			if valueName == nil || !ast.IsIdentifier(query.ExprName) ||
				query.TypeArguments != nil && len(query.TypeArguments.Nodes) != 0 || !valueName(query.ExprName) {
				return false
			}
		}
		if ast.IsComputedPropertyName(node) {
			expression := node.AsComputedPropertyName().Expression
			if !ast.IsStringLiteral(expression) && !ast.IsNumericLiteral(expression) {
				if valueName == nil || !ast.IsIdentifier(expression) || !valueName(expression) {
					return false
				}
			}
		}
		if ast.IsImportTypeNode(node) || node.Kind == ast.KindThisType {
			return false
		}
		bound = taskCaptureTypeScope(node, bound)
		return !node.ForEachChild(func(child *ast.Node) bool { return !visit(child, bound) })
	}
	return visit(typeNode, nil)
}

// taskTypeValueReference records a module value while authored lexical parents
// and its checker still agree. No symbol or checker lookup occurs at emission.
type taskTypeValueReference struct {
	name        string
	symbol      ast.SymbolId
	declaration *ast.Node
	sourceFile  *ast.SourceFile
}

// mutationTemporaryLexicalFact is immutable after the mutation fact seal.
// The owner identifies the callable whose local temporary will hold this type.
type mutationTemporaryLexicalFact struct {
	authoredLocation *ast.Node
	authoredOwner    *ast.Node
	authoredBody     *ast.Node
	references       []taskTypeValueReference
}

// taskAnnotationDestination carries only bindings introduced by a reconstructed
// outer owner. Mutation frames separately check their final parameters and body.
type taskAnnotationDestination struct {
	module          *ast.SourceFile
	uniqueParameter *ast.Node
	bindings        []*ast.Node
}

// captureTemporaryLexicalFact admits only same-source module const unique symbols.
// Query and computed-name references are checked by the same annotation traversal.
func (lowering *jsxLowering) captureTemporaryLexicalFact(source, annotation *ast.Node) *mutationTemporaryLexicalFact {
	if portableTaskCaptureType(annotation) || lowering.checker == nil {
		return nil
	}
	fact := &mutationTemporaryLexicalFact{authoredLocation: source}
	for owner := source.Parent; owner != nil; owner = owner.Parent {
		if isCallableNode(owner) {
			fact.authoredOwner = owner
			fact.authoredBody = owner.Body()
			break
		}
	}
	if fact.authoredOwner == nil {
		return nil
	}
	seen := map[string]ast.SymbolId{}
	valid := taskCaptureTypeWithValues(annotation, func(name *ast.Node) bool {
		symbol := lowering.checker.ResolveName(name.Text(), source, ast.SymbolFlagsValue, false)
		if symbol == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
			return false
		}
		declaration := symbol.ValueDeclaration
		if !ast.IsIdentifier(declaration.Name()) || declaration.Parent == nil ||
			!ast.IsVariableDeclarationList(declaration.Parent) || declaration.Parent.Flags&ast.NodeFlagsConst == 0 ||
			declaration.Parent.Parent == nil || !ast.IsVariableStatement(declaration.Parent.Parent) ||
			declaration.Parent.Parent.Parent != lowering.sourceFile.AsNode() ||
			lowering.checker.GetSymbolAtLocation(declaration.Name()) != symbol ||
			lowering.checker.GetTypeAtLocation(declaration.Name()).Flags()&checker.TypeFlagsUniqueESSymbol == 0 {
			return false
		}
		id := ast.GetSymbolId(symbol)
		if previous, exists := seen[name.Text()]; exists {
			return previous == id
		}
		seen[name.Text()] = id
		fact.references = append(fact.references, taskTypeValueReference{name: name.Text(), symbol: id, declaration: declaration, sourceFile: lowering.sourceFile})
		return true
	})
	if !valid || len(fact.references) == 0 {
		return nil
	}
	return fact
}

// mutationLexicalTypeAvailable checks the actual frame and reconstructed outer
// bindings after lowering has finalized their names. It never trusts source text
// or the absence of a checker error as a destination identity certificate.
func (lowering *jsxLowering) mutationLexicalTypeAvailable(fact *mutationTemporaryLexicalFact, frame *mutationFrame, work *ast.Node) bool {
	if fact == nil || frame.work == nil || work == nil || !isCallableNode(work) {
		return false
	}
	original := frame.work
	authoredOwner := fact.authoredOwner
	if lowering.emitContext != nil {
		original = lowering.emitContext.MostOriginal(original)
		authoredOwner = lowering.emitContext.MostOriginal(authoredOwner)
	}
	// functionTaskWork reconstructs an arrow with the exact authored body but
	// no original-node link. Body identity is its existing private handoff.
	if original != authoredOwner && frame.work.Body() != fact.authoredBody {
		return false
	}
	destination := frame.annotationDestination
	if destination != nil && destination.module != lowering.sourceFile {
		return false
	}
	for _, reference := range fact.references {
		if reference.sourceFile != lowering.sourceFile {
			return false
		}
		if destination != nil {
			for _, binding := range destination.bindings {
				for _, name := range bindingIdentifiers(binding.Name()) {
					// Only the exact private parameter with printer-owned unique-name
					// metadata can share an authored value's textual base name.
					if name == destination.uniqueParameter && lowering.emitContext != nil {
						if info := lowering.emitContext.GetAutoGenerateInfo(name); info != nil && info.Flags.IsUnique() {
							continue
						}
					}
					if name.Text() == reference.name {
						return false
					}
				}
			}
		}
		for _, parameter := range work.Parameters() {
			for _, name := range bindingIdentifiers(parameter.Name()) {
				if name.Text() == reference.name {
					return false
				}
			}
		}
		if work.Name() != nil && work.Name().Text() == reference.name {
			return false
		}
		if normalizationHoistedDeclaration(work, reference.name) != nil {
			return false
		}
		if work.Body() != nil && ast.IsBlock(work.Body()) {
			for _, statement := range work.Body().AsBlock().Statements.Nodes {
				if ast.IsVariableStatement(statement) {
					for _, declaration := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
						for _, name := range bindingIdentifiers(declaration.Name()) {
							if name.Text() == reference.name {
								return false
							}
						}
					}
				} else if (ast.IsFunctionDeclaration(statement) || ast.IsClassDeclaration(statement)) &&
					statement.Name() != nil && statement.Name().Text() == reference.name {
					return false
				}
			}
		}
	}
	return true
}
