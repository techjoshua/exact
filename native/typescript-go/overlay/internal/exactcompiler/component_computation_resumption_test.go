package exactcompiler

import (
	"strings"
	"testing"
)

// Every browser projection must initialize compiler computations before restoring SSR state.
func TestClientComputationsUseSynchronousInitializationAcrossProjections(t *testing.T) {
	for _, projection := range []ComponentContractProjection{
		ComponentContractProjectionComplete,
		ComponentContractProjectionHydrate,
		ComponentContractProjectionClient,
	} {
		t.Run(string(projection), func(t *testing.T) {
			response := NewSession().Execute(Request{
				ID: "resumed-computation.tsx", Kind: "compile", Target: TargetClient,
				ComponentContractProjection: projection,
				Source: `
					declare class Component<State> { state: State }
					declare function format(value: number): number;
					export function Counter(this: Component<{ count: number }>, props: { initial: number }) {
						this.state.count = format(props.initial);
						return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
					}
				`,
			})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			if !strings.Contains(response.Code, "activateComputationForHost as") ||
				strings.Contains(response.Code, "activateTaskForHost as") ||
				strings.Contains(response.Code, "markComponentContinuationTask as") {
				t.Fatalf("synchronous computation was scheduled after restoration:\n%s", response.Code)
			}
		})
	}
}

func TestHydrateResumptionRetainsServerCompletionAllowlist(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "resumed-completion.tsx", Kind: "compile", Target: TargetClient,
		ComponentContractProjection: ComponentContractProjectionHydrate,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			export function Counter(this: Component<{ count: number }>, props: { initial: number }) {
				this.state.count = props.initial;
				const prepare = (_task: TaskContext = TaskContext.server().blocking()) => {
					void _task;
					this.state.count = props.initial + 10;
				};
				prepare();
				return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
	}
	start := strings.Index(response.Code, "resumption:")
	if start < 0 {
		t.Fatalf("missing resumption contract:\n%s", response.Code)
	}
	found := false
	for _, continuation := range response.Analysis.Continuations {
		if continuation.Placement == "server" {
			found = true
			if !strings.Contains(response.Code[start:], continuation.ID) {
				t.Fatalf("server completion omitted from compact allowlist:\n%s", response.Code)
			}
		}
	}
	if !found {
		t.Fatal("fixture did not retain a server continuation")
	}
}
