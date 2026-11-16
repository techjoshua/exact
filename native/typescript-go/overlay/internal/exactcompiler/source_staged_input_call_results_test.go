package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// An actual declaration Call lends its source-input vector, without a fabricated
// B. The shared result producer delivers DATA on the existing queue while its
// independent canonical body requirement remains unready.
func TestStagedInputCallResultOriginalAssociation(t *testing.T) {
	const source = `function factory(){return()=>document.title}function consume(callback:()=>string){callback()}export function invoke(){consume(factory())}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, producing *ast.Node) {
		file := ast.GetSourceFileOfNode(producing)
		outer := producing.Parent
		for outer != nil && !ast.IsCallExpression(outer) {
			outer = outer.Parent
		}
		if outer == nil {
			t.Fatal("original argument Call missing")
		}
		facts := stagedReturnSourceFacts(file)
		work := registerCallableEffectWork(facts)
		caller := work.memberNodes[enclosingCallableNode(outer)]
		work.extracting = caller
		for _, call := range []*ast.Node{outer, producing} {
			if !work.stageSourceDeclarationCall(facts, caller, call, owner) {
				t.Fatal("original source Call association refused", call.Pos())
			}
		}
		work.extracting = -1
		var call sourceStagedDeclarationCall
		for _, installed := range facts[caller].staged.calls {
			if installed.invocation.operation == outer {
				call = installed
			}
		}
		if call.sourceInputs == nil || call.inputs != nil {
			t.Fatal("actual source-input vector missing")
		}
		var endpoint sourceRelativeEndpoint
		for _, binding := range call.sourceInputs.bindings.bindings {
			if binding.target.kind == relativeRoleFormal && binding.target.slot == 0 && len(binding.sources) == 1 {
				endpoint = binding.sources[0]
			}
		}
		if endpoint.kind != relativeEndpointResult || endpoint.expression != producing {
			t.Fatal("original formal argument result missing")
		}
		reading, registered := work.prepareStagedInputCallResult(facts, caller, call, endpoint, owner)
		if !registered || reading.producer.operation != producing || reading.reading.operation != outer || reading.cut.operation != producing || reading.inputs != nil {
			t.Fatal("producer and argument consumer were conflated")
		}
		if _, available := work.stagedInputCallResultData(facts, reading); available {
			t.Fatal("registration supplied an undelivered result")
		}
		for _, alter := range []func(*sourceStagedDeclarationCall, *sourceRelativeEndpoint){
			func(c *sourceStagedDeclarationCall, _ *sourceRelativeEndpoint) {
				copy := *c.sourceInputs
				c.sourceInputs = &copy
			},
			func(c *sourceStagedDeclarationCall, _ *sourceRelativeEndpoint) { c.invocation.actuals = nil },
			func(_ *sourceStagedDeclarationCall, e *sourceRelativeEndpoint) { e.cut.initializing = outer },
		} {
			bad, value := call, cloneSourceRelativeEndpoint(endpoint)
			alter(&bad, &value)
			if _, admitted := work.prepareStagedInputCallResult(facts, caller, bad, value, owner); admitted {
				t.Fatal("copied association or changed original vector/cut accepted")
			}
		}
		work.prepareOperationUses(facts, owner)
		delivery, available := work.stagedInputCallResultData(facts, reading)
		if !available || delivery.revision == 0 || len(delivery.delta.exposures) != 1 {
			t.Fatal("source DATA was not delivered", available, delivery)
		}
		value := delivery.delta.exposures[0].endpoint
		if value.creation != producing || value.returning == nil || !ast.IsArrowFunction(value.expression) {
			t.Fatal("delivered source lost its producing Call/return association")
		}
		again, available := work.stagedInputCallResultData(facts, reading)
		if !available || len(again.delta.exposures) != 1 || !sameOperationAlternative(delivery.delta.exposures[0], again.delta.exposures[0]) {
			t.Fatal("queue cursor consumption discarded the known DATA prefix")
		}
		delivery.delta.exposures[0].endpoint.creation = outer
		if again.delta.exposures[0].endpoint.creation != producing {
			t.Fatal("consumer borrowed mutable subscriber storage")
		}
		id := work.operationIDs[reading.producer]
		if work.closedOperationDependencies()[id.index] {
			t.Fatal("local result extraction paid an unavailable canonical body")
		}
		for _, fact := range facts {
			if len(fact.summary.DirectEffectSources)+len(fact.summary.EffectSources) != 0 {
				t.Fatal("stored callback body was invoked by DATA delivery")
			}
		}
		work.operationGeneration = &projectGeneration{}
		if _, available := work.stagedInputCallResultData(facts, reading); available {
			t.Fatal("another generation inherited the argument result")
		}
	})
}

// A ready source definition comes from real collection, while the new work's
// summary namespace has not started. Early DATA consumers may require its body
// but cannot acknowledge revision zero as an observed contribution.
func TestStagedInputSummaryWaitsForGraphRevision(t *testing.T) {
	responseSession := NewSession()
	response := responseSession.Execute(Request{Kind: "analyze", ID: "/virtual/input-summary-phase.ts", Source: `function leaf(){return 1}export function invoke(){return leaf()}`, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	facts := stagedDeclarationFacts(responseSession)
	work := callableEffectWork{extracting: -1}
	work.indexOperationSources(facts)
	consumer, producer := -1, -1
	for index, fact := range facts {
		if fact.summary.Name == "invoke" {
			consumer = index
		}
		if fact.summary.Name == "leaf" {
			producer = index
		}
	}
	if consumer < 0 || producer < 0 || !facts[producer].staged.ready {
		t.Fatal("real ready canonical producer missing")
	}
	operation := facts[consumer].staged.calls[0].invocation.operation
	cut := sourceRelativeCut{operation: operation, use: operation, reading: operation}
	work.requireStagedSummary(facts, consumer, producer, "input-phase-body", operation, cut)
	work.observeStagedSummary(facts, consumer, producer, "input-phase-body")
	dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, "input-phase-body"}]
	if dependency == nil || dependency.consumed != 0 || dependency.invalid {
		t.Fatal("uninitialized body revision acquired consumption authority")
	}
	work.initializePropagation(facts)
	work.observeStagedSummary(facts, consumer, producer, "input-phase-body")
	if dependency.consumed == 0 || dependency.consumed != work.stagedRevisions[producer] {
		t.Fatal("actual initialized revision was not observed")
	}
}
