package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Inspect the actual original coverage subscriber, not a supplied query or graph.
// Its callee Get precedes its own eager argument; argument work stays on BODY
// and the original writer's consumed SOURCE dependencies.
func TestOriginalCalleeCoverageExcludesEagerArguments(t *testing.T) {
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		var coverage *sourceStagedMemberCoverage
		var setter *ast.Node
		for _, recipe := range work.operationRecipes {
			member := recipe.memberSource
			if member != nil && member.coverage != nil && ast.IsSetAccessorDeclaration(member.parent.consumer) && sourceText(file, member.parent.use) == "events.push" {
				coverage, setter = member.coverage, member.parent.consumer
			}
		}
		if coverage == nil {
			t.Fatal("ENTRY: original setter callee coverage absent")
		}
		id, issued := work.operationIDs[coverage.request.producer]
		if !issued {
			t.Fatal("ENTRY: original coverage consumer absent")
		}
		state := &work.operations[id.index]
		subscriber := state.subscribers[sourceStagedOperationConsumer{coverage.request.consumer, coverage.request.edge}]
		if !state.memberCoverageObserved || !state.delta.extracted || subscriber == nil || subscriber.blocked || subscriber.applied != state.revision {
			t.Fatal("ENTRY: original coverage population not observed and delivered")
		}
		get := coverage.request.use
		if !ast.IsCallExpression(get.Parent) || get.Parent.Expression() != get || len(get.Parent.AsCallExpression().Arguments.Nodes) != 1 {
			t.Fatal("original callee/argument identity changed")
		}
		call := get.Parent
		argument := call.AsCallExpression().Arguments.Nodes[0]
		if !ast.IsBinaryExpression(argument) {
			t.Fatal("original argument concatenation absent")
		}
		tag := argument.AsBinaryExpression().Right
		earlier, deferred := false, false
		for _, required := range coverage.required {
			source := work.operationRecipes[required.producer].memberSource
			if source == nil {
				t.Fatal("original coverage child lost source owner")
			}
			if source.candidate.operation == argument || source.candidate.operation == tag {
				t.Fatal("callee Get coverage retained its original argument")
			}
			earlier = earlier || sourceText(file, source.candidate.operation) == "events.push('original:'+this.tag)"
			deferred = deferred || sourceText(file, source.candidate.operation) == "events.push('call:'+this.tag)"
		}
		if !earlier || !deferred {
			t.Fatal("coverage dropped earlier/other activation or deferred source work")
		}
		population := facts[work.memberNodes[setter]].staged.mutationBody
		callOwned, argumentOwned, getOwned := false, false, false
		for _, operation := range population.operations {
			callOwned = callOwned || operation.node == call && operation.kind == originalMutationBodyCall
			argumentOwned = argumentOwned || operation.node == argument && operation.kind == originalMutationBodyUnsupported
			getOwned = getOwned || operation.node == tag && operation.kind == originalMutationBodyGet
		}
		root := originalSetEffectsRoot(t, file, work)
		rootID, adopted := work.operationIDs[root.producer]
		if !adopted {
			t.Fatal("ENTRY: original writer absent")
		}
		writer := work.operations[rootID.index].subscribers[sourceStagedOperationConsumer{root.consumer, root.edge}]
		if writer == nil || writer.blocked || writer.applied != work.operations[rootID.index].revision {
			t.Fatal("original writer argument Effects not consumed")
		}
		consumedGet := false
		for _, access := range writer.readWrites {
			consumedGet = consumedGet || access.reference == tag && access.read
		}
		if !callOwned || !argumentOwned || !getOwned || !consumedGet {
			t.Fatal("callee ordering exclusion erased original Call/argument Effects ownership")
		}
	})
}

// An argument Set uses indexed assignment discovery as well as the general
// protocol population. Both must share the same original before-argument cut.
func TestCalleeCoverageExcludesArgumentSet(t *testing.T) {
	const source = `export function run(){const xs:number[]=[];const box={value:0};function write(){xs.push(box.value=1)}write();return box.value}`
	withOriginalSetEffectsCollector(t, source, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		var coverage *sourceStagedMemberCoverage
		for _, recipe := range work.operationRecipes {
			if member := recipe.memberSource; member != nil && member.coverage != nil && sourceText(file, member.parent.use) == "xs.push" {
				coverage = member.coverage
			}
		}
		if coverage == nil {
			t.Fatal("ENTRY: captured-array argument-Set callee coverage absent")
		}
		get := coverage.request.use
		if !ast.IsCallExpression(get.Parent) || get.Parent.Expression() != get || len(get.Parent.AsCallExpression().Arguments.Nodes) != 1 {
			t.Fatal("argument Set original Call absent")
		}
		argument := get.Parent.AsCallExpression().Arguments.Nodes[0]
		if !plainStagedAssignment(argument) {
			t.Fatal("original argument Set absent")
		}
		for _, required := range coverage.required {
			member := work.operationRecipes[required.producer].memberSource
			if member == nil {
				t.Fatal("original coverage child absent")
			}
			if member.candidate.operation == argument || member.candidate.operation == argument.AsBinaryExpression().Left {
				t.Fatal("callee Get coverage retained its argument Set")
			}
		}
		id, adopted := work.operationIDs[coverage.request.producer]
		if !adopted || !work.operations[id.index].memberCoverageObserved {
			t.Fatal("ENTRY: argument Set coverage consumer unobserved")
		}
		writer := facts[work.memberNodes[enclosingCallableNode(argument)]]
		owned := false
		for _, operation := range writer.staged.mutationBody.operations {
			owned = owned || operation.node == argument && operation.kind == originalMutationBodyWrite
		}
		registered := false
		for _, recipe := range work.operationRecipes {
			registered = registered || recipe.assignment != nil && recipe.assignment.root.use == argument
		}
		if !owned || !registered {
			t.Fatal("argument Set lost its original BODY/assignment Effects owner")
		}
	})
}
