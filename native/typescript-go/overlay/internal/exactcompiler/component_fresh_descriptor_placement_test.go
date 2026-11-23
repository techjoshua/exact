package exactcompiler

import (
	"strings"
	"testing"
)

// An inherited descriptor field can enter browser code during component setup,
// even when setup discards the fresh target and reaches the definition in a helper.
func TestComponentFreshDescriptorPlacement(t *testing.T) {
	const descriptorCall = "Object.defineProperty({}, 'own', { value: 7, writable: true });"
	const helper = "function install() {" + descriptorCall + "}"
	const writer = "Object.defineProperty(Object.prototype, 'enumerable', { get() { return !!document.title; }, enumerable: false, configurable: true });"
	const conditional = "if (props.enabled) {" + writer + "}"
	const laterWriter = "Object.defineProperty(Object.prototype, 'configurable', { get() { return !!document.title; }, enumerable: false, configurable: true });"
	const deletesLater = "Object.defineProperty(Object.prototype, 'enumerable', { get() { Reflect.deleteProperty(this, 'configurable'); return true; }, configurable: true });"
	laterHelper := strings.Replace(helper, "{ value:", "{ configurable: false, value:", 1)
	for _, test := range []struct {
		name, setup string
		browser     bool
	}{
		{"direct", writer + descriptorCall, true},
		{"reached helper", writer + helper + "install();", true},
		{"conditional writer reaches helper", helper + conditional + "install();", true},
		{"writer and helper in same arm", helper + "if (props.enabled) {" + writer + "install();}", true},
		{"writer on an earlier instance’s opposite arm", helper + conditional + "else { install(); }", true},
		{"dead writer", helper + "if (false) {" + writer + "} install();", false},
		{"exited writer arm", helper + "if (props.enabled) {" + writer + "return () => <output>0</output>;} install();", true},
		{"writer after helper", helper + "install();" + writer, true},
		{"writer after direct conversion", descriptorCall + writer, true},
		{"writer reaches next iteration", helper + "for (let i = 0; i < 2; i++) { install(); if (i === 0) {" + writer + "} }", true},
		{"writer after read in a labeled loop", helper + "once: for (;;) { install();" + writer + "break once; }", true},
		{"writer in single do body", helper + "do { install();" + writer + "} while (false);", true},
		{"later field deleted by earlier getter", deletesLater + laterWriter + laterHelper + "install();", true},
		{"earlier getter with no inherited later field", deletesLater + laterHelper + "install();", false},
		{"absent", helper + "install();", false},
		{"dormant read", writer + helper, false},
		{"dormant writer", "function unused() {" + writer + "}" + helper + "install();", false},
		{"unrelated key", strings.Replace(writer, "'enumerable'", "'unrelated'", 1) + helper + "install();", false},
		{"unrelated receiver", strings.Replace(writer, "Object.prototype", "{}", 1) + helper + "install();", false},
		{"own enumerable", writer + strings.Replace(helper, "{ value:", "{ enumerable: false, value:", 1) + "install();", false},
		{"own enumerable with nonliteral initializer", writer + strings.Replace(helper, "{ value:", "{ enumerable: 1 < 0, value:", 1) + "install();", false},
		{"own enumerable with eager browser initializer", writer + strings.Replace(descriptorCall, "{ value:", "{ enumerable: !!document.title, value:", 1), true},
		{"lexically shadowed Object", writer + "function install() { const Object = { defineProperty(target: object, _key: string, _descriptor: object) { return target; } };" + descriptorCall + "} install();", false},
		{"plain direct", descriptorCall, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			page := `import type { Component } from '@exactjs/core';
export function Page(this: Component<{}>, props: { enabled: boolean }) {
	const xs: number[] = [];
	` + test.setup + `
	const size = xs.push(42);
	return () => <output>{size}</output>;
}`
			fixture := newPublicAwaitRequiredFixture(t, page)
			for _, target := range []Target{TargetServer, TargetClient} {
				request := fixture.request("compile", "entry.tsx")
				request.Target, request.ServerComponents = target, true
				response := NewSession().Execute(request)
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" || len(response.Analysis.Components) != 1 {
					t.Fatalf("%s compile failed: %s %#v", target, response.Error, response.Diagnostics)
				}
				if len(response.Analysis.Tasks) != 0 {
					t.Fatalf("%s moved ordered descriptor setup into a task: %#v", target, response.Analysis.Tasks)
				}
				component := response.Analysis.Components[0]
				if (component.EnvironmentEffect == "browser") != test.browser || (component.Placement == "client") != test.browser {
					t.Fatalf("%s placement %s, effect %s, expected browser dependency %v", target, component.Placement, component.EnvironmentEffect, test.browser)
				}
				if target == TargetServer {
					boundary := strings.Contains(response.Code, "createServerBoundaryReceipt")
					if boundary != test.browser || test.browser && strings.Contains(response.Code, "document.title") {
						t.Fatal("unexpected server artifact for descriptor conversion")
					}
				}
			}
		})
	}
}

// The descriptor Get must not hide an independent effect that owns task
// activation. In particular, both routes may contribute the same environment.
func TestComponentFreshDescriptorPreservesIndependentTask(t *testing.T) {
	for _, getter := range []struct {
		name, result string
	}{
		{"neutral", "true"},
		{"browser", "this.value === 7 && !!document.title"},
		{"shared browser source", "this.value === 7 && !!localStorage.getItem('descriptor')"},
	} {
		t.Run(getter.name, func(t *testing.T) {
			page := `import type { Component } from '@exactjs/core';
export function Page(this: Component<{}>) {
	function persist() {
		Object.defineProperty({}, 'a', {value: 7});
		localStorage.setItem('key', 'value');
	}
	void persist();
	Object.defineProperty(Object.prototype, 'enumerable', {
		get() { return ` + getter.result + `; }, enumerable: false, configurable: true
	});
	return () => <output>1</output>;
}`
			fixture := newPublicAwaitRequiredFixture(t, page)
			for _, target := range []Target{TargetServer, TargetClient} {
				request := fixture.request("compile", "entry.tsx")
				request.Target, request.ServerComponents = target, true
				response := NewSession().Execute(request)
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("%s compile failed: %s %#v", target, response.Error, response.Diagnostics)
				}
				tasks := response.Analysis.Tasks
				if len(tasks) != 1 || !tasks[0].FunctionDefined || tasks[0].Placement != "client" {
					t.Fatalf("%s lost independent storage task: %#v", target, tasks)
				}
			}
		})
	}
}
