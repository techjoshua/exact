package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// A descriptor's data can supply an invoked callback while its dynamic key
// remains unknown. The render dependency consumes both contributions.
func TestReflectiveCallableDataAndUnknownKeyEffects(t *testing.T) {
	root, config := formsSourceFixture(t)
	const fixture = `
import type {Component} from '@exactjs/core';
type Cell = {field: () => string};

function install(cell: Cell, key: PropertyKey, payload: Cell['field']) {
	Object.defineProperty(cell, key, {value: payload});
}

function paint(key: string) {
	const cell = {field: () => 'safe'};
	const donor = () => DONOR;
	install(cell,KEY,donor);
	return cell.field();
}

export function Page(this: Component<{}>, props: {keyName: string}) {
	return () => <p>{paint(props.keyName)}</p>;
}
`
	for _, row := range []struct {
		name, donor, key, placement string
		browser, unknownKey         bool
	}{
		{"mixed", "document.title", "key", "client", true, true},
		{"known key", "document.title", "'field'", "client", true, false},
		{"neutral donor", "'safe'", "key", "unknown", false, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := strings.NewReplacer("DONOR", row.donor, "KEY", row.key).Replace(fixture)
			for _, target := range []Target{TargetClient, TargetServer} {
				response := formsCompileSource(t, root, config, source, target)
				if hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("%s compile: %v", target, response.Diagnostics)
				}
				component := findComponent(t, response.Analysis.Components, "Page")
				if component.Placement != row.placement {
					t.Fatalf("%s placement=%s want %s", target, component.Placement, row.placement)
				}
				paint := findCallable(t, response.Analysis.Callables, "paint")
				browser, unknownKey := false, false
				keyPosition := fmt.Sprintf(":%d", strings.Index(source, row.key+",donor"))
				for _, effect := range paint.EffectSources {
					browser = browser || effect.Environment == "browser" && effect.Description == "document"
					unknownKey = unknownKey || effect.Environment == "unknown" && strings.HasSuffix(effect.Description, keyPosition)
				}
				if browser != row.browser || unknownKey != row.unknownKey {
					t.Fatalf("%s browser=%v unknownKey=%v effects=%v", target, browser, unknownKey, paint.EffectSources)
				}
			}
		})
	}
}

// The selected Reflect.get owns its eager getter. The callable it reads keeps
// its own invocation effects and the original cut through later assignments.
func TestReflectGetSelectedSourceEffects(t *testing.T) {
	root, config := formsSourceFixture(t)
	const component = `
export function Page(props: {keyName: string; pick: boolean}) {
	return () => <p>{paint(props.keyName, props.pick)}</p>;
}`
	for _, row := range []struct {
		name, body       string
		browser, unknown bool
	}{
		{"eager getter", "const box={get x(){return document.title}}; return Reflect.get(box,'x');", true, false},
		{"stored callback", "const box={x:()=>document.title}; const saved=Reflect.get(box,'x'); return typeof saved;", false, false},
		{"captured before replacement", "const box={x:()=>document.title}; const saved=Reflect.get(box,'x'); box.x=()=> 'safe'; return saved();", true, true},
		{"mixed keys", "const box={x:()=>document.title}; return Reflect.get(box,pick?'x':input)();", true, true},
		{"shadowed Reflect", "const Reflect={get(box:{use:()=>string},_key:string){return box.use}}; const box={use:()=> 'safe',x:()=>document.title}; return Reflect.get(box,'x')();", false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := "function paint(input:string,pick:boolean){" + row.body + "}" + component
			response := formsCompileSource(t, root, config, source, TargetServer)
			if hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Diagnostics)
			}
			paint := findCallable(t, response.Analysis.Callables, "paint")
			browser := containsEnvironment(paint.EffectSources, "browser")
			unknown := containsEnvironment(paint.EffectSources, "unknown")
			if browser != row.browser || unknown != row.unknown {
				t.Fatalf("browser=%v unknown=%v effects=%v", browser, unknown, paint.EffectSources)
			}
		})
	}
}

// An inline member read consumes only the possible descriptor for that local
// field. A shadowed writer or another field does not attach the callback.
func TestReflectiveInlineReturnedLiteral(t *testing.T) {
	root, config := formsSourceFixture(t)
	const fixture = `
function make(donor: () => string) {
	const record = {field: () => 'initial', other: () => 'other'};
	WRITER
	return record;
}
function paint() { return make(() => DONOR).FIELD(); }
export function Page() { return () => <p>{paint()}</p>; }
`
	const writer = "Object.defineProperty(record, 'field', {value: donor});"
	for _, row := range []struct {
		name, write, donor, field string
		browser                   bool
	}{
		{"installed field", writer, "document.title", "field", true},
		{"neutral donor", writer, "'safe'", "field", false},
		{"other field", writer, "document.title", "other", false},
		{"unreachable writer", "if (false) " + writer, "document.title", "field", false},
		{"shadowed writer", "const Object={defineProperty(_target:object,_key:string,_descriptor:PropertyDescriptor){}}; " + writer, "document.title", "field", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := strings.NewReplacer("WRITER", row.write, "DONOR", row.donor, "FIELD", row.field).Replace(fixture)
			response := formsCompileSource(t, root, config, source, TargetServer)
			if hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Diagnostics)
			}
			paint := findCallable(t, response.Analysis.Callables, "paint")
			browser := containsEnvironment(paint.EffectSources, "browser")
			if browser != row.browser {
				t.Fatalf("browser=%v want=%v effects=%v", browser, row.browser, paint.EffectSources)
			}
		})
	}
}
