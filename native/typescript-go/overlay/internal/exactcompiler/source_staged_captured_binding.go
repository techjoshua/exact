package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedCapturedBinding separates the read's callable from the declaring
// lexical owner. A writer variant names an indexed write and possible original
// Set. input is published only by that Set's live selection loan: it describes
// the formal's original RHS SOURCE, never delivered B, execution or normal DATA.
// Descriptions can survive a work clone; every required child is enrolled anew.
type sourceStagedCapturedBinding struct {
	read, reader, binding, lexical *ast.Node
	symbol                         *ast.Symbol
	write, set                     *ast.Node
	root                           sourceStagedOperationRequest
	input                          *sourceRelativeEndpoint
}

// Input refines a conditional SOURCE description for the same authored RHS;
// it is not producer identity or cached execution authority. The issuer checks
// any existing input before refinement, and required Set/BODY edges remain live.
func sameStagedCapturedBinding(a, b *sourceStagedCapturedBinding) bool {
	return a == b || a != nil && b != nil && a.read == b.read && a.reader == b.reader && a.binding == b.binding && a.lexical == b.lexical && a.symbol == b.symbol && a.write == b.write && a.set == b.set && sameOperationRequest(a.root, b.root)
}

// capturedBindingSource admits an original lexical read, not a copied binder
// map. Checked declaration identity and the existing source index authenticate
// the association. Defaulted formals remain formal SOURCE, never their default.
func capturedBindingSource(read, reader *ast.Node, owner *executableBodyOwner) (sourceStagedCapturedBinding, bool) {
	if owner == nil || owner.values == nil || owner.checker == nil || read == nil || !ast.IsIdentifier(read) || reader == nil || (!ast.IsGetAccessorDeclaration(reader) && !ast.IsSetAccessorDeclaration(reader) && !ast.IsFunctionDeclaration(reader)) || !sourceStagedOccurrenceOwned(read, reader) || ast.IsDeclarationName(read) || isStaticPropertyName(read) {
		return sourceStagedCapturedBinding{}, false
	}
	file := ast.GetSourceFileOfNode(read)
	if file == nil || file.IsDeclarationFile || !ast.IsExternalModule(file) || owner.values.program.GetSourceFile(file.FileName()) != file {
		return sourceStagedCapturedBinding{}, false
	}
	index := owner.values.index(file)
	symbol := owner.checker.GetSymbolAtLocation(read)
	if index.incomplete || index.normalDynamicScope || symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil {
		return sourceStagedCapturedBinding{}, false
	}
	binding := symbol.ValueDeclaration
	lexical := enclosingCallableNode(binding)
	if lexical == nil || enclosingCallableNode(reader.Parent) != lexical || lexical.Body() == nil || !sourceStagedOccurrenceOwned(binding, lexical) {
		return sourceStagedCapturedBinding{}, false
	}
	if ast.IsVariableDeclaration(binding) {
		if binding.Name() == nil || !ast.IsIdentifier(binding.Name()) || binding.Initializer() == nil {
			return sourceStagedCapturedBinding{}, false
		}
	} else if !ast.IsParameterDeclaration(binding) || binding.Name() == nil || !ast.IsIdentifier(binding.Name()) || binding.Name().Text() == "this" || binding.AsParameterDeclaration().DotDotDotToken != nil || owner.values.bindingWritten(symbol) || capturedBindingMutated(symbol, owner) {
		return sourceStagedCapturedBinding{}, false
	}
	return sourceStagedCapturedBinding{read: read, reader: reader, binding: binding, lexical: lexical, symbol: symbol}, true
}

func describeStagedCapturedBinding(read, reader *ast.Node, owner *executableBodyOwner) (*sourceStagedCallResultSource, bool) {
	capture, valid := capturedBindingSource(read, reader, owner)
	if !valid {
		return nil, false
	}
	return &sourceStagedCallResultSource{request: stagedBindingResultRequest(read, reader), declaration: reader, binding: capture.binding, capturedBinding: &capture, generation: owner.values.generation}, true
}

// The producer retains its original Set cut. The separate reading key names
// this captured read; its graph cut is never substituted for the Set's cut.
func capturedBindingWriterRequest(c *sourceStagedCapturedBinding) sourceStagedOperationRequest {
	return sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: c.lexical, operation: c.set, kind: relativeDemandDirectExposure, selector: sourceStagedOperationSelector{occurrence: c.read, association: c.write, field: "captured-binding-write"}}, consumer: c.reader, use: c.set, cut: sourceRelativeCut{operation: c.set, use: c.set, reading: c.set}, reading: stagedBindingResultRequest(c.read, c.reader).producer, edge: fmt.Sprintf("captured-binding-write:%d:%d:%d", c.read.Pos(), c.write.Pos(), c.set.Pos())}
}

// capturedBindingMutated covers update/pattern targets omitted by the existing
// assignment bucket. The checked use index is shared with the binding owner.
func capturedBindingMutated(symbol *ast.Symbol, owner *executableBodyOwner) bool {
	index := owner.values.index(ast.GetSourceFileOfNode(symbol.ValueDeclaration))
	if index.privateUses == nil || !index.privateUses.complete {
		return true
	}
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		if nativeAssignmentPatternTarget(use.node) {
			return true
		}
		if use.node.Parent != nil && unwrapSourceCallableReference(planMutationOperation(use.node.Parent).target) == use.node {
			return true
		}
	}
	return false
}

// A store from the unchanged setter formal can retain its original input
// SOURCE. Other RHS operations and reassigned formals keep their own debt.
func capturedBindingFormal(write *ast.Node, c *sourceStagedCapturedBinding, owner *executableBodyOwner) *ast.Node {
	if write == nil || !ast.IsBinaryExpression(write) || write.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
		return nil
	}
	binary := write.AsBinaryExpression()
	writer := enclosingCallableNode(write)
	if writer == nil || !ast.IsSetAccessorDeclaration(writer) || enclosingCallableNode(writer.Parent) != c.lexical || !ast.IsIdentifier(binary.Left) || !ast.IsIdentifier(binary.Right) || owner.checker.GetSymbolAtLocation(binary.Left) != c.symbol {
		return nil
	}
	symbol := owner.checker.GetSymbolAtLocation(binary.Right)
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsParameterDeclaration(symbol.ValueDeclaration) || enclosingCallableNode(symbol.ValueDeclaration) != writer || owner.values.bindingWritten(symbol) || capturedBindingMutated(symbol, owner) {
		return nil
	}
	parameters := writer.Parameters()
	if len(parameters) != 1 || parameters[0] != symbol.ValueDeclaration || parameters[0].Initializer() != nil || parameters[0].AsParameterDeclaration().DotDotDotToken != nil {
		return nil
	}
	return binary.Right
}

func validStagedCapturedBindingRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.callResult
	c := source.capturedBinding
	if c == nil || c.read == nil || c.reader == nil || c.binding == nil || c.symbol == nil || c.symbol.ValueDeclaration != c.binding || c.lexical == nil || source.binding != c.binding || source.operand != nil || source.getResult != nil || source.nativeCall || source.moduleConstruction != nil || source.nativeDescriptor != nil || source.frameworkView != nil || source.constructedRoot.producer.operation != nil || len(source.constructedPreparation) != 0 {
		return false
	}
	if c.write == nil {
		if c.set != nil || c.input != nil || source.declaration != c.reader || !sameOperationRequest(source.request, stagedBindingResultRequest(c.read, c.reader)) {
			return false
		}
		for _, required := range recipe.delta.required {
			if sameOperationRequest(required, stagedResultSourceRequest(c.binding.Initializer(), c.lexical, nil)) {
				continue
			}
			if required.producer.selector.field != "captured-binding-write" || required.producer.selector.occurrence != c.read || required.producer.declaration != c.lexical || required.consumer != c.reader || required.reading != source.request.producer || required.use != required.producer.operation || required.cut != (sourceRelativeCut{operation: required.producer.operation, use: required.producer.operation, reading: required.producer.operation}) {
				return false
			}
		}
		return true
	}
	if !ast.IsBinaryExpression(c.write) || c.write.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken || !plainStagedAssignment(c.set) || source.declaration != c.lexical || !sameOperationRequest(source.request, capturedBindingWriterRequest(c)) || c.root.producer.operation != c.set || c.root.consumer != c.lexical || len(recipe.delta.required) < 2 || !sameOperationRequest(recipe.delta.required[0], c.root) || !sameOperationRequest(recipe.delta.required[1], stagedBindingResultRequest(c.write.AsBinaryExpression().Right, enclosingCallableNode(c.write))) {
		return false
	}
	if c.input == nil {
		return len(recipe.delta.required) == 2 && !recipe.delta.extracted && len(recipe.delta.exposures) == 0
	}
	if c.input.kind != relativeEndpointExpression || c.input.expression != c.set.AsBinaryExpression().Right || c.input.producer != c.set || c.input.get != c.set.AsBinaryExpression().Right || c.input.cut != (sourceRelativeCut{operation: c.set, reading: c.set.AsBinaryExpression().Left}) {
		return false
	}
	for _, required := range recipe.delta.required[2:] {
		if !sameOperationRequest(required, stagedResultSourceRequest(c.input.expression, c.lexical, nil)) {
			return false
		}
	}
	return true
}

// prepareStagedCapturedBinding keeps initializer and writer memberships separate.
// Known prefixes remain available while a missing writer/input is compiler work.
// It does not ask which write ran or replace the original initializer alternative.
func (work *callableEffectWork) prepareStagedCapturedBinding(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	recipe := work.operationRecipes[work.operations[id.index].key]
	source := recipe.callResult
	c := source.capturedBinding
	canonical, valid := capturedBindingSource(c.read, c.reader, owner)
	if source.generation != owner.values.generation || source.generation != work.operationGeneration || !valid || canonical.symbol != c.symbol || canonical.binding != c.binding || canonical.lexical != c.lexical || !validStagedCallResultRecipe(recipe) {
		return
	}
	if c.write != nil {
		work.prepareCapturedBindingWriter(facts, id, recipe, owner)
		return
	}
	delta := sourceStagedOperationDelta{extracted: true}
	if ast.IsParameterDeclaration(c.binding) {
		slot := 0
		for _, formal := range c.lexical.Parameters() {
			if formal.Name() != nil && ast.IsIdentifier(formal.Name()) && formal.Name().Text() == "this" {
				continue
			}
			if formal == c.binding {
				delta.exposures = []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointRole, role: sourceRelativeRole{kind: relativeRoleFormal, declaration: c.lexical, slot: slot}, producer: c.binding, get: c.read, cut: source.request.cut}}}
				work.publishCapturedBinding(facts, id, recipe, delta)
				return
			}
			slot++
		}
		return
	}
	work.appendCapturedBindingData(facts, &delta, c.binding.Initializer(), c.lexical, owner)
	index := owner.values.index(ast.GetSourceFileOfNode(c.read))
	// The existing assignment bucket omits increments and pattern destinations.
	// Reuse checked lexical uses to retain those debts without another AST walk.
	if index.privateUses == nil || !index.privateUses.complete {
		delta.extracted = false
	} else {
		for _, use := range index.privateUses.uses[ast.GetSymbolId(c.symbol)] {
			target := use.node
			if nativeAssignmentPatternTarget(target) {
				delta.extracted = false
				continue
			}
			operation := target.Parent
			if operation == nil {
				continue
			}
			mutation := planMutationOperation(operation)
			if unwrapSourceCallableReference(mutation.target) == target && capturedBindingFormal(operation, c, owner) == nil {
				delta.extracted = false
			}
		}
	}
	for _, write := range index.bindings[ast.GetSymbolId(c.symbol)] {
		operation := write.right.Parent
		if capturedBindingFormal(operation, c, owner) == nil {
			delta.extracted = false
			continue
		}
		writer := enclosingCallableNode(operation)
		assignments := index.memberAssignments(writer.Parent)
		represented := false
		for candidate, ok := assignments.next(); ok; candidate, ok = assignments.next() {
			set := candidate.right.Parent
			if !plainStagedAssignment(set) || enclosingCallableNode(set) != c.lexical {
				continue
			}
			_, key := accessorReceiver(candidate.left)
			if key != "" && writer.Name() != nil && !ast.IsComputedPropertyName(writer.Name()) && key != writer.Name().Text() {
				continue
			}
			caller, known := work.memberNodes[c.lexical]
			if !known {
				continue
			}
			root, valid := sourceStagedOccurrenceRequest(&facts[caller], set, relativeDemandEffects, fmt.Sprintf("%s:assignment:%d", facts[caller].summary.ID, set.Pos()))
			if !valid {
				continue
			}
			child := *c
			child.write, child.set, child.root = operation, set, root
			request := capturedBindingWriterRequest(&child)
			childSource := &sourceStagedCallResultSource{request: request, declaration: c.lexical, binding: c.binding, capturedBinding: &child, generation: source.generation}
			// The original formal read is an independent SOURCE producer. Install
			// its recipe before enrolling a writer that requires it.
			writerIndex, writerKnown := work.memberNodes[writer]
			if !writerKnown {
				continue
			}
			formalSource, formalKnown := work.describeStagedCallResultSource(facts, writerIndex, operation.AsBinaryExpression().Right, owner)
			if !formalKnown {
				continue
			}
			if _, exists := work.operationRecipes[formalSource.request.producer]; !exists && !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: formalSource.request.producer, callResult: formalSource}) {
				continue
			}
			if _, exists := work.operationRecipes[request.producer]; !exists {
				initial := sourceStagedOperationDelta{required: []sourceStagedOperationRequest{root, stagedBindingResultRequest(operation.AsBinaryExpression().Right, writer)}}
				if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, callResult: childSource, delta: initial}) {
					continue
				}
			}
			if actual, registered := work.registerStagedAssignmentEffects(facts, caller, set, owner); !registered || !sameOperationRequest(actual, root) {
				continue
			}
			if _, required := work.requireOperation(facts, request); !required {
				continue
			}
			represented = true
			delta.required = appendEntryLawRequirement(delta.required, request)
			if data, applied := work.stagedCallResultData(request); applied {
				delta.exposures = append(delta.exposures, data.delta.exposures...)
				delta.extracted = delta.extracted && data.delta.extracted
			} else {
				delta.extracted = false
			}
		}
		delta.extracted = delta.extracted && represented
	}
	work.publishCapturedBinding(facts, id, recipe, delta)
}

// appendCapturedBindingData requests the actual expression's SOURCE owner. This
// helper never acquires an initializer/Get, binds B or classifies pending as unknown.
func (work *callableEffectWork) appendCapturedBindingData(facts []callableFacts, delta *sourceStagedOperationDelta, expression, declaration *ast.Node, owner *executableBodyOwner) {
	if stagedSourceDataValue(expression) && !stagedCallReturnLiteralHasCapture(expression, owner.values) {
		delta.exposures = append(delta.exposures, sourceStagedOperationAlternative{endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: expression, producer: expression, cut: sourceRelativeCut{operation: expression, reading: expression}}})
		return
	}
	caller, known := work.memberNodes[declaration]
	if !known {
		delta.extracted = false
		return
	}
	child, supported := work.describeStagedCallResultSource(facts, caller, expression, owner)
	if !supported {
		delta.extracted = false
		return
	}
	if child.getResult != nil {
		if _, registered := work.registerStagedGetResult(facts, caller, expression, owner); !registered {
			delta.extracted = false
			return
		}
	}
	if _, exists := work.operationRecipes[child.request.producer]; !exists && !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: child.request.producer, callResult: child}) {
		delta.extracted = false
		return
	}
	if _, required := work.requireOperation(facts, child.request); !required {
		delta.extracted = false
		return
	}
	delta.required = appendEntryLawRequirement(delta.required, child.request)
	if data, applied := work.stagedCallResultData(child.request); applied {
		delta.exposures = append(delta.exposures, data.delta.exposures...)
		delta.extracted = delta.extracted && data.delta.extracted
	} else {
		delta.extracted = false
	}
}

func (work *callableEffectWork) prepareCapturedBindingWriter(facts []callableFacts, id sourceStagedOperationID, recipe sourceStagedOperationRecipe, owner *executableBodyOwner) {
	c := recipe.callResult.capturedBinding
	if c.input == nil || capturedBindingFormal(c.write, c, owner) == nil {
		return
	}
	delta := sourceStagedOperationDelta{required: []sourceStagedOperationRequest{c.root, stagedBindingResultRequest(c.write.AsBinaryExpression().Right, enclosingCallableNode(c.write))}, extracted: true}
	formal := c.write.AsBinaryExpression().Right
	writer := enclosingCallableNode(c.write)
	caller, known := work.memberNodes[writer]
	if !known {
		return
	}
	child, supported := work.describeStagedCallResultSource(facts, caller, formal, owner)
	if !supported {
		return
	}
	if _, exists := work.operationRecipes[child.request.producer]; !exists && !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: child.request.producer, callResult: child}) {
		return
	}
	if _, required := work.requireOperation(facts, child.request); !required {
		return
	}
	work.appendCapturedBindingData(facts, &delta, c.input.expression, c.lexical, owner)
	work.publishCapturedBinding(facts, id, recipe, delta)
}

func (work *callableEffectWork) publishCapturedBinding(facts []callableFacts, id sourceStagedOperationID, recipe sourceStagedOperationRecipe, delta sourceStagedOperationDelta) {
	// Children can deliver in either order. Preserve the existing ordered
	// prefix while adding new alternatives and requirements exactly once.
	prior := cloneOperationDelta(recipe.delta)
	for _, required := range delta.required {
		prior.required = appendEntryLawRequirement(prior.required, required)
	}
	for _, alternative := range delta.exposures {
		found := false
		for _, old := range prior.exposures {
			found = found || sameOperationAlternative(old, alternative)
		}
		if !found {
			prior.exposures = append(prior.exposures, alternative)
		}
	}
	prior.extracted = delta.extracted
	delta = prior
	recipe.delta = delta
	if work.attachOperationSource(facts, recipe) {
		// The existing binding closure consumer also requires the local SOURCE
		// projection. This owner supplies that description, never a BODY/current
		// receipt; required children and graph-local APPLIED still gate closure.
		plan := &sourceStagedReturnBindingPlan{locallyRepresented: delta.extracted}
		for _, alternative := range delta.exposures {
			plan.branches = append(plan.branches, sourceStagedCallReturnBranch{endpoint: cloneSourceRelativeEndpoint(alternative.endpoint)})
		}
		work.operations[id.index].resultProjection = plan
		work.publishOperation(id, delta)
	}
}

// describeSelectedCapturedWrites runs only inside the original selected setter
// SOURCE callback. It publishes no B or Effects/DATA closure. Original Set BODY,
// formal read and RHS DATA requirements remain independent graph memberships.
func (work *callableEffectWork) describeSelectedCapturedWrites(facts []callableFacts, root sourceStagedOperationRequest, q *sourceValueQuery, body *ast.Node, owner *executableBodyOwner) bool {
	b := q.liveStagedAssignment()
	if b == nil || b.generation != work.operationGeneration || b.request.operation != root.use || !ast.IsSetAccessorDeclaration(body) || b.alternative == nil || b.alternative.get == nil || b.alternative.get.operation != b.request.target || b.alternative.origin != body.Parent || !b.alternative.setter {
		return false
	}
	index := owner.values.index(ast.GetSourceFileOfNode(body))
	region := index.operationRegions[body]
	if region == nil || index.privateUses == nil || !index.privateUses.complete {
		return false
	}
	for _, left := range region.writes {
		if !ast.IsIdentifier(left) || left.Parent == nil || !ast.IsBinaryExpression(left.Parent) {
			continue
		}
		symbol := owner.checker.GetSymbolAtLocation(left)
		if symbol == nil {
			continue
		}
		for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
			reader := enclosingCallableNode(use.node)
			request := stagedBindingResultRequest(use.node, reader)
			readSource := work.operationRecipes[request.producer].callResult
			if readSource == nil || readSource.capturedBinding == nil || readSource.generation != work.operationGeneration {
				continue
			}
			read := readSource.capturedBinding
			if read.write != nil || capturedBindingFormal(left.Parent, read, owner) == nil {
				continue
			}
			child := *read
			child.write, child.set, child.root = left.Parent, root.use, root
			writerRequest := capturedBindingWriterRequest(&child)
			recipe, registered := work.operationRecipes[writerRequest.producer]
			if !registered || recipe.callResult.capturedBinding == nil {
				continue
			}
			endpoint := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: b.request.right, producer: root.use, get: b.request.right, cut: b.cut}
			if previous := recipe.callResult.capturedBinding.input; previous != nil && !sameOperationEndpoint(*previous, endpoint) {
				continue
			}
			child.input = &endpoint
			source := *recipe.callResult
			source.capturedBinding = &child
			recipe.callResult = &source
			work.attachOperationSource(facts, recipe)
		}
	}
	return true
}

// requireOriginalGetterBindingSources is called only inside the selected Get
// owner's live loan. Its value-source recipe retains each demanded captured read
// before BODY eligibility can refuse transfer. The index describes uses; only
// this original Get issuer attaches their actual SOURCE requirements.
func (work *callableEffectWork) requireOriginalGetterBindingSources(facts []callableFacts, b *sourceStagedGetResultBorrow, body *ast.Node) {
	if b == nil || !b.active || b.issuer == nil || b.issuer.liveStagedGetResult(b.get) != b || b.work != work || b.owner == nil || b.owner.values.generation != work.operationGeneration {
		return
	}
	index := b.owner.values.index(ast.GetSourceFileOfNode(body))
	region := index.operationRegions[body]
	if region == nil {
		b.complete = false
		return
	}
	for _, read := range region.references {
		symbol := b.owner.checker.GetSymbolAtLocation(read)
		if symbol != nil && symbol.ValueDeclaration != nil {
			role := sourceRelativeRole{kind: relativeRoleCapture, declaration: body, binding: symbol.ValueDeclaration}
			if _, mapped := fieldGetterCaptureFormal(role, enclosingCallableNode(body.Parent), b.owner); mapped && b.effectsRoot == nil {
				continue
			}
		}
		source, supported := describeStagedCapturedBinding(read, body, b.owner)
		if !supported {
			continue
		}
		if !work.registerOperationSourcePrefix(facts, sourceStagedOperationRecipe{key: source.request.producer, callResult: source}) {
			b.complete = false
			continue
		}
		b.required = appendEntryLawRequirement(b.required, source.request)
	}
}
