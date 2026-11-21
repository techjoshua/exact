package exactcompiler

import (
	"strings"
	"testing"
)

// Receipt creation can read authored metadata before a component ever redeems its executor.
func TestPublicOperationCreationEffects(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, row := range []struct {
		name, metadata string
		refused        bool
	}{
		{"plain", "{ key: 'item' }", false},
		{"key getter", "{ get key(){return document.title} }", true},
		{"domain getter", "{ get domain(){void document.title; return undefined} }", true},
		{"spread getter", "{ key:'item', get extra(){return document.title} }", true},
		{"no copy", "{ key:undefined, get extra(){return document.title} }", false},
		{"domain only", "{ domain:{executionRoot:'component'}, get extra(){return document.title} }", false},
		{"unused nested getter", "{ key:'item', extra:{get nested(){return document.title}} }", false},
		{"inherited copy excluded", "new class {key='item'; get extra(){return document.title}}", false},
		{"updated before creation", "{key:undefined as string|undefined, get extra(){return document.title}}; meta.key='item'", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `import {TaskContext, type Component} from '@exactjs/core';
import {createOpaqueOperation} from '@exactjs/core/runtime/component-operations';
export function Page(this:Component<{}>){
function issue(task:TaskContext=TaskContext.server()){const meta=` + row.metadata + `;void createOpaqueOperation(()=>document.title, meta)}
return()=> <button onClick={()=>issue()}>issue</button>}`
			for _, target := range []Target{TargetClient, TargetServer} {
				result := formsCompileSource(t, root, config, source, target)
				errors := formsDiagnosticDetails(result.Diagnostics)
				if row.refused {
					if !containsDiagnosticCode(result.Diagnostics, "EXACT2001") || !strings.Contains(strings.Join(errors, " "), "document") {
						t.Errorf("%s missing browser getter diagnostic: %v", target, errors)
					}
				} else if result.Code == "" || hasErrorDiagnostic(result.Diagnostics) {
					t.Errorf("%s unexpected error: %v", target, errors)
				}
			}
		})
	}
}

// Optional calls of the known Core operation still contribute reachable user work.
func TestOptionalPublicOperationEffects(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, call := range []string{
		"issue?.(browser, {get key(){return document.title}})",
		"const receipt=issue?.(browser); execute?.(receipt,{})",
	} {
		source := `import {TaskContext,type Component} from '@exactjs/core';
import {createOpaqueOperation as issue,executeOpaqueOperation as execute} from '@exactjs/core/runtime/component-operations';
function browser(){return document.title}
export function Page(this:Component<{}>){function run(task:TaskContext=TaskContext.server()){` + call + `}return()=> <button onClick={()=>run()}>run</button>}`
		for _, target := range []Target{TargetClient, TargetServer} {
			result := formsCompileSource(t, root, config, source, target)
			if !containsDiagnosticCode(result.Diagnostics, "EXACT2001") || result.Code != "" {
				t.Errorf("%s accepted optional operation %s: %v", target, call, formsDiagnosticDetails(result.Diagnostics))
			}
		}
	}
}
