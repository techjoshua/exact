package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedLexicalDefaultFunction bounds the SOURCE default domain to an immutable
// same-module function reference. Reading that reference does not invoke its
// body or certify normal completion. Calls, Gets and computed defaults retain
// their original, currently unmigrated initializer owners.
func stagedLexicalDefaultFunction(parameter, declaration *ast.Node, owner *sourceValueOwner) *ast.Node {
	if owner == nil || owner.checker == nil || owner.program == nil || parameter == nil || declaration == nil || !ast.IsParameterDeclaration(parameter) || enclosingCallableNode(parameter) != declaration || !ast.IsIdentifier(parameter.Name()) || parameter.AsParameterDeclaration().DotDotDotToken != nil {
		return nil
	}
	initializer := parameter.Initializer()
	if initializer == nil || !ast.IsIdentifier(initializer) {
		return nil
	}
	file := ast.GetSourceFileOfNode(declaration)
	if file == nil || file.IsDeclarationFile || !ast.IsExternalModule(file) || owner.program.GetSourceFile(file.FileName()) != file {
		return nil
	}
	index := owner.index(file)
	symbol := owner.checker.GetSymbolAtLocation(initializer)
	if index.incomplete || index.normalDynamicScope || symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || owner.bindingWritten(symbol) {
		return nil
	}
	function := symbol.ValueDeclaration
	if !ast.IsFunctionDeclaration(function) || function.Body() == nil || function.Parent != file.AsNode() || ast.GetCombinedModifierFlags(function)&ast.ModifierFlagsAmbient != 0 || len(function.Parameters()) != 0 || stagedCallbackNeedsReceiver(function) {
		return nil
	}
	async, ordinary := ordinaryResultCategory(function)
	if async || !ordinary {
		return nil
	}
	return function
}

func stagedLexicalDefaultDeclaration(declaration *ast.Node, owner *sourceValueOwner) bool {
	if declaration == nil || !ast.IsFunctionDeclaration(declaration) {
		return false
	}
	found := false
	for _, parameter := range declaration.Parameters() {
		if parameter.Initializer() != nil {
			if stagedLexicalDefaultFunction(parameter, declaration, owner) == nil {
				return false
			}
			found = true
		}
	}
	return found
}

// planStagedLexicalDefaultInputs consumes one original delivered binder. It
// never selects a default from syntax: activation and the default donor must
// already be present in the detached binding event. Ordered reducer slots avoid
// repeated binding scans. Caller roles remain roles,
// independently of the binder's optional value precision.
func planStagedLexicalDefaultInputs(invocation sourceRelativeInvocation, bound sourceRelativeBoundInputs, owner *sourceValueOwner) sourceRelativeInputPlan {
	plan := sourceRelativeInputPlan{unsupported: relativeInputsUnsupportedDefault}
	declaration := invocation.declaration
	if !stagedLexicalDefaultDeclaration(declaration, owner) || invocation.inputKind != relativeInputInvocation || !invocation.actualsKnown || len(invocation.captures) != 0 || bound.unsupported != relativeInputsSupported || !sameSourceRelativeInputEnvelope(invocation, bound) || len(bound.bindings) != len(declaration.Parameters())+1 {
		return plan
	}
	for _, binding := range bound.bindings {
		if len(binding.pending) != 0 {
			return plan // Compiler work is never replaced by runtime uncertainty.
		}
	}
	receiver := sourceRelativeRole{kind: relativeRoleReceiver, declaration: declaration}
	plan.bindings = append(plan.bindings, relativeBindingFromEndpoint(receiver, invocation.receiver))
	defaultIndex := 0
	for slot, parameter := range declaration.Parameters() {
		if !ast.IsIdentifier(parameter.Name()) || parameter.Name().Text() == "this" || parameter.AsParameterDeclaration().DotDotDotToken != nil {
			return plan
		}
		role := sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: slot}
		var actual *sourceRelativeEndpoint
		if slot < len(invocation.actuals) {
			input := &invocation.actuals[slot]
			if input.ordinal != slot || input.spread {
				return plan
			}
			actual = &input.endpoint
		}
		if parameter.Initializer() == nil {
			if actual == nil {
				return plan // This bounded migration adds no missing ordinary slot.
			}
			plan.bindings = append(plan.bindings, relativeBindingFromEndpoint(role, *actual))
			continue
		}
		donor := stagedLexicalDefaultFunction(parameter, declaration, owner)
		if defaultIndex >= len(bound.defaults) {
			return plan
		}
		selected := &bound.defaults[defaultIndex]
		defaultIndex++
		installed := &bound.bindings[slot+1] // Original reducer: receiver, then authored formals.
		if selected.formal != role || selected.initializer != parameter.Initializer() || selected.cut != invocation.cut || installed.target != role {
			return plan
		}
		if donor == nil || len(installed.pending) != 0 {
			return plan
		}
		if selected.selection == relativeDefaultBypassed {
			if actual == nil || actual.kind == relativeEndpointUndefined || actual.kind == relativeEndpointUnknown || installed.unknown {
				return plan
			}
			plan.bindings = append(plan.bindings, relativeBindingFromEndpoint(role, *actual))
			continue
		}
		if selected.selection != relativeDefaultRequired && selected.selection != relativeDefaultConditional {
			return plan
		}
		binding := sourceRelativeBinding{target: role}
		if selected.selection == relativeDefaultConditional {
			if actual == nil || actual.kind != relativeEndpointRole {
				return plan // An unrepresented actual is not runtime-unknown payment.
			}
			binding = relativeBindingFromEndpoint(role, *actual)
		} else if installed.unknown {
			return plan
		}
		found := false
		for _, source := range installed.sources {
			if source.kind == relativeEndpointExpression && source.expression == donor && len(source.projection) == 0 && source.creation == nil && source.returning == nil && source.cut == bound.cut {
				binding.sources = append(binding.sources, cloneSourceRelativeEndpoint(source))
				found = true
				continue
			}
			// The original actual role represents its own nondefault alternatives.
			if selected.selection != relativeDefaultConditional || !stagedDefaultActualRoleSource(source, *actual, owner) {
				return plan
			}
		}
		if !found {
			return plan
		}
		plan.bindings = append(plan.bindings, binding)
	}
	if defaultIndex != len(bound.defaults) {
		return plan
	}
	plan.unsupported = relativeInputsSupported
	return plan
}

func stagedDefaultActualRoleSource(source, actual sourceRelativeEndpoint, owner *sourceValueOwner) bool {
	if source.kind != relativeEndpointExpression || source.expression == nil || len(source.projection) != 0 || source.creation != nil || source.returning != nil || actual.kind != relativeEndpointRole || actual.role.kind != relativeRoleFormal || actual.role.declaration == nil || actual.role.slot < 0 || actual.role.slot >= len(actual.role.declaration.Parameters()) {
		return false
	}
	symbol := owner.checker.GetSymbolAtLocation(source.expression)
	return symbol != nil && symbol.ValueDeclaration == actual.role.declaration.Parameters()[actual.role.slot]
}

// stagedBoundLexicalDefaultCall lends only an already installed fact's detached
// input edge. Result and Effects owners still require their actual collector
// edge, canonical BODY delivery and original Get/DATA currentness separately.
func (work *callableEffectWork) stagedBoundLexicalDefaultCall(facts []callableFacts, caller int, operation *ast.Node, owner *executableBodyOwner) (sourceStagedDeclarationCall, bool) {
	if caller < 0 || caller >= len(facts) || owner == nil || owner.values == nil || owner.project == nil || owner.project.activeGeneration != work.operationGeneration || owner.values.generation != work.operationGeneration {
		return sourceStagedDeclarationCall{}, false
	}
	publisher := owner.pendingMemberPublishers[facts[caller].node]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return sourceStagedDeclarationCall{}, false
	}
	for _, call := range facts[caller].staged.calls {
		if call.invocation.operation == operation && call.inputConsumerWait == nil && call.inputs != nil && call.sourceInputs == nil && !call.legacyInputs && validStagedDataResultCall(call) && stagedLexicalDefaultDeclaration(call.invocation.declaration, owner.values) && call.inputs.relative.unsupported == relativeInputsSupported {
			return call, true
		}
	}
	return sourceStagedDeclarationCall{}, false
}
