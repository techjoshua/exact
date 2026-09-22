package exactcompiler

import (
	"strings"
	"testing"
)

func TestSuppliedTargetPlacementDiagnostics(t *testing.T) {
	for _, test := range []struct {
		source    string
		duplicate bool
	}{
		{`export function Owner() { return () => <><_target /><_target /></>; }`, true},
		{`export function Owner() { return () => <div><header><_target /></header><footer><_target /></footer></div>; }`, true},
		{`export function Owner(props: { children?: unknown }) { return () => <div>{props.children}<_target /></div>; }`, true},
		{`export function Owner(props: { children?: unknown; active: boolean }) { return () => props.active ? props.children : <_target />; }`, false},
		{`export function Owner() { return () => <div><_target />{<_target />}</div>; }`, true},
		{`export function Owner(props: { active: boolean }) { return () => props.active ? <_target title="active" /> : <_target />; }`, false},
	} {
		response := NewSession().Execute(Request{ID: "target-placement.tsx", Kind: "compile", Target: TargetClient, Source: test.source})
		if containsDiagnosticCode(response.Diagnostics, "EXACT6020") != test.duplicate {
			t.Fatalf("placement diagnostic mismatch: %s %#v", response.Error, response.Diagnostics)
		}
		if !test.duplicate && (response.Error != "" || len(response.Diagnostics) != 0) {
			t.Fatalf("valid placement rejected: %s %#v", response.Error, response.Diagnostics)
		}
	}
}

func TestReactiveTargetBoundaryMatchesAcrossRenderers(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{
			ID: "target-hydration.tsx", Kind: "compile", Target: target,
			Source: `
				import type { Component, Child } from "@exactjs/core";
				export function Contribution(this: Component<{ label: string }>, props: { children?: Child }) {
					this.state.label = "ready";
					return () => <_target title={this.state.label} />;
				}
			`,
		})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("compile failed for %s: %s %#v", target, response.Error, response.Diagnostics)
		}
		if !strings.Contains(response.Code, "__exactDynamic(() => __exactSuppliedTarget(") {
			t.Fatalf("%s omitted the contribution's reactive boundary:\n%s", target, response.Code)
		}
	}
}

func TestImplicitSuppliedTargetInput(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, declaration := range []string{
			`export function Implicit() { return () => <_target title="implicit" />; }`,
			`export const Implicit = () => () => <_target title="implicit" />;`,
			`export function Implicit(props: { children?: unknown }) { return () => <_target title="implicit" />; }`,
			`export function Implicit({ label }: { label: string }) { return () => <_target title={label} />; }`,
			`export const Implicit = ({ label }: { label: string }) => () => <_target title={label} />;`,
		} {
			response := NewSession().Execute(Request{ID: "implicit-target.tsx", Kind: "compile", Target: target, Source: declaration})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
			}
			if !strings.Contains(response.Code, ".children") {
				t.Fatalf("supplied child absent: %s", response.Code)
			}
			if !strings.Contains(response.Code, `"children"`) {
				t.Fatalf("implicit child missing from the receiver prop layout: %s", response.Code)
			}
			if !strings.Contains(declaration, "props:") && !strings.Contains(response.Code, "__exactSuppliedProps:") {
				t.Fatalf("implicit input absent: %s", response.Code)
			}
		}
	}
}

func TestTransparentSuppliedTargetHelpers(t *testing.T) {
	for _, test := range []struct {
		body        string
		transparent bool
	}{
		{`return createCompiledTargetReceipt({ lang: "en" }, inputs.children);`, true},
		{`return createCompiledTargetReceipt({ lang: "en" }, "replacement");`, false},
		{`if (inputs.active) return createCompiledTargetReceipt({}, inputs.children); return "replacement";`, false},
	} {
		response := NewSession().Execute(Request{ID: "target-helper.tsx", Kind: "compile", Target: TargetClient,
			Source: `import { createCompiledTargetReceipt } from "@exactjs/core/runtime/component-abi";
                function project(inputs: { children?: unknown; active?: boolean }) { ` + test.body + ` }
                export function Contribution(props: { children?: unknown }) { return () => project(props); }`,
		})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("helper compile failed: %s %#v", response.Error, response.Diagnostics)
		}
		if strings.Contains(response.Code, "transparentTarget: true") != test.transparent {
			t.Fatalf("incorrect helper target proof (%t): %s", test.transparent, response.Code)
		}
	}
}

func TestExplicitTargetChildrenAreRejected(t *testing.T) {
	result := NewSession().Execute(Request{ID: "explicit-target.tsx", Kind: "compile",
		Source: `export function Owner(props: {children: unknown}) { return () => <_target>{props.children}</_target>; }`,
	})
	if !containsDiagnosticCode(result.Diagnostics, "EXACT6021") {
		t.Fatalf("explicit target children were accepted: %#v", result.Diagnostics)
	}
}
