package exactcompiler

import "testing"

func TestComponentExecutionConnectsSharedStatePorts(t *testing.T) {
	components := []Component{{ID: "component:Search", Name: "Search"}}
	continuations := []Continuation{
		{
			ID: "load", TaskID: "load", ComponentID: "component:Search",
			Placement: "server", Readiness: "blocking", Concurrency: "latest",
			Activation: ContinuationActivation{Dependencies: []TaskDependency{
				{Index: 0, Source: "props", Path: "query"},
			}},
			Effects: ContinuationEffects{StateWrites: []StateEffect{
				{Path: "result", Kind: "write", Confidence: "exact"},
			}},
		},
		{
			ID: "format", TaskID: "format", ComponentID: "component:Search",
			Placement: "isomorphic", Readiness: "nonblocking", Concurrency: "parallel",
			Activation: ContinuationActivation{Dependencies: []TaskDependency{
				{Index: 0, Source: "state", Path: "this.state.result"},
			}},
			Effects: ContinuationEffects{StateWrites: []StateEffect{
				{Path: "result", Kind: "write", Confidence: "exact"},
			}},
		},
	}
	bindings := []ReactiveBinding{
		{Component: "Search", Name: "query", Provenance: "props", Dependencies: []string{}},
		{
			Component: "Search", Name: "label", Provenance: "derived",
			Dependencies: []string{"query"}, SafeToReevaluate: true,
			References: []SourceSpan{{Start: 1, Length: 1}},
		},
	}

	attachComponentExecutionPlans(components, continuations, nil, bindings)
	plan := components[0].Execution
	if plan.Version != 1 || len(plan.Transitions) != 2 {
		t.Fatalf("unexpected execution plan: %#v", plan)
	}
	if len(plan.Ports) != 2 {
		t.Fatalf("expected props and shared state ports, got %#v", plan.Ports)
	}
	result := plan.Ports[1]
	if result.Kind != "state" || result.Path != "result" || result.Direction != "inout" {
		t.Fatalf("expected connected result port, got %#v", result)
	}
	if plan.Transitions[0].Outputs[0] != plan.Transitions[1].Inputs[0] {
		t.Fatalf("producer and consumer did not share a port: %#v", plan.Transitions)
	}
	if len(plan.Reactive) != 2 || plan.Reactive[0].Allocation != "inline" ||
		plan.Reactive[1].Allocation != "live-slot" {
		t.Fatalf("unexpected reactive allocations: %#v", plan.Reactive)
	}
}

func TestComponentExecutionMarksInvokedTransitionsAsInteractions(t *testing.T) {
	components := []Component{{ID: "component:Form", Name: "Form"}}
	continuations := []Continuation{{
		ID: "submit", TaskID: "submit", ComponentID: "component:Form",
		Placement: "server", Readiness: "nonblocking", Concurrency: "queue",
		Invocation: &ContinuationInvocation{Concurrency: "queue"},
	}}

	attachComponentExecutionPlans(components, continuations, nil, nil)
	transition := components[0].Execution.Transitions[0]
	if transition.Activation != "interaction" || transition.Concurrency != "queue" {
		t.Fatalf("unexpected interaction transition: %#v", transition)
	}
}

func TestComponentExecutionIncludesClientOnlyAsyncTasks(t *testing.T) {
	components := []Component{{ID: "component:Editor", Name: "Editor"}}
	tasks := []Task{{
		ID: "validate", Component: "Editor", Placement: "client", Readiness: "nonblocking",
		Dependencies: []TaskDependency{{Index: 0, Source: "state", Path: "draft"}},
		Writes:       []StateEffect{{Path: "valid", Kind: "write", Confidence: "exact"}},
	}}

	attachComponentExecutionPlans(components, nil, tasks, nil)
	transition := components[0].Execution.Transitions[0]
	if transition.Placement != "client" || len(transition.Inputs) != 1 || len(transition.Outputs) != 1 {
		t.Fatalf("unexpected client transition: %#v", transition)
	}
}
