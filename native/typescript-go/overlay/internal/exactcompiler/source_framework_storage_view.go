package exactcompiler

import (
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceFrameworkStorageView describes the framework's conditional storage
// projection through unwrap. It deliberately is not sourceValue or a native
// endpoint: an input donor is neither the wrapper nor a normal result. The
// result owner must retain all selected alternatives, original Call Effects,
// input dependencies and unresolved unwrap alternatives before completing DATA.
// This description carries no live query, scope, acquired output or receipt.
type sourceFrameworkStorageView struct {
	call, declaration, argument *ast.Node
	generation                  *projectGeneration
	cut                         sourceRelativeCut
	input                       sourceRelativeBinding
	inputGap                    sourceRelativeInputGap
	projection                  []string
}

// reactiveObjectsViewDeclaration recognizes an actual imported framework export
// and its resolved declaration arm. It does not select the callee, exclude a
// modeled replacement or complete an ordinary acquisition. Those obligations
// remain with the original invocation owner and its complete alternative set.
func reactiveObjectsViewDeclaration(call *ast.Node, declarations []*ast.Node, owner *executableBodyOwner) *ast.Node {
	if owner == nil || owner.values == nil || owner.values.program == nil || owner.checker == nil || owner.values.generation == nil || call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || len(declarations) != 1 {
		return nil
	}
	expression := unwrapSourceCallableReference(call.Expression())
	if expression == nil || !ast.IsIdentifier(expression) && !ast.IsPropertyAccessExpression(expression) {
		return nil
	}
	if ast.IsPropertyAccessExpression(expression) && (expression.Name() == nil || expression.Name().Text() == "call" || expression.Name().Text() == "apply") {
		return nil
	}
	file := ast.GetSourceFileOfNode(call)
	if file == nil || file.IsDeclarationFile || owner.values.program.GetSourceFile(file.FileName()) != file {
		return nil
	}
	index := owner.values.index(file)
	if index.incomplete || index.normalDynamicScope {
		return nil
	}
	reference, imported := externalImportForExpression(call.Expression(), collectExternalImportBindings(file, owner.checker), owner.checker)
	if !imported || reference.namespace || reference.moduleSpecifier != "@exactjs/reactive/framework/objects" || reference.exportName != "reactiveObjects" {
		return nil
	}
	declaration := declarations[0]
	if declaration == nil {
		return nil
	}
	source := ast.GetSourceFileOfNode(declaration)
	if !ast.IsFunctionDeclaration(declaration) || declaration.Body() != nil || declaration.Name() == nil || declaration.Name().Text() != "reactiveObjects" || source == nil || !source.IsDeclarationFile || owner.values.program.GetSourceFile(source.FileName()) != source {
		return nil
	}
	path := strings.ReplaceAll(source.FileName(), `\`, "/")
	if !strings.HasSuffix(path, "/packages/reactive/dist/framework/objects.d.ts") && !strings.HasSuffix(path, "/node_modules/@exactjs/reactive/dist/framework/objects.d.ts") {
		return nil
	}
	// The arm must be the actual resolved export of this original expression,
	// not a supplied declaration list which happens to name a package path.
	local := callTargetSymbol(expression, owner.checker)
	resolved := resolvedCallableSymbol(local, owner.checker)
	if local == nil || resolved == nil || owner.values.bindingWritten(local) || owner.values.bindingWritten(resolved) || len(resolved.Declarations) != 1 || resolved.Declarations[0] != declaration {
		return nil
	}
	return declaration
}

// describeFrameworkViewInput detaches source relationships while the original
// argument/default/creator owner is still installed. Creator association fills
// only absent descriptive creation fields; it supplies no runtime input or B.
func (q *sourceValueQuery) describeFrameworkViewInput(call, declaration *ast.Node, values []sourceValue) (sourceRelativeBinding, sourceRelativeInputGap) {
	cut := q.relativeInputCut(call)
	role := sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: 0}
	binding, gap := describeRelativeBoundValues(values, role, cut)
	for index := range binding.sources {
		endpoint := &binding.sources[index]
		if endpoint.creation != nil || endpoint.expression == nil {
			continue
		}
		creation := q.creators[enclosingCallableNode(endpoint.expression)]
		endpoint.creation, endpoint.returning = creation.invocation, creation.returning
	}
	return binding, gap
}

// describeReactiveObjectsStorageView consumes a source binding already supplied
// by the actual argument owner. It never acquires an argument, invokes unwrap,
// reconstructs a scope or marks result membership complete. Unknown/pending
// inputs survive beside known donors. Only the bounded direct one-argument
// form is described here; options/parentSource retain their existing owners.
func describeReactiveObjectsStorageView(call *ast.Node, declarations []*ast.Node, input sourceRelativeBinding, gap sourceRelativeInputGap, cut sourceRelativeCut, owner *executableBodyOwner) (sourceFrameworkStorageView, bool) {
	declaration := reactiveObjectsViewDeclaration(call, declarations, owner)
	if declaration == nil || cut.operation != call || input.target != (sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: 0}) {
		return sourceFrameworkStorageView{}, false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 1 || ast.IsSpreadElement(actuals[0]) || len(input.sources)+len(input.pending) == 0 && !input.unknown {
		return sourceFrameworkStorageView{}, false
	}
	for _, endpoints := range [][]sourceRelativeEndpoint{input.sources, input.pending} {
		for _, endpoint := range endpoints {
			if endpoint.cut != cut {
				return sourceFrameworkStorageView{}, false
			}
		}
	}
	return sourceFrameworkStorageView{call: call, declaration: declaration, argument: actuals[0], generation: owner.values.generation, cut: cut, input: cloneSourceRelativeBinding(input), inputGap: gap}, true
}

// projectFrameworkStorageView keeps the semantic boundary during member/source
// projection. It does not project the underlying donor as an ordinary object.
// Bindings may transport this description; exact/native/prototype consumers
// require an explicit view-aware rule and otherwise retain their DATA demand.
func projectFrameworkStorageView(view sourceFrameworkStorageView, projection []string) sourceFrameworkStorageView {
	view.input = cloneSourceRelativeBinding(view.input)
	view.projection = append(append([]string(nil), view.projection...), projection...)
	return view
}

// publishFrameworkStorageView runs only inside the actual declaration branch
// of ordinary source invocation. It acquires the original argument at its own
// source cut while its binder/default/creator context is live. All input debt is
// merged into the original invocation; a callback supplies no completion claim.
func (q *sourceValueQuery) publishFrameworkStorageView(call *ast.Node, declarations []*ast.Node, bindings sourceValueBindings, publish func(sourceFrameworkStorageView, sourceValueBindings), result *accessorCandidates) {
	if q == nil || !q.dependenciesOnly || q.operation != nil || publish == nil {
		return
	}
	declaration := reactiveObjectsViewDeclaration(call, declarations, q.executable)
	if declaration == nil {
		return
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 1 || ast.IsSpreadElement(actuals[0]) {
		return
	}
	inputDebt := accessorCandidates{}
	values := q.originsAt(actuals[0], q.boundInputAcquisition(actuals[0], call), bindings, &inputDebt)
	mergeAccessorCandidates(result, inputDebt)
	input, gap := q.describeFrameworkViewInput(call, declaration, values)
	view, described := describeReactiveObjectsStorageView(call, declarations, input, gap, q.relativeInputCut(call), q.executable)
	if described {
		publish(view, bindings)
	}
}

func sameFrameworkStorageView(a, b *sourceFrameworkStorageView) bool {
	if a == nil || b == nil {
		return a == b
	}
	if a.call != b.call || a.declaration != b.declaration || a.argument != b.argument || a.generation != b.generation || a.cut != b.cut || a.inputGap != b.inputGap || a.input.target != b.input.target || a.input.unknown != b.input.unknown || len(a.input.sources) != len(b.input.sources) || len(a.input.pending) != len(b.input.pending) || len(a.projection) != len(b.projection) {
		return false
	}
	for i, p := range a.projection {
		if p != b.projection[i] {
			return false
		}
	}
	for i, e := range a.input.sources {
		if !sameOperationEndpoint(e, b.input.sources[i]) {
			return false
		}
	}
	for i, e := range a.input.pending {
		if !sameOperationEndpoint(e, b.input.pending[i]) {
			return false
		}
	}
	return true
}

// frameworkRuntimeMay is the selected framework contract's possible user code,
// traps and Throw, not a replacement for missing compiler/input source work.
// The original Call association identifies its sole arg0 relation in the typed
// framework recipe. Nil use keeps this runtime alternative out of contextual
// unfinished-call discharge; it is never a completion/NoUser contribution.
func frameworkRuntimeMay(view sourceFrameworkStorageView, caller *ast.Node, name string) EnvironmentEffectSource {
	effect := environmentSource("unknown", "reactiveObjects unwrap/view may execute user operations or throw", name)
	effect.Opaque = true
	effect.callOrigin = &sourceCallOutcome{declaration: caller, operation: view.call, phase: sourceFrameworkViewEffects}
	return effect
}

// retainFrameworkView transports only a source marker. Whole-source discovery
// may retain it without obtaining an ordinary receiver. Property/prototype,
// invocation, presence and normal consumers without a view rule fail closed;
// a source-domain descriptor never pays those stronger demands.
func (q *sourceValueQuery) retainFrameworkView(view sourceFrameworkStorageView, projection []string, name string, mode accessorTraversal, instance bool, result *accessorCandidates) {
	if q == nil || q.owner == nil || !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || view.generation != q.owner.generation {
		result.valueIncomplete = true
		return
	}
	projected := projectFrameworkStorageView(view, projection)
	if name != "" {
		projected.projection = append(projected.projection, name)
	}
	result.values = append(result.values, sourceValue{frameworkView: &projected})
	result.valueIncomplete = true // No normal value/presence/receiver was acquired.
	if instance || mode != accessorAcquire || len(projected.projection) != 0 {
		result.opaque = true // This stronger consumer has no represented view rule.
	}
	if q.calleeWriteInventory != nil {
		q.calleeWriteInventory.unknown = true
	}
}
