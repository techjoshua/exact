package exactcompiler

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

const boundPatternPage = `import {stored, render} from './receipt.js';
declare function foreign(): string;
export function Stored(){return () => <span>{stored(() => window.name)}</span>;}
export function Invoked(){return () => <span>{render(() => window.name, () => document.title)}</span>;}
export function Mixed(){return () => <span>{render(() => window.name, () => {document.title; return foreign();})}</span>;}`

const boundPatternReceipt = `export let trace = '';
const marker = Symbol('extra');
type Reset = () => string;
type Metadata = {key:string; fallback:(input:{reset:Reset})=>string; [marker]:string};
export function storedReceipt(props: Metadata) {
	const {key,...copied} = props;
	return key;
}
export function stored(reset: Reset) {
	return storedReceipt({
		get key(){trace += 'key;';return 'stored';},
		get fallback(){trace += 'fallback get;';return reset;},
		get [marker](){trace += 'symbol get;';return 'extra';},
	});
}
function invoke(props: Metadata, reset: Reset) {
	const {key,...copied} = props;
	return copied.fallback({reset});
}
export function render(reset: Reset, fallback: Metadata['fallback']) {
	return invoke({
		get key(){trace += 'key;';return 'stored';},
		get fallback(){trace += 'fallback get;';return fallback;},
		get [marker](){trace += 'symbol get;';return 'extra';},
	}, reset);
}`

// The same executable import is edited to add a browser effect to an eager
// symbol getter and reverted. The retained caller must agree with a fresh one.
func TestBoundPatternComponentEffects(t *testing.T) {
	root := t.TempDir()
	page, receipt := filepath.Join(root, "page.tsx"), filepath.Join(root, "receipt.ts")
	if err := os.WriteFile(page, []byte(boundPatternPage), 0600); err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","jsx":"preserve","target":"esnext","strict":true,"types":[]},"include":["*.tsx"]}`), 0600); err != nil {
		t.Fatal(err)
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			for _, variant := range []struct{ source, placement string }{
				{boundPatternReceipt, "isomorphic"},
				{strings.Replace(boundPatternReceipt, "trace += 'symbol get;';", "document.title;trace += 'symbol get;';", 1), "client"},
				{"declare function opaque(): void;" + strings.Replace(boundPatternReceipt, "trace += 'symbol get;';", "opaque();trace += 'symbol get;';", 1), "unknown"},
				{boundPatternReceipt, "isomorphic"},
			} {
				if err := os.WriteFile(receipt, []byte(variant.source), 0600); err != nil {
					t.Fatal(err)
				}
				edit := session.Execute(Request{Kind: "compile", ID: receipt, Root: root, ConfigFile: config, Source: variant.source, Target: target, Diagnostics: "syntax"})
				if edit.Error != "" || hasErrorDiagnostic(edit.Diagnostics) {
					t.Fatal(edit.Error, edit.Diagnostics)
				}
				req := Request{Kind: "compile", ID: page, Root: root, ConfigFile: config, Source: boundPatternPage, Target: target, Diagnostics: "syntax", SourceMap: true}
				retained := session.Execute(req)
				fresh := NewSession().Execute(req)
				if retained.Error != "" || fresh.Error != "" || hasErrorDiagnostic(retained.Diagnostics) || hasErrorDiagnostic(fresh.Diagnostics) {
					t.Fatal(retained.Error, fresh.Error, retained.Diagnostics, fresh.Diagnostics)
				}
				if retained.Code != fresh.Code || !reflect.DeepEqual(retained.SourceMap, fresh.SourceMap) ||
					!reflect.DeepEqual(retained.Analysis.Components, fresh.Analysis.Components) {
					t.Fatalf("retained and fresh disagree for %s (code %v, map %v, components %v)", variant.placement, retained.Code == fresh.Code, reflect.DeepEqual(retained.SourceMap, fresh.SourceMap), reflect.DeepEqual(retained.Analysis.Components, fresh.Analysis.Components))
				}
				if len(retained.Analysis.Components) != 3 || retained.Analysis.Components[0].Name != "Stored" {
					t.Fatal("missing component analysis", retained.Analysis.Components)
				}
				stored := retained.Analysis.Components[0]
				if stored.Placement != variant.placement {
					t.Fatalf("Stored placement %s, want %s: %v", stored.Placement, variant.placement, stored.Diagnostics)
				}
				if variant.placement == "isomorphic" && (len(stored.ArtifactTargets) != 2 || !strings.Contains(retained.Code, "stored(() => window.name)")) {
					t.Fatal("stored callback or paired artifact missing", stored)
				}
				for _, component := range retained.Analysis.Components[1:] {
					if component.Placement != "client" {
						t.Fatal(component.Name, component)
					}
				}
			}
		})
	}
}

// A relative binding residual is attributed to the authored binding and selected
// helper even after the importing component supplies an opaque external input.
func TestNullishBoundPatternDiagnostic(t *testing.T) {
	root := t.TempDir()
	page, helper := filepath.Join(root, "page.tsx"), filepath.Join(root, "helper.ts")
	config := filepath.Join(root, "tsconfig.json")
	const source = `import {receipt, type Props} from './helper.js';
export function External(props: Props | null){return () => <span>{receipt(props)}</span>;}
export function Present(){return () => <span>{receipt({key: 'present'})}</span>;}
export function Absent(){return () => <span>{receipt(null)}</span>;}`
	const definition = `export type Props = {key: string};
export function receipt(props: Props | null) {
	const {key, ...copied} = props ?? {} as Partial<Props>;
	return key ?? 'none';
}`
	for file, text := range map[string]string{
		page: source, helper: definition,
		config: `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","jsx":"preserve","target":"esnext","strict":true,"types":[]},"include":["*.tsx"]}`,
	} {
		if err := os.WriteFile(file, []byte(text), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			req := Request{Kind: "compile", ID: page, Root: root, ConfigFile: config, Source: source, Target: target, Diagnostics: "syntax", SourceMap: true}
			for _, body := range []string{definition, "\n// move the binding\n" + definition, definition} {
				if err := os.WriteFile(helper, []byte(body), 0600); err != nil {
					t.Fatal(err)
				}
				edit := session.Execute(Request{Kind: "compile", ID: helper, Root: root, ConfigFile: config, Source: body, Target: target, Diagnostics: "syntax"})
				retained, fresh := session.Execute(req), NewSession().Execute(req)
				if edit.Error != "" || retained.Error != "" || fresh.Error != "" {
					t.Fatal(edit.Error, retained.Error, fresh.Error)
				}
				if retained.Code != fresh.Code || !reflect.DeepEqual(retained.SourceMap, fresh.SourceMap) ||
					!reflect.DeepEqual(retained.Analysis.Components, fresh.Analysis.Components) {
					t.Fatal("retained compiler disagrees with fresh analysis", retained.Analysis.Components, fresh.Analysis.Components)
				}
				if len(retained.Analysis.Components) != 3 {
					t.Fatal("missing component controls", retained.Analysis.Components)
				}
				for _, component := range retained.Analysis.Components {
					if component.Name != "External" {
						if component.Placement != "isomorphic" || len(component.ArtifactTargets) != 2 || len(component.Diagnostics) != 0 {
							t.Fatal("known concrete or nullish input did not settle its binding effects", component)
						}
						continue
					}
					offset := strings.Index(body, "{key,") + 1
					cause := fmt.Sprintf("receipt -> accessor provenance incomplete at %s:%d)", filepath.ToSlash(helper), offset)
					if component.Placement != "unknown" || !strings.Contains(strings.Join(component.Diagnostics, "\n"), cause) {
						t.Fatal("external input lost the authored binding location or call edge", component)
					}
				}
			}
		})
	}
}
