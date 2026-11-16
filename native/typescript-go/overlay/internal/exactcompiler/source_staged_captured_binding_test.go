package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This exercises the real indexed lexical owner and the original selected Set
// borrower. Callback bodies are intentionally stored; inspecting SOURCE must not
// invoke either donor. No test supplies a creator, binder packet or graph receipt.
const stagedCapturedBindingSource = `export function invoke(){let selected=()=>window.name;const box={get work(){return selected},set work(next:()=>string){selected=next}};box.work=({get value(){return()=>document.title}}).value;return box.work}`

func TestStagedCapturedBindingOriginalReadAndSet(t *testing.T) {
	withStagedAssignmentSource(t, stagedCapturedBindingSource, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		work := newCallableEffectWork(facts)
		work.operationGeneration = q.owner.generation
		work.indexOperationSources(facts)
		var read, reader *ast.Node
		walkNode(ast.GetSourceFileOfNode(operation).AsNode(), func(node *ast.Node) bool {
			if ast.IsIdentifier(node) && node.Text() == "selected" && node.Parent != nil && ast.IsReturnStatement(node.Parent) {
				read = node
				reader = enclosingCallableNode(node)
			}
			return true
		})
		caller := installationFactIndex(t, facts, reader)
		source, ok := work.describeStagedCallResultSource(facts, caller, read, q.executable)
		if _, valid := describeStagedCapturedBinding(read, q.effectOwner, q.executable); valid {
			t.Fatal("lexical owner replaced the original getter read owner")
		}
		if !ok || source.capturedBinding == nil || source.capturedBinding.lexical != q.effectOwner || source.capturedBinding.reader != reader || source.request.producer.operation != read || source.request.cut.reading != read {
			t.Fatal("original captured read lost separate lexical and reading owners")
		}
		if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: source.request.producer, callResult: source}) {
			t.Fatal("original read SOURCE registration refused")
		}
		if len(work.operationIDs) != 0 {
			t.Fatal("registration adopted a capture/initializer")
		}
		id, required := work.requireOperation(facts, source.request)
		if !required {
			t.Fatal("actual captured read requirement refused")
		}
		work.prepareStagedCallResult(facts, id, q.executable)
		recipe := work.operationRecipes[source.request.producer]
		var writer *sourceStagedCapturedBinding
		for _, child := range recipe.delta.required {
			if child.producer.selector.field != "captured-binding-write" {
				continue
			}
			original := work.operationRecipes[child.producer]
			writer = original.callResult.capturedBinding
			if writer == nil || writer.read != read || writer.set != operation || writer.root.producer.operation != operation || writer.write.AsBinaryExpression().Right.Text() != "next" || len(original.delta.required) < 2 {
				t.Fatal("read lost original Set/write/formal SOURCE requirements")
			}
			// This is an entry experiment: an original source selection must really
			// reach the new publisher. A pending passive placeholder is not a pass.
			if writer.input == nil {
				t.Fatal("ENTRY_EXPERIMENT: original setter SOURCE borrower did not publish input")
			}
			if writer.input.expression != operation.AsBinaryExpression().Right || writer.input.producer != operation || writer.input.get != operation.AsBinaryExpression().Right || writer.input.cut != (sourceRelativeCut{operation: operation, reading: operation.AsBinaryExpression().Left}) {
				t.Fatal("setter formal next lost original RHS Get SOURCE or borrowed another cut")
			}
			if original.delta.extracted || len(original.delta.effects) != 0 || len(original.delta.invoked) != 0 {
				t.Fatal("SOURCE publication supplied DATA/BODY/invocation completion")
			}
			bad := original
			copySource := *original.callResult
			copyCapture := *writer
			endpoint := *writer.input
			endpoint.cut.invoking = read
			copyCapture.input = &endpoint
			copySource.capturedBinding = &copyCapture
			bad.callResult = &copySource
			if validStagedCallResultRecipe(bad) {
				t.Fatal("different original input cut accepted")
			}
		}
		if writer == nil {
			t.Fatal("original read has no lexical setter-write requirement")
		}
		if recipe.delta.extracted || work.closedOperationDependencies()[id.index] {
			t.Fatal("written read closed without real Set BODY/RHS DATA consumers")
		}
		if len(recipe.delta.effects) != 0 || len(recipe.delta.invoked) != 0 {
			t.Fatal("dormant source callback became work")
		}
		if work.describeSelectedCapturedWrites(facts, writer.root, q, enclosingCallableNode(writer.write), q.executable) {
			t.Fatal("nonborrower query issued a writer input")
		}
		generation := work.operationGeneration
		work.operationGeneration = &projectGeneration{}
		before := len(work.operationRecipes[source.request.producer].delta.required)
		work.prepareStagedCallResult(facts, id, q.executable)
		if len(work.operationRecipes[source.request.producer].delta.required) != before {
			t.Fatal("stale generation refined captured read")
		}
		work.operationGeneration = generation
		cloned := append([]callableFacts(nil), facts...)
		for i := range cloned {
			cloned[i].staged = cloneCallableExtraction(cloned[i].staged)
		}
		fresh := newCallableEffectWork(cloned)
		fresh.operationGeneration = generation
		fresh.indexOperationSources(cloned)
		if len(fresh.operationIDs) != 0 {
			t.Fatal("fresh graph inherited adoption")
		}
		freshID, ok := fresh.requireOperation(cloned, source.request)
		if !ok || fresh.closedOperationDependencies()[freshID.index] {
			t.Fatal("fresh graph lost source relation or inherited BODY/current completion")
		}
	})
}

// Representation is declaration-relative for a checked defaulted boolean. It
// does not select false or borrow an application's actual/default input value.
func TestStagedCapturedBindingCheckedFormal(t *testing.T) {
	const source = `export function invoke(fail=false){const box={get work(){return fail},set work(_next:boolean){}};box.work=true;return box.work}`
	withStagedAssignmentSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		var read *ast.Node
		walkNode(ast.GetSourceFileOfNode(operation).AsNode(), func(node *ast.Node) bool {
			if ast.IsIdentifier(node) && node.Text() == "fail" && node.Parent != nil && ast.IsReturnStatement(node.Parent) {
				read = node
			}
			return true
		})
		reader := enclosingCallableNode(read)
		work := newCallableEffectWork(facts)
		work.operationGeneration = q.owner.generation
		work.indexOperationSources(facts)
		value, ok := work.describeStagedCallResultSource(facts, installationFactIndex(t, facts, reader), read, q.executable)
		if !ok || value.capturedBinding == nil {
			t.Fatal("defaulted checked formal SOURCE rejected")
		}
		if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: value.request.producer, callResult: value}) {
			t.Fatal("formal source registration refused")
		}
		id, ok := work.requireOperation(facts, value.request)
		if !ok {
			t.Fatal("formal read requirement refused")
		}
		work.prepareStagedCallResult(facts, id, q.executable)
		delta := work.operationRecipes[value.request.producer].delta
		if !delta.extracted || len(delta.exposures) != 1 || delta.exposures[0].endpoint.kind != relativeEndpointRole || delta.exposures[0].endpoint.role != (sourceRelativeRole{kind: relativeRoleFormal, declaration: q.effectOwner, slot: 0}) {
			t.Fatal("formal source was selected as a default/caller value")
		}
	})
}

func TestStagedCapturedBindingUnpaidWriters(t *testing.T) {
	for _, source := range []string{
		`export function invoke(){let selected=1;const box={get work(){return selected},set work(next:number){selected+=next}};box.work=2;return box.work}`,
		`export function invoke(){let selected=1;const box={get work(){return selected},set work(next:number){selected++}};box.work=2;return box.work}`,
		`export function invoke(){let selected=1;const box={get work(){return selected},set work(next:number){next++;selected=next}};box.work=2;return box.work}`,
	} {
		withStagedAssignmentSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
			var read *ast.Node
			walkNode(ast.GetSourceFileOfNode(operation).AsNode(), func(node *ast.Node) bool {
				if ast.IsIdentifier(node) && node.Text() == "selected" && node.Parent != nil && ast.IsReturnStatement(node.Parent) {
					read = node
				}
				return true
			})
			reader := enclosingCallableNode(read)
			work := newCallableEffectWork(facts)
			work.operationGeneration = q.owner.generation
			work.indexOperationSources(facts)
			value, ok := work.describeStagedCallResultSource(facts, installationFactIndex(t, facts, reader), read, q.executable)
			if !ok {
				t.Fatal("known initializer SOURCE lost beside unpaid writer")
			}
			if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: value.request.producer, callResult: value}) {
				t.Fatal("read registration refused")
			}
			id, ok := work.requireOperation(facts, value.request)
			if !ok {
				t.Fatal("read requirement refused")
			}
			work.prepareStagedCallResult(facts, id, q.executable)
			delta := work.operationRecipes[value.request.producer].delta
			if delta.extracted || len(delta.exposures) != 1 || delta.exposures[0].endpoint.expression != value.binding.Initializer() {
				t.Fatal("unpaid compound/update erased initializer or acquired completion")
			}
			for _, alternative := range delta.exposures {
				if alternative.endpoint.kind == relativeEndpointUndefined {
					t.Fatal("compiler pending became runtime unknown/undefined")
				}
			}
		})
	}
}

// The production selected Get issuer must attach the lexical read requirement
// even while its existing capture BODY guard refuses transfer. A declaration
// inventory or direct test call to the capture constructor cannot satisfy this.
func TestStagedCapturedBindingOriginalGetDebt(t *testing.T) {
	const source = `export function invoke(){let selected=()=>window.name;const box={set work(next:()=>string){selected=next}};box.work=()=>document.title;return ({get value(){return selected}}).value}`
	withStagedAssignmentSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		var get, read *ast.Node
		walkNode(ast.GetSourceFileOfNode(operation).AsNode(), func(node *ast.Node) bool {
			if ast.IsPropertyAccessExpression(node) && node.Name().Text() == "value" {
				get = node
			}
			if ast.IsIdentifier(node) && node.Text() == "selected" && node.Parent != nil && ast.IsReturnStatement(node.Parent) {
				read = node
			}
			return true
		})
		work := newCallableEffectWork(facts)
		caller := installationFactIndex(t, facts, q.effectOwner)
		if _, ok := work.registerStagedGetResult(facts, caller, get, q.executable); !ok {
			t.Fatal("original Get registration refused")
		}
		work.observeStagedGetResult(facts, caller, get, q.executable)
		root := work.operationRecipes[stagedGetResultRequest(get, q.effectOwner, "value", nil).producer]
		capture := stagedBindingResultRequest(read, enclosingCallableNode(read))
		found := false
		for _, required := range root.delta.required {
			found = found || sameOperationRequest(required, capture)
		}
		if !found || work.operationRecipes[capture.producer].callResult == nil || work.operationRecipes[capture.producer].callResult.capturedBinding == nil {
			t.Fatal("ENTRY_EXPERIMENT: original selected Get did not attach captured binding SOURCE debt")
		}
		if root.delta.extracted || work.operationRecipes[stagedGetResultRequest(get, q.effectOwner, "effects", nil).producer].delta.extracted {
			t.Fatal("captured SOURCE registration paid Get output or BODY effects")
		}
		if len(work.operationIDs) != 0 {
			t.Fatal("passive Get SOURCE observation adopted captured read or writer")
		}
		id, adopted := work.requireOperation(facts, stagedGetResultRequest(get, q.effectOwner, "value", nil))
		if !adopted {
			t.Fatal("original Get SOURCE consumer could not require its context debt")
		}
		work.prepareOperationUses(facts, q.executable)
		work.prepareStagedCallResult(facts, id, q.executable)
		if len(work.operationRecipes[stagedGetResultRequest(get, q.effectOwner, "value", nil).producer].delta.exposures) != 0 {
			t.Fatal("captured context DATA leaked into Get output alternatives")
		}
	})
}
