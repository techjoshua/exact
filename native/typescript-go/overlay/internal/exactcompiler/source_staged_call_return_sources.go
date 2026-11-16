package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedCallReturnPlan transports conditional original return sources.
// Exact supplied association pointers survive for separate current-facts
// admission. Neither the plan nor its branch inventory proves normal return.
type sourceStagedCallReturnPlan struct {
	call                   sourceStagedDeclarationCall
	declaration, operation *ast.Node
	branches               []sourceStagedCallReturnBranch
}

type sourceStagedCallReturnBranch struct {
	returning, binding *ast.Node
	endpoint           sourceRelativeEndpoint
	captures           []sourceRelativeRole
	pending            bool
}

// describeStagedCallReturnSources reads only the original summary's return
// inventory. It never acquires output, binds inputs, reconstructs a scope or
// substitutes an invoked role for dormant data. True validates association
// only, including when no explicit return sources were inventoried.
func describeStagedCallReturnSources(call sourceStagedDeclarationCall, owner *executableBodyOwner) (sourceStagedCallReturnPlan, bool) {
	return describeStagedCallReturnSourcesForPurpose(call, owner, nil)
}

// The Set SOURCE owner supplies its original consumer, never a creating scope.
// The ordinary DATA entry above keeps its narrower declaration/capture domain.
func describeStagedCallReturnSourcesForPurpose(call sourceStagedDeclarationCall, owner *executableBodyOwner, setOwner *ast.Node) (sourceStagedCallReturnPlan, bool) {
	var plan sourceStagedCallReturnPlan
	declaration, operation := call.invocation.declaration, call.invocation.operation
	if owner == nil || owner.values == nil || owner.checker == nil || owner.values.program == nil || declaration == nil || !ast.IsFunctionDeclaration(declaration) && !ast.IsGetAccessorDeclaration(declaration) || declaration.Body() == nil || operation == nil || !stagedResultExpression(operation) || ast.IsCallExpression(operation) && !ast.IsIdentifier(operation.Expression()) || !validStagedDataResultCall(call) || call.inputs != nil && call.sourceInputs != nil {
		return plan, false
	}
	file := ast.GetSourceFileOfNode(declaration)
	if file == nil || file.IsDeclarationFile || standardLibrarySource(file) || !ast.IsExternalModule(file) || ast.IsFunctionDeclaration(declaration) && declaration.Parent != file.AsNode() && (setOwner == nil || !stagedDeclarationEffectsOwner(declaration, setOwner) || enclosingCallableNode(operation) != setOwner) || ast.GetSourceFileOfNode(operation) != file || owner.values.program.GetSourceFile(file.FileName()) != file {
		return plan, false
	}
	if async, ordinary := ordinaryResultCategory(declaration); async || !ordinary {
		return plan, false
	}
	if !originalStagedGetterCall(call) {
		symbol, implementation := stagedLexicalFunctionImplementation(operation.Expression(), owner)
		if symbol == nil || implementation != declaration || owner.values.bindingWritten(symbol) {
			return plan, false
		}
	}
	index := owner.values.index(file)
	if index.incomplete || index.normalDynamicScope {
		return plan, false
	}
	var cut sourceRelativeCut
	if edge := call.inputs; edge != nil {
		if !edge.delivered || edge.request.declaration != declaration || edge.request.operation != operation || !sameSourceRelativeVector(call.invocation, edge.request) || !sameSourceRelativeInputEnvelope(edge.request, edge.bound) || !sameSourceRelativeInputEnvelope(edge.request, edge.relative) || edge.request.cut != (sourceRelativeCut{operation: operation, use: edge.request.use, reading: operation}) {
			return plan, false
		}
		cut = edge.relative.cut
	} else if source := call.sourceInputs; source != nil {
		if !sameSourceRelativeInvocation(call.invocation, source.invocation) || !sameSourceRelativeInputEnvelope(source.invocation, source.bindings) {
			return plan, false
		}
		cut = source.invocation.cut
	} else {
		return plan, false
	}
	plan = sourceStagedCallReturnPlan{call: call, declaration: declaration, operation: operation}
	plan.call.invocation = cloneStagedWriterInvocation(call.invocation)
	var templates []sourceStagedReturnTemplate
	templatesReady := false
	for _, site := range owner.values.summary(declaration).returnSites {
		expression := site
		if ast.IsReturnStatement(site) {
			expression = site.Expression()
		}
		branch := sourceStagedCallReturnBranch{returning: site, endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: expression, producer: declaration, creation: operation, returning: site, cut: cut}}
		if expression == nil {
			branch.endpoint.kind = relativeEndpointUndefined
			plan.branches = append(plan.branches, branch)
			continue
		}
		value := unwrapSourceCallableReference(expression)
		switch {
		case ast.IsIdentifier(value):
			selected := owner.checker.GetSymbolAtLocation(value)
			branch.pending = true
			if selected != nil && selected.ValueDeclaration != nil {
				branch.binding = selected.ValueDeclaration
				parameter := selected.ValueDeclaration
				if setOwner != nil && ast.IsVariableDeclaration(parameter) && enclosingCallableNode(parameter) == setOwner && parameter.Initializer() != nil && !owner.values.bindingWritten(selected) && !capturedBindingMutated(selected, owner) {
					branch.endpoint.producer = parameter
					branch.endpoint.get = value
					branch.pending = false // SOURCE binding/read only; no literal DATA or scope.
				}
				if originalStagedGetterCall(call) {
					// This Get B supplies receiver context. Only its separately
					// described lexical source binding can carry captured DATA.
					capture := sourceRelativeRole{kind: relativeRoleCapture, declaration: declaration, binding: parameter}
					formal, mapped := fieldGetterCaptureFormal(capture, enclosingCallableNode(declaration.Parent), owner)
					if mapped {
						for _, binding := range call.inputs.relative.bindings {
							if binding.target != capture || binding.unknown || len(binding.pending) != 0 || len(binding.sources) != 1 {
								continue
							}
							source := binding.sources[0]
							if source.kind == relativeEndpointRole && source.role == formal && source.producer == operation && source.get == operation && source.cut == call.inputs.relative.cut && len(source.projection) == 0 {
								branch.endpoint.kind, branch.endpoint.role, branch.pending = relativeEndpointRole, capture, false
							}
						}
					}
				}
				if ast.IsParameterDeclaration(parameter) && enclosingCallableNode(parameter) == declaration && !owner.values.bindingWritten(selected) && (parameter.Initializer() == nil || stagedLexicalDefaultFunction(parameter, declaration, owner.values) != nil) && parameter.AsParameterDeclaration().DotDotDotToken == nil {
					position := 0
					for _, formal := range declaration.Parameters() {
						if ast.IsIdentifier(formal.Name()) && formal.Name().Text() == "this" {
							continue
						}
						if formal == parameter {
							branch.endpoint.kind = relativeEndpointRole
							branch.endpoint.role = sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: position}
							branch.pending = false
							break
						}
						position++
					}
				}
			}
		case ast.IsArrowFunction(value) || ast.IsFunctionExpression(value):
			if !templatesReady {
				templates = describeStagedReturnTemplates(declaration, owner.values)
				templatesReady = true
			}
			branch.pending = true
			for _, template := range templates {
				if template.returning == site && template.callable == value {
					branch.captures = append([]sourceRelativeRole(nil), template.captures...)
					branch.pending = template.unknown || len(template.captures) != 0
					break
				}
			}
		default:
			branch.pending = !(sourceInertValueCreation(value) || stagedEmptyArrayDataConstruction(value)) || stagedCallReturnLiteralHasCapture(value, owner.values)
		}
		branch.endpoint = cloneSourceRelativeEndpoint(branch.endpoint)
		plan.branches = append(plan.branches, branch)
	}
	return plan, true
}

// Inert construction does not complete a literal's deferred captures. This
// predicate names only external checker bindings/lexical receivers. It does
// not recover values, enumerate writes or evaluate the stored bodies.
func stagedCallReturnLiteralHasCapture(literal *ast.Node, owner *sourceValueOwner) bool {
	captured := false
	walkNode(literal, func(node *ast.Node) bool {
		if ast.IsPartOfTypeNode(node) {
			return false
		}
		if node.Kind == ast.KindThisKeyword {
			lexical := enclosingCallableNode(node)
			for lexical != nil && ast.IsArrowFunction(lexical) {
				lexical = enclosingCallableNode(lexical.Parent)
			}
			if lexical != nil && !literal.Contains(lexical) {
				captured = true
			}
		} else if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) && !isStaticPropertyName(node) {
			symbol := owner.checker.GetSymbolAtLocation(node)
			if owner.checker.IsUndefinedSymbol(symbol) {
				return true
			}
			if symbol == nil || symbol.ValueDeclaration == nil {
				captured = true
				return false
			}
			binding := symbol.ValueDeclaration
			file := ast.GetSourceFileOfNode(binding)
			if !literal.Contains(binding) && file != nil && !file.IsDeclarationFile {
				captured = true
			}
		}
		return !captured
	})
	return captured
}
