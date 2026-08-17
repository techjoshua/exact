package exactcompiler

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

func TestSynchronizedProjectMatchesFreshCrossFileCompilation(t *testing.T) {
	root := t.TempDir()
	childFile := filepath.Join(root, "Child.tsx")
	pageFile := filepath.Join(root, "Page.tsx")
	configFile := filepath.Join(root, "tsconfig.json")
	childSource := `export function Child() { return () => <span>child</span>; }`
	pageSource := `
		import { Child } from "./Child.js";
		export function Page() {
			document.title = "page";
			return () => <main><Child /></main>;
		}
	`
	for filename, source := range map[string]string{
		childFile: childSource,
		pageFile:  pageSource,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(configFile, []byte(`{"compilerOptions":{"jsx":"preserve"}}`), 0o600); err != nil {
		t.Fatal(err)
	}

	session := NewSession()
	synchronized := session.Execute(Request{
		Kind:       "synchronize",
		Root:       root,
		ConfigFile: configFile,
		Sources: []ProjectSource{
			{ID: childFile, Source: childSource},
			{ID: pageFile, Source: pageSource},
		},
	})
	if synchronized.Error != "" {
		t.Fatal(synchronized.Error)
	}

	for _, request := range []Request{
		{ID: pageFile, Kind: "compile", Root: root, ConfigFile: configFile, Source: pageSource},
		{ID: childFile, Kind: "compile", Root: root, ConfigFile: configFile, Source: childSource},
	} {
		cached := session.Execute(request)
		fresh := NewSession().Execute(request)
		if cached.Error != "" || fresh.Error != "" {
			t.Fatalf("cached error %q; fresh error %q", cached.Error, fresh.Error)
		}
		if !cached.CacheHit {
			t.Fatalf("synchronized source %s did not reuse its program generation", request.ID)
		}
		if cached.Code != fresh.Code ||
			!reflect.DeepEqual(cached.Analysis.Components, fresh.Analysis.Components) {
			t.Fatalf("synchronized output for %s diverged from fresh compilation", request.ID)
		}
	}
}

func TestSessionReportsTypeScriptAndBackendVersions(t *testing.T) {
	response := NewSession().Execute(Request{Kind: "version"})
	if response.ProtocolVersion != ProtocolVersion ||
		response.BackendVersion != BackendVersion ||
		!strings.HasPrefix(response.TypeScriptVersion, "7.") {
		t.Fatalf("native version response is incomplete: %#v", response)
	}
}

func TestUTF16PackageEnhancementBoundaryConversion(t *testing.T) {
	source := "const label = '°😀';\nimport * as time from 'enhancement';"
	authored := "const label = '°😀';"
	boundary, valid := utf16OffsetToByteOffset(source, len([]rune(authored))+1)
	if !valid || source[:boundary] != authored {
		t.Fatalf("UTF-16 boundary did not preserve authored source: valid=%v prefix=%q", valid, source[:boundary])
	}
	if _, valid := utf16OffsetToByteOffset("😀", 1); valid {
		t.Fatal("boundary inside a surrogate pair was accepted")
	}
	if units := utf16Length("°😀"); units != 3 {
		t.Fatalf("UTF-16 length was %d, want 3", units)
	}
}

func TestSessionEmitsRenderProgramsWithLazyRegionFallback(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "planned.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			export function Planned(props: { label: string }) {
				return () => <span>{props.label}</span>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		"createCompiledRenderProgram",
		"version: 1",
		"kind: \"text\"",
		"ssrParts:",
		"kind: \"node-open\"",
		"kind: \"node-close\"",
		"() => __exactVNode(\"span\"",
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("planned output omitted %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionOmitsServerMarkerProgramsFromClientArtifacts(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "planned-client.tsx", Kind: "compile", Target: TargetClient,
		Source: `
			export function Planned(props: { label: string }) {
				return () => <span>{props.label}</span>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, "createCompiledRenderProgram") ||
		strings.Contains(response.Code, "ssrParts:") ||
		strings.Contains(response.Code, "ssrOperations:") {
		t.Fatalf("client render program retained server marker metadata:\n%s", response.Code)
	}
}

func TestSessionEmitsFiniteHostPropertiesInRenderPrograms(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "planned-props.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			export function Planned(props: { label: string; disabled: boolean }) {
				return () => <button className="action" disabled={props.disabled}>{props.label}</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		"createCompiledRenderProgram",
		"kind: \"class\"",
		"name: \"className\"",
		"kind: \"property\"",
		"name: \"disabled\"",
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("planned host-property output omitted %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionPreservesInheritedSvgNamespaceForConditionalRenderPrograms(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "planned-svg.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			export function Route(props: { path?: string }) {
				return () => <svg>{props.path ? <path className="route" d={props.path} /> : null}</svg>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, `namespace: "svg", template: "<path`) ||
		!strings.Contains(response.Code, `tag: "path", namespace: "svg"`) {
		t.Fatalf("conditional SVG program lost its inherited namespace:\n%s", response.Code)
	}
}

func TestSessionMarksOnlyProvenAsyncSiblingGroups(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "siblings.tsx", Kind: "compile", Target: TargetServer,
		Source: `
			function Left() { return () => <span>left</span>; }
			function Right() { return () => <span>right</span>; }
			export function Page() { return () => <main><Left /><Right /></main>; }
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, "__exactAsyncSiblings(__exactVNode(\"main\"") {
		t.Fatalf("proven sibling group was not marked:\n%s", response.Code)
	}
}

func TestSessionValidatesOnlyCommentDirectives(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			const text = "@exact unknown";
			// @exact keep=isomorphic
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 1 {
		t.Fatalf("received %d diagnostics, expected 1", len(response.Diagnostics))
	}
	if response.Diagnostics[0].Code != "EXACT1001" {
		t.Fatalf("unexpected directive diagnostic: %#v", response.Diagnostics[0])
	}
}

func TestSessionRewritesModuleAliasesBeforeNativePrinting(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.ts",
		Kind: "compile",
		Source: `
			import { value } from "./runtime.js";
			export { value as exported } from "./exported.js";
			const lazy = () => import("./lazy.js");
			const loaded = require("./common.js");
			type Contract = import("./types.js").Contract;
			console.log(value, lazy, loaded);
		`,
		ModuleRewrite: &ModuleRewrite{
			ModuleAliases: map[string]string{
				"./runtime.js":  "./runtime.exact.client.js",
				"./exported.js": "./exported.exact.client.js",
				"./lazy.js":     "./lazy.exact.client.js",
				"./common.js":   "./common.exact.client.js",
				"./types.js":    "./types.exact.client.js",
			},
		},
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`"./runtime.exact.client.js"`,
		`"./exported.exact.client.js"`,
		`"./lazy.exact.client.js"`,
		`"./common.exact.client.js"`,
		`"./types.exact.client.js"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("native output omitted alias %s:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `"./runtime.js"`) {
		t.Fatalf("native output retained the original module identity:\n%s", response.Code)
	}
}

func TestSessionRetainsProgramAndCallableCacheAfterNativeLowering(t *testing.T) {
	session := NewSession()
	request := Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			function helper(value: string) {
				return value.toUpperCase();
			}
			export function Component() {
				return () => <span>{helper("value")}</span>;
			}
		`,
	}
	first := session.Execute(request)
	if first.Error != "" {
		t.Fatal(first.Error)
	}
	var project *projectState
	for _, candidate := range session.projects {
		project = candidate
	}
	if project == nil || project.callableCache == nil {
		t.Fatal("native compilation did not retain its project callable cache")
	}
	program := project.program
	cache := project.callableCache

	request.Target = TargetServer
	second := session.Execute(request)
	if second.Error != "" {
		t.Fatal(second.Error)
	}
	if project.program != program {
		t.Fatal("native lowering rebuilt an unchanged TypeScript program")
	}
	if project.callableCache != cache {
		t.Fatal("native lowering discarded an unchanged callable cache")
	}
	if !second.CacheHit {
		t.Fatal("second target compilation did not reuse the retained source generation")
	}
}

func TestSessionRewritesModuleExportReplacementsBeforeNativePrinting(t *testing.T) {
	replacement := ModuleExportReplacement{
		SourceModule: "@tanstack/react-query",
		SourceExport: "QueryClientProvider",
		TargetModule: "@exactjs/tanstack-query/provider",
		TargetExport: "ExactQueryClientProvider",
	}
	defaultReplacement := ModuleExportReplacement{
		SourceModule: "@tanstack/react-query",
		SourceExport: "default",
		TargetModule: "@exactjs/tanstack-query/default",
		TargetExport: "default",
	}
	response := NewSession().Execute(Request{
		ID:   "component.ts",
		Kind: "compile",
		Source: `
			import DefaultQuery, {
				QueryClientProvider as Provider,
				useQuery,
				type QueryKey
			} from "@tanstack/react-query";
			import * as Query from "@tanstack/react-query";
			export {
				QueryClientProvider as ExportedProvider,
				useQuery as exportedQuery
			} from "@tanstack/react-query";
			const DirectProvider = require("@tanstack/react-query").QueryClientProvider;
			const ElementProvider = require("@tanstack/react-query")["QueryClientProvider"];
			const {
				QueryClientProvider: DestructuredProvider,
				useQuery: destructuredQuery
			} = require("@tanstack/react-query");
			Query.QueryClientProvider;
			Query["QueryClientProvider"];
			function shadow(Query: any) {
				const {
					QueryClientProvider: NestedProvider
				} = require("@tanstack/react-query");
				console.log(NestedProvider);
				return Query.QueryClientProvider;
			}
			console.log(
				DefaultQuery,
				Provider,
				useQuery,
				DirectProvider,
				ElementProvider,
				DestructuredProvider,
				destructuredQuery,
				shadow
			);
		`,
		ModuleRewrite: &ModuleRewrite{
			Replacements: []ModuleExportReplacement{replacement, defaultReplacement},
		},
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`import { useQuery, type QueryKey } from "@tanstack/react-query";`,
		`import DefaultQuery from "@exactjs/tanstack-query/default";`,
		`import { ExactQueryClientProvider as Provider } from "@exactjs/tanstack-query/provider";`,
		`export { useQuery as exportedQuery } from "@tanstack/react-query";`,
		`export { ExactQueryClientProvider as ExportedProvider } from "@exactjs/tanstack-query/provider";`,
		`require("@exactjs/tanstack-query/provider").ExactQueryClientProvider`,
		`require("@exactjs/tanstack-query/provider")["ExactQueryClientProvider"]`,
		`{ ExactQueryClientProvider: DestructuredProvider } = require("@exactjs/tanstack-query/provider")`,
		`{ ExactQueryClientProvider: NestedProvider } = require("@exactjs/tanstack-query/provider")`,
		`return Query.QueryClientProvider;`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("native output omitted replacement %s:\n%s", expected, response.Code)
		}
	}
	if occurrences := strings.Count(
		response.Code,
		"import { ExactQueryClientProvider as __exact_ExactQueryClientProvider",
	); occurrences != 1 {
		t.Fatalf(
			"native namespace replacement emitted %d adapter imports:\n%s",
			occurrences,
			response.Code,
		)
	}
}

func TestSessionRejectsDuplicateModuleExportReplacements(t *testing.T) {
	replacement := ModuleExportReplacement{
		SourceModule: "source",
		SourceExport: "value",
		TargetModule: "target",
		TargetExport: "value",
	}
	response := NewSession().Execute(Request{
		ID:            "component.ts",
		Kind:          "compile",
		Source:        `import { value } from "source";`,
		ModuleRewrite: &ModuleRewrite{Replacements: []ModuleExportReplacement{replacement, replacement}},
	})
	if !strings.Contains(response.Error, "duplicate module replacement for source.value") {
		t.Fatalf("unexpected duplicate replacement result: %#v", response)
	}
}

func TestSessionRejectsMultipleImportsMappedToOneDefaultExport(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "component.ts",
		Kind:   "compile",
		Source: `import { first, second } from "source";`,
		ModuleRewrite: &ModuleRewrite{
			Replacements: []ModuleExportReplacement{
				{
					SourceModule: "source",
					SourceExport: "first",
					TargetModule: "target",
					TargetExport: "default",
				},
				{
					SourceModule: "source",
					SourceExport: "second",
					TargetModule: "target",
					TargetExport: "default",
				},
			},
		},
	})
	if !strings.Contains(
		response.Error,
		"cannot map multiple imports to the default export of target",
	) {
		t.Fatalf("unexpected default replacement result: %#v", response)
	}
}

func TestGeneratedValidationUsesNativeParserAndChecker(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "generated.tsx")
	syntax, err := validateGeneratedCode(
		Request{Diagnostics: "syntax"},
		filename,
		"const value = ;",
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(syntax) == 0 {
		t.Fatal("native generated syntax validation accepted malformed output")
	}
	genericArrow, err := validateGeneratedCode(
		Request{Diagnostics: "syntax"},
		filename,
		"const identity = <T>(value: T): T => value;",
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(genericArrow) != 0 {
		t.Fatalf(
			"native generated syntax validation parsed TypeScript output as TSX: %#v",
			genericArrow,
		)
	}

	semantic, err := validateGeneratedCode(
		Request{Diagnostics: "semantic"},
		filename,
		"const value: string = 1;",
	)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, diagnostic := range semantic {
		if diagnostic.Code == "TS2322" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf(
			"native generated semantic validation missed TS2322: %#v",
			semantic,
		)
	}
}

func TestSessionSemanticallyValidatesGeneratedNativeArtifact(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:          "panel.tsx",
		Kind:        "compile",
		Target:      TargetServer,
		Diagnostics: "semantic",
		Source: `
			declare global {
				namespace JSX {
					interface IntrinsicElements { main: any }
				}
			}
			export function Panel() {
				return () => <main title="ready" />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 {
		t.Fatalf(
			"valid generated native artifact failed semantic validation: %#v\n%s",
			response.Diagnostics,
			response.Code,
		)
	}
}

func TestSessionDiscoversComponentDeclarationSignals(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			export function Named() {
				return () => <main />;
			}
			const protocolOnly = function () {
				this.onMount(() => undefined);
			};
			const typedOnly = (this: Component<{ ready: boolean }>) => 1;
			function helper() {
				return <aside />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	components := response.Analysis.Components
	if len(components) != 3 {
		t.Fatalf("discovered %d components, expected 3: %#v", len(components), components)
	}
	for _, component := range components {
		if component.ID == "" || !strings.HasPrefix(component.ID, "x") {
			t.Fatalf("component is missing its stable protocol id: %#v", component)
		}
	}
	if components[0].Name != "Named" || !components[0].Exported ||
		len(components[0].Signals) != 1 || components[0].Signals[0] != "named-jsx" {
		t.Fatalf("unexpected named JSX component: %#v", components[0])
	}
	if components[1].Name != "protocolOnly" ||
		components[1].Signals[0] != "component-protocol" {
		t.Fatalf("unexpected protocol component: %#v", components[1])
	}
	if components[2].Name != "typedOnly" ||
		components[2].Signals[0] != "typed-receiver" {
		t.Fatalf("unexpected typed component: %#v", components[2])
	}
}

func TestSessionCreatesExportsAndRootSymbolsForExportedValues(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "values.ts",
		Kind: "compile",
		Source: `
			export const value = 1;
			export function readValue() {
				return value;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Symbols) != 2 {
		t.Fatalf("unexpected exported value symbols: %#v", response.Analysis.Symbols)
	}
	exportNames := map[string]bool{}
	for _, symbol := range response.Analysis.Symbols {
		if symbol.Kind != "value" || symbol.Role != "root" ||
			symbol.Target != "both" || symbol.Placement != "isomorphic" {
			t.Fatalf("unexpected exported value symbol: %#v", symbol)
		}
		exportNames[symbol.ExportName] = true
	}
	if !exportNames["readValue"] || !exportNames["value"] {
		t.Fatalf("exported value symbols are incomplete: %#v", response.Analysis.Symbols)
	}
	if len(response.Analysis.Exports) != 2 ||
		response.Analysis.Exports[0].Name != "readValue" ||
		response.Analysis.Exports[1].Name != "value" {
		t.Fatalf("unexpected module exports: %#v", response.Analysis.Exports)
	}
	for _, exported := range response.Analysis.Exports {
		if exported.Kind != "value" || exported.Placement != "isomorphic" {
			t.Fatalf("unexpected exported value: %#v", exported)
		}
	}
}

func TestSessionCreatesValueExportsForAliasesAndDefaults(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "exports.ts",
		Kind: "compile",
		Source: `
			const local = 1;
			export { local as renamed };
			export default local;
			export type Shape = { value: number };
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Exports) != 2 ||
		response.Analysis.Exports[0].Name != "default" ||
		response.Analysis.Exports[1].Name != "renamed" {
		t.Fatalf("unexpected aliased exports: %#v", response.Analysis.Exports)
	}
}

func TestSessionMatchesCanonicalComponentIdentity(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/exact/fixtures/component.tsx",
		Kind: "compile",
		Root: "C:/exact/fixtures",
		Source: "export function Panel() { const value: number = 1; " +
			"return () => <main />; }",
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Components) != 1 {
		t.Fatalf("unexpected components: %#v", response.Analysis.Components)
	}
	if response.Analysis.Components[0].ID != "xWukFpfVGAdZkgIIpKdIh5C" {
		t.Fatalf(
			"native component identity diverged from the compiler contract: %#v",
			response.Analysis.Components[0],
		)
	}
}

func TestNormalizeFileNameRecognizesWindowsPathsOnEveryHost(t *testing.T) {
	filename, err := normalizeFileName(
		`C:\exact\fixtures\component.tsx`,
		"",
	)
	if err != nil {
		t.Fatal(err)
	}
	if filename != "C:/exact/fixtures/component.tsx" {
		t.Fatalf("Windows request path was made host-relative: %q", filename)
	}
}

func TestSessionAttachesTargetLocalComponentBrands(t *testing.T) {
	source := `
		function Panel() {
			return () => <main />;
		}
		const Inline = () => <aside />;
	`
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{
			ID:     "component.tsx",
			Kind:   "compile",
			Source: source,
			Target: target,
		})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		panel := findComponent(t, response.Analysis.Components, "Panel")
		inline := findComponent(t, response.Analysis.Components, "Inline")
		for _, expected := range []string{
			`const Panel = /* @__PURE__ */ Object.assign(function Panel()`,
			`[Symbol.for("@exactjs/component")]: "` + panel.ID + `"`,
			`const Inline = /* @__PURE__ */ Object.assign(() =>`,
			`[Symbol.for("@exactjs/component")]: "` + inline.ID + `"`,
		} {
			if !strings.Contains(response.Code, expected) {
				t.Fatalf(
					"%s component brand output is missing %q:\n%s",
					target,
					expected,
					response.Code,
				)
			}
		}
	}
	defaultResponse := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Source: source,
	})
	if strings.Contains(defaultResponse.Code, "@exactjs/component") {
		t.Fatalf(
			"default compilation unexpectedly attached a target contract:\n%s",
			defaultResponse.Code,
		)
	}
}

func TestSessionPreservesAComponentDeclarationReferencedEarlierInItsModule(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			const entries = { ready: Ready };
			function Ready() {
				return () => <p>Ready</p>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	ready := findComponent(t, response.Analysis.Components, "Ready")
	for _, expected := range []string{
		`const entries = { ready: Ready }`,
		`function Ready()`,
		`Object.assign(Ready, { [Symbol.for("@exactjs/component")]: "` + ready.ID + `" })`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("hoisted component output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionBrandsPrivateComponentsInsideClientRoots(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "grid.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			export function Grid() {
				return () => <main><Cell /></main>;
			}
			function Cell() {
				return () => <button onClick={() => undefined}>Select</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	cell := findComponent(t, response.Analysis.Components, "Cell")
	expected := `Object.assign(Cell, { [Symbol.for("@exactjs/component")]: "` + cell.ID + `" })`
	if !strings.Contains(response.Code, expected) {
		t.Fatalf("private client component brand output is missing %q:\n%s", expected, response.Code)
	}
}

func TestSessionBrandsComponentsWithProjectResolvedPlacement(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{
			ID:     "card.tsx",
			Kind:   "compile",
			Target: target,
			Source: `
				function format(value: number): string {
					return new Intl.NumberFormat("en-US").format(value);
				}
				export function Card(props: { value: number }) {
					return () => <output>{format(props.value)}</output>;
				}
			`,
		})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		card := findComponent(t, response.Analysis.Components, "Card")
		if card.Placement != "unknown" {
			t.Fatalf("expected project-resolved placement fixture, got %#v", card)
		}
		expected := `export const Card = /* @__PURE__ */ Object.assign(function Card(`
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("%s component brand output is missing %q:\n%s", target, expected, response.Code)
		}
		if !strings.Contains(response.Code, `[Symbol.for("@exactjs/component")]: "`+card.ID+`"`) {
			t.Fatalf("%s component identity is missing:\n%s", target, response.Code)
		}
	}
}

func TestSessionWrapsUnprovenComponentsWithJSXInteropAdapter(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { Foreign } from "foreign-ui";
			function Local() {
				return () => <span />;
			}
			export function Panel() {
				return () => <main><Local /><Foreign /></main>;
			}
		`,
		JSXInterop: &JSXInterop{
			AdapterModule: "@exactjs/react-compat",
			AdapterExport: "adaptComponent",
		},
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`import { adaptComponent as __exactInteropComponent } from "@exactjs/react-compat"`,
		`__exactComponentVNode(Local,`,
		`__exactVNode(__exactInteropComponent(Foreign),`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("native JSX interop output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionRetainsImportedExactComponentsWithoutJSXInteropAdapter(t *testing.T) {
	root := t.TempDir()
	child := filepath.Join(root, "child.tsx")
	if err := os.WriteFile(child, []byte(`
		export function Child(this: Component<{}>) {
			return () => <span>child</span>;
		}
	`), 0o600); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(root, "entry.tsx")
	response := NewSession().Execute(Request{
		ID: entry, Root: root, Kind: "compile", Source: `
			import { Child } from "./child.jsx";
			export function Parent(this: Component<{}>) {
				return () => <main><Child /></main>;
			}
		`,
		JSXInterop: &JSXInterop{
			AdapterModule: "@exactjs/react-compat",
			AdapterExport: "adaptComponent",
		},
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if strings.Contains(response.Code, `__exactInteropComponent(Child)`) {
		t.Fatalf("imported eXact component was lowered through JSX interop:\n%s", response.Code)
	}
	if !strings.Contains(response.Code, `__exactComponentVNode(Child,`) {
		t.Fatalf("imported eXact component was not retained as an eXact VNode type:\n%s", response.Code)
	}
}

func TestSessionDoesNotAdaptCoreVNodeSymbolsAsReactComponents(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "suspense.tsx",
		Kind: "compile",
		Source: `
			import { Suspense } from "@exactjs/core";
			export function Panel() {
				return () => <Suspense fallback="wait"><main /></Suspense>;
			}
		`,
		JSXInterop: &JSXInterop{
			AdapterModule: "@exactjs/react-compat",
			AdapterExport: "adaptComponent",
		},
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if strings.Contains(response.Code, `__exactInteropComponent(Suspense)`) {
		t.Fatalf("core Suspense symbol was incorrectly lowered through React interop:\n%s", response.Code)
	}
	if !strings.Contains(response.Code, `__exactVNode(Suspense,`) {
		t.Fatalf("core Suspense symbol was not retained as an eXact VNode type:\n%s", response.Code)
	}
	if !strings.Contains(response.Code, `import "@exactjs/dom/runtime/structural-boundaries"`) {
		t.Fatalf("native Suspense did not select its DOM structural capability:\n%s", response.Code)
	}
}

func TestSessionEmitsClientRootComponentContract(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "button.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `export function Button() {
			return () => <button onClick={() => alert(1)}>Go</button>;
		}`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Components) != 1 {
		t.Fatalf("unexpected components: %#v", response.Analysis.Components)
	}
	component := response.Analysis.Components[0]
	rootSymbolID := ""
	for _, symbol := range response.Analysis.Symbols {
		if symbol.ComponentID == component.ID && symbol.Role == "root" {
			rootSymbolID = symbol.ID
			break
		}
	}
	if rootSymbolID == "" {
		t.Fatalf("client component has no root symbol: %#v", response.Analysis.Symbols)
	}
	for _, expected := range []string{
		`import "@exactjs/core/runtime/tasks"`,
		`const __exactComponentContract_1 = /* @__PURE__ */ Symbol.for("@exactjs/component-contract")`,
		`const __exactImplementation_Button_1 = function Button()`,
		`export const Button =`,
		`Object.assign(__exactImplementation_Button_1, {`,
		`[Symbol.for("@exactjs/component")]: "` + component.ID + `"`,
		`[__exactComponentContract_1]:`,
		`id: "` + rootSymbolID + `"`,
		`placement: "client"`,
		`role: "client"`,
		`role: "root"`,
		`implementation: __exactImplementation_Button_1`,
		`resumption:`,
		`"interactions"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf(
				"native client root contract is missing %q:\n%s",
				expected,
				response.Code,
			)
		}
	}
	if strings.Count(response.Code, "boundaries: []") < 2 {
		t.Fatalf(
			"fully client-owned component retained redundant nested island metadata:\n%s",
			response.Code,
		)
	}
}

func TestSessionImportsComponentLocalizationOnlyWhenUsed(t *testing.T) {
	localizedSources := []string{
		`export function Price() {
			return () => <output>{this.intl.NumberFormat('en-US').format(42)}</output>;
		}`,
		`export function Price() {
			return () => <output>{new Intl.NumberFormat('en-US').format(42)}</output>;
		}`,
		`export function Price(props: { amount: number }) {
			return () => <output>{props.amount.toLocaleString('en-US')}</output>;
		}`,
	}
	for index, source := range localizedSources {
		localized := NewSession().Execute(Request{
			ID:     fmt.Sprintf("localized-%d.tsx", index),
			Kind:   "compile",
			Target: TargetClient,
			Source: source,
		})
		if localized.Error != "" {
			t.Fatal(localized.Error)
		}
		if !strings.Contains(localized.Code, `import "@exactjs/core/runtime/localization"`) {
			t.Fatalf("component Intl use did not import its runtime capability:\n%s", localized.Code)
		}
	}

	plain := NewSession().Execute(Request{
		ID:     "plain.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `export function Price() {
			return () => <output>{42}</output>;
		}`,
	})
	if plain.Error != "" {
		t.Fatal(plain.Error)
	}
	if strings.Contains(plain.Code, "runtime/localization") {
		t.Fatalf("component without Intl use retained localization capability:\n%s", plain.Code)
	}
}

func TestSessionEmitsCompatibilityCapabilityOnlyForAdaptedComponentRoots(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "button.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `import { Widget } from "foreign-ui";
		export function Button() {
			return () => <button onClick={() => alert(1)}><Widget /></button>;
		}`,
		JSXInterop: &JSXInterop{
			AdapterModule: "@exactjs/react-compat",
			AdapterExport: "adaptComponent",
		},
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`import "@exactjs/core/runtime/tasks"`,
		`__exactInteropComponent(Widget)`,
		`"compatibility"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("native compatibility contract is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionEmitsClientRootContractForComponentValue(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "button.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `export const Button = () =>
			<button onClick={() => alert(1)}>Go</button>;`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`export const Button = (() => {`,
		`const __exactComponentImplementation_1 = () =>`,
		`return Object.assign(__exactComponentImplementation_1`,
		`implementation: __exactComponentImplementation_1`,
		`[__exactComponentContract_1]:`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf(
				"native component-value contract is missing %q:\n%s",
				expected,
				response.Code,
			)
		}
	}
}

func TestSessionReplacesClientFunctionRootWithServerBoundaryStub(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "button.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `export function Button() {
			return () => <button onClick={() => alert(1)}>Go</button>;
		}`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Components) != 1 {
		t.Fatalf("unexpected components: %#v", response.Analysis.Components)
	}
	boundaryID := rootBoundaryID(response.Analysis.Boundaries, "Button")
	if boundaryID == "" {
		t.Fatalf("missing client root boundary: %#v", response.Analysis.Boundaries)
	}
	for _, expected := range []string{
		`createServerBoundary as __exactBoundary`,
		`function Button(props = {})`,
		`() => __exactBoundary("` + boundaryID + `", "Button", props)`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf(
				"native client function server stub is missing %q:\n%s",
				expected,
				response.Code,
			)
		}
	}
	if strings.Contains(response.Code, "alert(1)") ||
		strings.Contains(response.Code, `createCompiledVNode("button"`) {
		t.Fatalf(
			"client implementation escaped into the server artifact:\n%s",
			response.Code,
		)
	}
}

func TestSessionReplacesClientComponentValueWithServerBoundaryStub(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "button.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `export const Button = () =>
			<button onClick={() => alert(1)}>Go</button>;`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	boundaryID := rootBoundaryID(response.Analysis.Boundaries, "Button")
	if boundaryID == "" {
		t.Fatalf("missing client root boundary: %#v", response.Analysis.Boundaries)
	}
	for _, expected := range []string{
		`createServerBoundary as __exactBoundary`,
		`function Button(props = {})`,
		`() => __exactBoundary("` + boundaryID + `", "Button", props)`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf(
				"native client component-value server stub is missing %q:\n%s",
				expected,
				response.Code,
			)
		}
	}
	if strings.Contains(response.Code, "alert(1)") ||
		strings.Contains(response.Code, `createCompiledVNode("button"`) {
		t.Fatalf(
			"client component-value implementation escaped into the server artifact:\n%s",
			response.Code,
		)
	}
}

func rootBoundaryID(boundaries []Boundary, name string) string {
	for _, boundary := range boundaries {
		if boundary.Name == name && boundary.RenderEdgeID == "" {
			return boundary.ID
		}
	}
	return ""
}

func TestSessionEmitsBoundaryForClientComponentRenderedByServer(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "page.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `
			import { TaskContext } from "@exactjs/core";
			function ClientButton() {
				return () =>
					<button onClick={() => alert(1)}>Go</button>;
			}
			export function Page() {
				const __fixtureTask0 = async (_task: TaskContext = TaskContext.server()) => undefined;
__fixtureTask0();
				return () => <main><ClientButton label="Save" /></main>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	var edgeBoundary Boundary
	for _, boundary := range response.Analysis.Boundaries {
		if boundary.Name == "ClientButton" && boundary.RenderEdgeID != "" {
			edgeBoundary = boundary
			break
		}
	}
	if edgeBoundary.ID == "" {
		t.Fatalf(
			"missing client render-edge boundary: %#v",
			response.Analysis.Boundaries,
		)
	}
	for _, expected := range []string{
		`createServerBoundary as __exactBoundary`,
		`__exactBoundary("` + edgeBoundary.ID +
			`", "ClientButton", { label: "Save" })`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf(
				"native client render boundary is missing %q:\n%s",
				expected,
				response.Code,
			)
		}
	}
	if strings.Contains(response.Code, "alert(1)") ||
		strings.Contains(response.Code, `__exactVNode(ClientButton`) {
		t.Fatalf(
			"client render implementation escaped into the server artifact:\n%s",
			response.Code,
		)
	}
}

func TestSessionSerializesPlainClientBoundaryChildrenAsProps(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "page.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `
			function ClientShell(props: { children?: unknown }) {
				window.addEventListener("resize", () => undefined);
				return () => <section>{props.children}</section>;
			}
			export function Page(
				this: Component<{ title: string; count: number }>
			) {
				return () =>
					<ClientShell>
						Issue {this.state.title} #{this.state.count}
					</ClientShell>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`createServerBoundary as __exactBoundary`,
		`"ClientShell", { children: ["Issue ", this.state.title, " #", this.state.count] }`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf(
				"plain client-boundary children are missing %q:\n%s",
				expected,
				response.Code,
			)
		}
	}
	if strings.Contains(response.Code, "__exactDynamic(() => this.state.title") {
		t.Fatalf(
			"serializable client-boundary child was emitted as a server slot:\n%s",
			response.Code,
		)
	}
	for _, boundary := range response.Analysis.Boundaries {
		if boundary.Kind == "server-slot" {
			t.Fatalf("plain children unexpectedly created a server slot: %#v", boundary)
		}
	}
}

func TestSessionRetainsJSXClientBoundaryChildrenAsServerSlot(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "page.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `
			function ClientShell(props: { children?: unknown }) {
				window.addEventListener("resize", () => undefined);
				return () => <section>{props.children}</section>;
			}
			export function Page() {
				return () =>
					<ClientShell><p>Server child</p></ClientShell>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	var island Boundary
	var slot Boundary
	for _, boundary := range response.Analysis.Boundaries {
		if boundary.Name == "ClientShell" && boundary.Kind == "client-island" {
			island = boundary
		}
		if boundary.Name == "ClientShell:children" &&
			boundary.Kind == "server-slot" {
			slot = boundary
		}
	}
	if island.ID == "" || slot.ID != island.ID+":children" ||
		slot.RenderEdgeID != island.RenderEdgeID ||
		slot.RenderPath != island.RenderPath {
		t.Fatalf(
			"unexpected client island/server slot records: island=%#v slot=%#v",
			island,
			slot,
		)
	}
	var partitionRange Boundary
	for _, boundary := range response.Analysis.Boundaries {
		if boundary.Kind == "partition-range" {
			partitionRange = boundary
			break
		}
	}
	if partitionRange.ID == "" {
		t.Fatalf("JSX server child did not receive an independent partition range: %#v", response.Analysis.Boundaries)
	}
	for _, expected := range []string{
		`__exactBoundary("` + island.ID + `", "ClientShell", { __exactServerSlots: [{ __exactServerSlot: "` + partitionRange.ID + `"`,
		`planVersion: 1`,
		`planEdgeId: "` + partitionRange.ID + `"`,
		`discriminator: { kind: "single" }`,
		`generation: 1`,
		`__exactVNode("p"`,
		`"Server child"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf(
				"server slot output is missing %q:\n%s",
				expected,
				response.Code,
			)
		}
	}
	if strings.Contains(response.Code, "children:") {
		t.Fatalf(
			"JSX server slot was serialized into client props:\n%s",
			response.Code,
		)
	}
}

func TestSessionKeepsUnknownComponentChildrenInClientOnlyArtifacts(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "client-only.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			declare function External(props: { children?: unknown }): unknown;
			export function Page() {
				return () => <External><span>Client child</span></External>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if strings.Contains(response.Code, "__exactServerSlot") {
		t.Fatalf("client-only compilation replaced an unknown component child with a server slot:\n%s", response.Code)
	}
	for _, expected := range []string{`__exactVNode(External`, `__exactVNode("span"`, `"Client child"`} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("client-only component output omitted %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionExtractsIntrinsicClientIslandFromServerArtifact(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:               "panel.tsx",
		Kind:             "compile",
		Target:           TargetServer,
		ServerComponents: true,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			export function Panel(
				this: Component<{ count: number; label: string }>
			) {
				const __fixtureTask1 = async (_task: TaskContext = TaskContext.server()) => loadPrivate();
__fixtureTask1();
				return () =>
					<button
						title={this.state.label}
						onClick={() => this.state.count++}
					>
						Save {this.state.count}
					</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Components) != 1 ||
		response.Analysis.Components[0].ClientIslandCount != 1 {
		t.Fatalf("unexpected component islands: %#v", response.Analysis.Components)
	}
	var boundary Boundary
	for _, candidate := range response.Analysis.Boundaries {
		if candidate.Name == "Panel_ExactClient_1" {
			boundary = candidate
			break
		}
	}
	if boundary.ID == "" {
		t.Fatalf("missing generated client-island boundary: %#v", response.Analysis.Boundaries)
	}
	if len(response.Analysis.Resumptions) != 1 ||
		!equalStrings(
			response.Analysis.Resumptions[0].Client.StatePaths,
			[]string{"count", "label"},
		) {
		t.Fatalf(
			"client-island reads and read-modify-writes were not resumable: %#v",
			response.Analysis.Resumptions,
		)
	}
	for _, name := range []string{"Panel.state.count", "Panel.state.label"} {
		if !containsPolicySubject(
			response.Analysis.Policy.Subjects,
			"state",
			name,
			"shared",
			false,
		) {
			t.Fatalf("missing shared island policy for %s: %#v", name, response.Analysis.Policy)
		}
	}
	for _, expected := range []string{
		`__exactBoundary("` + boundary.ID + `", "Panel_ExactClient_1"`,
		`"__exactState": { count: this.state.count, label: this.state.label }`,
		`title: this.state.label`,
		`__exactHydration: "interaction"`,
		`__exactHydrationFallback: __exactVNode("button"`,
		`"Save "`,
		`name: "Panel_ExactServer_1"`,
		`role: "server-part"`,
		`export { Panel as Panel_ExactServer_1 }`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf(
				"native intrinsic island output is missing %q:\n%s",
				expected,
				response.Code,
			)
		}
	}
	for _, forbidden := range []string{
		"onClick",
		"alert(",
		"this.state.count++",
	} {
		if strings.Contains(response.Code, forbidden) {
			t.Fatalf(
				"client-only intrinsic behavior escaped into server output (%q):\n%s",
				forbidden,
				response.Code,
			)
		}
	}
}

func TestSessionEmitsGeneratedIntrinsicIslandInClientArtifact(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:               "panel.tsx",
		Kind:             "compile",
		Target:           TargetClient,
		ServerComponents: true,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			export function Panel(
				this: Component<{ count: number; label: string }>
			) {
				const __fixtureTask2 = async (_task: TaskContext = TaskContext.server()) => loadPrivate();
__fixtureTask2();
				return () =>
					<button
						title={this.state.label}
						onClick={() => this.state.count++}
					>
						Save {this.state.count}
					</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	islandID := ""
	for _, boundary := range response.Analysis.Boundaries {
		if boundary.Name == "Panel_ExactClient_1" {
			islandID = boundary.ID
			break
		}
	}
	if islandID == "" {
		t.Fatalf("missing generated client island: %#v", response.Analysis.Boundaries)
	}
	for _, expected := range []string{
		`export function Panel_ExactClient_1(this: any, props: any = {})`,
		`Object.assign(Panel_ExactClient_1, { [Symbol.for("@exactjs/component")]: "` + islandID + `" })`,
		`if (props.__exactState)`,
		`Object.assign(this.state, props.__exactState)`,
		`title: props.title`,
		`onClick: () => __exactUpdateResult(this.state, ["count"]`,
		`__exactDynamic(() => this.state.count`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf(
				"generated native client island is missing %q:\n%s",
				expected,
				response.Code,
			)
		}
	}
	for _, forbidden := range []string{"loadPrivate"} {
		if strings.Contains(response.Code, forbidden) {
			t.Fatalf(
				"server-part implementation escaped into client output (%q):\n%s",
				forbidden,
				response.Code,
			)
		}
	}
}

func TestSessionLowersFormBindingInsideGeneratedIntrinsicIsland(t *testing.T) {
	source := `
			import { TaskContext } from "@exactjs/core";
		export function Panel(this: Component<{ name: string }>) {
			const __fixtureTask0 = async (_task: TaskContext = TaskContext.server()) => loadPanel();
__fixtureTask0();
			return () => <input value:onInput={this.state.name} />;
		}
	`
	server := NewSession().Execute(Request{
		ID:               "panel.tsx",
		Kind:             "compile",
		Target:           TargetServer,
		ServerComponents: true,
		Source:           source,
	})
	if server.Error != "" {
		t.Fatal(server.Error)
	}
	if strings.Contains(server.Code, "value:onInput") ||
		strings.Contains(server.Code, "__exactBindInput") ||
		!strings.Contains(
			server.Code,
			`"__exactState": { name: this.state.name }`,
		) {
		t.Fatalf(
			"server form-binding island was not sanitized:\n%s",
			server.Code,
		)
	}

	client := NewSession().Execute(Request{
		ID:               "panel.tsx",
		Kind:             "compile",
		Target:           TargetClient,
		ServerComponents: true,
		Source:           source,
	})
	if client.Error != "" {
		t.Fatal(client.Error)
	}
	for _, expected := range []string{
		`value: __exactExpression(() => this.state.name ?? "")`,
		`readonly currentTarget: HTMLInputElement`,
		`=> __exactWrite(this.state, ["name"], () => event.currentTarget.value as any)`,
	} {
		if !strings.Contains(client.Code, expected) {
			t.Fatalf(
				"generated client form binding is missing %q:\n%s",
				expected,
				client.Code,
			)
		}
	}
	if strings.Contains(client.Code, "value:onInput") {
		t.Fatalf(
			"authored form-binding namespace escaped into client output:\n%s",
			client.Code,
		)
	}
}

func TestSessionLowersTypedNativeFormBindingConversions(t *testing.T) {
	source := `
			import { TaskContext } from "@exactjs/core";
		declare class Component<State> { state: State }
		export function Form(this: Component<{
			count: number | null;
			enabled: boolean;
			method: string;
			tags: string[];
			codes: number[];
			birthday: Date | null;
		}>) {
			const __fixtureTask1 = async (_task: TaskContext = TaskContext.server()) => loadForm();
__fixtureTask1();
			return () => <>
				<input type="number" value:onChange={this.state.count} />
				<input type="checkbox" checked:onChange={this.state.enabled} />
				<input type="radio" value="ground" checked:onChange={this.state.method} />
				<select multiple value:onChange={this.state.tags}>
					<option value="a">A</option>
				</select>
				<input type="checkbox" value="2" checked:onChange={this.state.codes} />
				<input type="date" value:onChange={this.state.birthday} />
			</>;
		}
	`
	response := NewSession().Execute(Request{
		ID:     "form.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: source,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`Number.isNaN(this.state.count)`,
		`event.currentTarget.valueAsNumber`,
		`this.state.enabled ?? false`,
		`this.state.method === "ground"`,
		`event.currentTarget.checked &&`,
		`Array.from(event.currentTarget.selectedOptions`,
		`(this.state.codes ?? []).includes(Number("2"))`,
		`const value = Number(event.currentTarget.value)`,
		`event.currentTarget.valueAsDate`,
		`currentTarget: HTMLInputElement`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf(
				"typed native form binding is missing %q (diagnostics %#v):\n%s",
				expected,
				response.Diagnostics,
				response.Code,
			)
		}
	}
	if strings.Contains(response.Code, "__exactAny") ||
		strings.Contains(response.Code, "value:onChange") ||
		strings.Contains(response.Code, "checked:onChange") {
		t.Fatalf("form-binding compiler syntax escaped into output:\n%s", response.Code)
	}
	server := NewSession().Execute(Request{
		ID:               "form.tsx",
		Kind:             "compile",
		Target:           TargetServer,
		ServerComponents: true,
		Source:           source,
	})
	if server.Error != "" {
		t.Fatal(server.Error)
	}
	for _, expected := range []string{
		`checked: this.state.method === "ground"`,
		`checked: (this.state.codes ?? []).includes(Number("2"))`,
	} {
		if !strings.Contains(server.Code, expected) {
			t.Fatalf(
				"server form-binding fallback is missing %q:\n%s",
				expected,
				server.Code,
			)
		}
	}
	if strings.Contains(server.Code, "__exactBind") ||
		strings.Contains(server.Code, "value:onChange") ||
		strings.Contains(server.Code, "checked:onChange") {
		t.Fatalf("server form-binding fallback retained client behavior:\n%s", server.Code)
	}
}

func TestSessionRejectsInvalidNativeFormBindingContracts(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "invalid-form.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			export function Form(this: Component<{ enabled: boolean }>) {
				return () =>
					<input type="checkbox" value:onChange={this.state.enabled} />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !containsDiagnosticCode(response.Diagnostics, "EXACT_FORM_BINDING") ||
		!strings.Contains(
			response.Diagnostics[0].Message,
			"use checked:onChange",
		) {
		t.Fatalf("missing invalid form-binding diagnostic: %#v", response.Diagnostics)
	}
	if response.Code != "" {
		t.Fatalf("invalid form binding unexpectedly emitted code:\n%s", response.Code)
	}
}

func TestSessionSanitizesOpaqueGeneratedIslandSpreadProps(t *testing.T) {
	source := `
			import { TaskContext } from "@exactjs/core";
		export function Panel(
			props: { events: Record<string, unknown> }
		) {
			const __fixtureTask2 = async (_task: TaskContext = TaskContext.server()) => loadPanel();
__fixtureTask2();
			return () =>
				<button {...props.events} onClick={() => alert(1)}>
					Save
				</button>;
		}
	`
	server := NewSession().Execute(Request{
		ID:               "panel.tsx",
		Kind:             "compile",
		Target:           TargetServer,
		ServerComponents: true,
		Source:           source,
	})
	if server.Error != "" {
		t.Fatal(server.Error)
	}
	if strings.Contains(server.Code, `__exactHydration: "interaction"`) ||
		strings.Contains(server.Code, "__exactHydrationFallback") ||
		strings.Contains(server.Code, "onClick") {
		t.Fatalf(
			"opaque spread island was incorrectly deferred or retained an event:\n%s",
			server.Code,
		)
	}

	client := NewSession().Execute(Request{
		ID:               "panel.tsx",
		Kind:             "compile",
		Target:           TargetClient,
		ServerComponents: true,
		Source:           source,
	})
	if client.Error != "" {
		t.Fatal(client.Error)
	}
	for _, expected := range []string{
		`const __exactElementProps = { ...props }`,
		`delete __exactElementProps.__exactState`,
		`delete __exactElementProps.__exactCapture`,
		`delete __exactElementProps.__exactHydration`,
		`delete __exactElementProps.__exactHydrationFallback`,
		`delete __exactElementProps.children`,
		`...__exactElementProps`,
		`onClick: () => alert(1)`,
	} {
		if !strings.Contains(client.Code, expected) {
			t.Fatalf(
				"opaque generated-island spread is missing %q:\n%s",
				expected,
				client.Code,
			)
		}
	}
}

func TestSessionPartitionsServerChildrenFromGeneratedIntrinsicIsland(t *testing.T) {
	source := `
			import { TaskContext } from "@exactjs/core";
		function ServerSummary() {
			const __fixtureTask3 = async (_task: TaskContext = TaskContext.server()) => loadSummary();
__fixtureTask3();
			return () => <p>Server summary</p>;
		}
		export function Panel(this: Component<{ count: number }>) {
			const __fixtureTask4 = async (_task: TaskContext = TaskContext.server()) => loadPanel();
__fixtureTask4();
			return () =>
				<section onClick={() => this.state.count++}>
					<div><ServerSummary /></div>
				</section>;
		}
	`
	server := NewSession().Execute(Request{
		ID:               "panel.tsx",
		Kind:             "compile",
		Target:           TargetServer,
		ServerComponents: true,
		Source:           source,
	})
	if server.Error != "" {
		t.Fatal(server.Error)
	}
	var island Boundary
	var slot Boundary
	for _, boundary := range server.Analysis.Boundaries {
		if boundary.Name == "Panel_ExactClient_1" {
			island = boundary
		}
		if boundary.Name == "Panel_ExactClient_1:children" {
			slot = boundary
		}
	}
	if island.ID == "" || slot.ID != island.ID+":children" ||
		slot.Kind != "server-slot" {
		t.Fatalf(
			"unexpected generated island server slot: island=%#v slot=%#v",
			island,
			slot,
		)
	}
	for _, expected := range []string{
		`__exactBoundary("` + island.ID + `", "Panel_ExactClient_1", {`,
		`__exactVNode("div"`,
		`__exactComponentVNode(ServerSummary`,
		"loadSummary",
	} {
		if !strings.Contains(server.Code, expected) {
			t.Fatalf(
				"native generated island server slot is missing %q:\n%s",
				expected,
				server.Code,
			)
		}
	}
	if strings.Contains(server.Code, "onClick") {
		t.Fatalf("client event escaped into server slot output:\n%s", server.Code)
	}

	client := NewSession().Execute(Request{
		ID:               "panel.tsx",
		Kind:             "compile",
		Target:           TargetClient,
		ServerComponents: true,
		Source:           source,
	})
	if client.Error != "" {
		t.Fatal(client.Error)
	}
	for _, expected := range []string{
		`export function Panel_ExactClient_1`,
		`onClick: () => __exactUpdateResult`,
		`props.children`,
	} {
		if !strings.Contains(client.Code, expected) {
			t.Fatalf(
				"client server-slot island is missing %q:\n%s",
				expected,
				client.Code,
			)
		}
	}
	for _, forbidden := range []string{
		"loadSummary",
		"loadPanel",
	} {
		if strings.Contains(client.Code, forbidden) {
			t.Fatalf(
				"server child escaped into generated client island (%q):\n%s",
				forbidden,
				client.Code,
			)
		}
	}
}

func TestSessionBridgesValueCapturesIntoGeneratedIntrinsicIsland(t *testing.T) {
	source := `
			import { TaskContext } from "@exactjs/core";
		export function Panel(this: Component<{ count: number }>) {
			const __fixtureTask5 = async (_task: TaskContext = TaskContext.server()) => loadPanel();
__fixtureTask5();
			const label = String(this.state.count);
			return () =>
				<button onClick={() => console.log(label)}>
					{label}
				</button>;
		}
	`
	server := NewSession().Execute(Request{
		ID:               "panel.tsx",
		Kind:             "compile",
		Target:           TargetServer,
		ServerComponents: true,
		Source:           source,
	})
	if server.Error != "" {
		t.Fatal(server.Error)
	}
	if !strings.Contains(
		server.Code,
		`"__exactState": { count: this.state.count }`,
	) || strings.Contains(server.Code, `"__exactCapture": { label: label }`) {
		t.Fatalf(
			"server client-island derived capture was not reduced to state:\n%s",
			server.Code,
		)
	}
	if strings.Contains(server.Code, "console.log") ||
		strings.Contains(server.Code, "onClick") {
		t.Fatalf(
			"captured client behavior escaped into server output:\n%s",
			server.Code,
		)
	}

	client := NewSession().Execute(Request{
		ID:               "panel.tsx",
		Kind:             "compile",
		Target:           TargetClient,
		ServerComponents: true,
		Source:           source,
	})
	if client.Error != "" {
		t.Fatal(client.Error)
	}
	for _, expected := range []string{
		`const label = __exactDerived(() => String(this.state.count));`,
		`console.log(label.get())`,
		`__exactDynamic(() => label.get()`,
	} {
		if !strings.Contains(client.Code, expected) {
			t.Fatalf(
				"generated client-island capture is missing %q:\n%s",
				expected,
				client.Code,
			)
		}
	}
	if strings.Contains(client.Code, "props.__exactCapture.label") {
		t.Fatalf(
			"reconstructable derived value remained an opaque capture:\n%s",
			client.Code,
		)
	}
}

func TestSessionClonesFunctionCapturesIntoGeneratedIntrinsicIsland(t *testing.T) {
	source := `
			import { TaskContext } from "@exactjs/core";
		export function Panel(this: Component<{ count: number }>) {
			const __fixtureTask6 = async (_task: TaskContext = TaskContext.server()) => loadPanel();
__fixtureTask6();
			const prefix = "saved";
			function save() {
				console.log(prefix);
				this.state.count++;
			}
			const cancel = () => {
				this.state.count--;
			};
			return () =>
				<button onClick={() => {
					save();
					cancel();
				}}>
					Save
				</button>;
		}
	`
	server := NewSession().Execute(Request{
		ID:               "panel.tsx",
		Kind:             "compile",
		Target:           TargetServer,
		ServerComponents: true,
		Source:           source,
	})
	if server.Error != "" {
		t.Fatal(server.Error)
	}
	if strings.Contains(server.Code, "onClick") {
		t.Fatalf(
			"client function invocation escaped into server output:\n%s",
			server.Code,
		)
	}

	client := NewSession().Execute(Request{
		ID:               "panel.tsx",
		Kind:             "compile",
		Target:           TargetClient,
		ServerComponents: true,
		Source:           source,
	})
	if client.Error != "" {
		t.Fatal(client.Error)
	}
	for _, expected := range []string{
		`function save()`,
		`const cancel = () =>`,
		`console.log(props.__exactCapture.prefix)`,
		`save();`,
		`cancel();`,
		`__exactUpdateResult(this.state, ["count"]`,
	} {
		if !strings.Contains(client.Code, expected) {
			t.Fatalf(
				"generated client-island function capture is missing %q:\n%s",
				expected,
				client.Code,
			)
		}
	}
	if strings.Contains(client.Code, "loadPanel") {
		t.Fatalf(
			"server task escaped with client function captures:\n%s",
			client.Code,
		)
	}
	if !strings.Contains(
		server.Code,
		`"__exactCapture": { prefix: prefix }`,
	) {
		t.Fatalf(
			"transitive function value capture is missing from server payload:\n%s",
			server.Code,
		)
	}
}

func TestSessionOmitsServerOnlyComponentsFromClientArtifact(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "server-components.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { TaskContext } from "@exactjs/core";
			export function ServerOnly() {
				const __fixtureTask3 = async (_task: TaskContext = TaskContext.server()) => {
					await loadPrivateFunction();
				};
__fixtureTask3();
				return () => <output>server function</output>;
			}
			export const ServerValue = function () {
				const __fixtureTask4 = async (_task: TaskContext = TaskContext.server()) => {
					await loadPrivateValue();
				};
__fixtureTask4();
				return () => <output>server value</output>;
			};
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Components) != 2 {
		t.Fatalf("unexpected components: %#v", response.Analysis.Components)
	}
	for _, component := range response.Analysis.Components {
		if component.Placement != "server" {
			t.Fatalf("component was not server-only: %#v", component)
		}
	}
	for _, expected := range []string{
		"export const ServerOnly",
		"export const ServerValue",
		"createServerBoundary",
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("server-only client stub is missing %q:\n%s", expected, response.Code)
		}
	}
	for _, forbidden := range []string{
		"loadPrivateFunction",
		"loadPrivateValue",
		"server function",
		"server value",
		"createCompiledVNode",
	} {
		if strings.Contains(response.Code, forbidden) {
			t.Fatalf(
				"server-only component material escaped into the client artifact (%q):\n%s",
				forbidden,
				response.Code,
			)
		}
	}
}

func TestSessionPrunesImportsOwnedOnlyByOppositeArtifact(t *testing.T) {
	server := NewSession().Execute(Request{
		ID:     "page.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `
			import { clientOnly, retainedOnServer } from "./values.js";
			import "./setup.js";
			function ClientButton() {
				const label = clientOnly;
				return () =>
					<button onClick={() => alert(label)}>Go</button>;
			}
			export function Page() {
				const value = retainedOnServer;
				return () => <ClientButton value={value} />;
			}
		`,
	})
	if server.Error != "" {
		t.Fatal(server.Error)
	}
	if strings.Contains(server.Code, "clientOnly") ||
		!strings.Contains(server.Code, `import { retainedOnServer } from "./values.js"`) ||
		!strings.Contains(server.Code, `import "./setup.js"`) {
		t.Fatalf(
			"server artifact imports were not partitioned:\n%s",
			server.Code,
		)
	}

	client := NewSession().Execute(Request{
		ID:     "loader.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { TaskContext } from "@exactjs/core";
			import { privateLoader, retainedOnClient } from "./values.js";
			import "./setup.js";
			export function ServerOnly() {
				const __fixtureTask5 = async (_task: TaskContext = TaskContext.server()) => privateLoader();
__fixtureTask5();
				return () => <output />;
			}
			export const clientMarker = retainedOnClient;
		`,
	})
	if client.Error != "" {
		t.Fatal(client.Error)
	}
	if strings.Contains(client.Code, "privateLoader") ||
		!strings.Contains(client.Code, `import { retainedOnClient } from "./values.js"`) ||
		!strings.Contains(client.Code, `import "./setup.js"`) {
		t.Fatalf(
			"client artifact imports were not partitioned:\n%s",
			client.Code,
		)
	}
}

func TestSessionCollectsNamespacedJSXAttributes(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Source: `const view = <div className="base" className:active={ready} {...props} />;`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	elements := response.Analysis.JSX
	if len(elements) != 1 || elements[0].Tag != "div" || !elements[0].Intrinsic {
		t.Fatalf("unexpected JSX elements: %#v", elements)
	}
	attributes := elements[0].Attributes
	if len(attributes) != 3 {
		t.Fatalf("received %d JSX attributes, expected 3", len(attributes))
	}
	if attributes[1].Namespace != "className" || attributes[1].Name != "active" ||
		attributes[1].ValueKind != "expression" {
		t.Fatalf("unexpected namespaced JSX attribute: %#v", attributes[1])
	}
	if attributes[2].ValueKind != "spread" {
		t.Fatalf("unexpected spread JSX attribute: %#v", attributes[2])
	}
}

func TestSessionLowersConditionalClassNamesInAuthoredOrder(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			function Card(this: Component<{ active: boolean; disabled: boolean }>, props: { className?: unknown }) {
				return () => (
					<div
						className:active={this.state.active}
						className={props.className}
						className:disabled={!this.state.disabled}
					/>
				);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`className: [`,
		`{ "active": __exactExpression(() => this.state.active) }`,
		`__exactExpression(() => props.className)`,
		`{ "disabled": __exactExpression(() => !this.state.disabled) }`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("conditional class output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `"className:active"`) ||
		strings.Contains(response.Code, `"className:disabled"`) {
		t.Fatalf("conditional class namespace escaped into output:\n%s", response.Code)
	}
}

func TestSessionFoldsStaticConditionalClassNames(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Source: `const view = <div className="card" className:selected />;`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, `className: "card selected"`) {
		t.Fatalf("static class contributions were not folded:\n%s", response.Code)
	}
}

func TestSessionAllowsPossibleDynamicConditionalClassDuplicates(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `const view = (
			<div className:active={selected} className:active={focused} />
		);`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 {
		t.Fatalf("possible dynamic collision was rejected: %#v", response.Diagnostics)
	}
	if strings.Count(response.Code, `"active":`) != 2 {
		t.Fatalf("dynamic class contributions were deduplicated:\n%s", response.Code)
	}
}

func TestSessionRejectsAmbiguousConditionalClassInputs(t *testing.T) {
	tests := []struct {
		name    string
		source  string
		message string
	}{
		{
			name:    "spread",
			source:  `const view = <div className:active={ready} {...props} />;`,
			message: "prop spreads cannot be combined with className:name",
		},
		{
			name:    "component",
			source:  `const view = <Card className:active={ready} />;`,
			message: "not component props",
		},
		{
			name:    "class alias",
			source:  `const view = <div class="card" className:active={ready} />;`,
			message: "use className",
		},
		{
			name:    "static collision",
			source:  `const view = <div className="card active" className:active={ready} />;`,
			message: `class token "active" is already contributed`,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{
				ID:     "component.tsx",
				Kind:   "compile",
				Source: test.source,
			})
			found := false
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Code == "EXACT_CLASS_NAME" &&
					strings.Contains(diagnostic.Message, test.message) {
					found = true
					break
				}
			}
			if !found {
				t.Fatalf("missing %q diagnostic: %#v", test.message, response.Diagnostics)
			}
		})
	}
}

func TestSessionCollectsDirectComponentStateWrites(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			function Counter() {
				this.state.count = 1;
				this.state.count++;
				delete this.state.cache["entry"];
				this.state.items.push("next");
				return () => <output>{this.state.count}</output>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	writes := response.Analysis.StateWrites
	if len(writes) != 4 {
		t.Fatalf("received %d state writes, expected 4: %#v", len(writes), writes)
	}
	expectedOperations := []string{"assignment", "update", "delete", "array-mutation"}
	for index, operation := range expectedOperations {
		if writes[index].Component != "Counter" || writes[index].Operation != operation {
			t.Fatalf("unexpected state write %d: %#v", index, writes[index])
		}
	}
	if writes[2].Path[0] != "cache" || writes[2].Path[1] != "entry" {
		t.Fatalf("unexpected element-access path: %#v", writes[2].Path)
	}
	for _, expected := range []string{
		`writeReactiveLazy as __exactWrite`,
		`updateReactiveValueWithResult as __exactUpdateResult`,
		`deleteReactiveValue as __exactDelete`,
		`mutateReactiveArray as __exactArrayMutation`,
		`__exactWrite(this.state, ["count"], () => 1)`,
		`__exactUpdateResult(this.state, ["count"], previous =>`,
		`__exactDelete(this.state, ["cache", "entry"])`,
		`__exactArrayMutation(this.state, ["items"], "push", () => ["next"])`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("native state-write output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionClassifiesSetupStateAssignments(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "analyze",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare function peek<T>(read: () => T): T;
			function Counter(
				this: Component<{ initial: number; snapshot: number; derived: number; task: number }>,
				{ value }: { value: number },
			) {
				this.state.initial = 1;
				this.state.snapshot = peek(() => value);
				this.state.derived = value * 2;
				const __fixtureTask6 = (_task: TaskContext = TaskContext.latest()) => {
					this.state.task = value;
				};
__fixtureTask6();
				return () => null;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	writes := response.Analysis.StateWrites
	if len(writes) != 4 {
		t.Fatalf("received %d state writes, expected 4: %#v", len(writes), writes)
	}
	expected := []string{"initialization", "initialization", "deferred-reactive", ""}
	for index, execution := range expected {
		if writes[index].SetupExecution != execution {
			t.Fatalf("unexpected setup execution for write %d: %#v", index, writes[index])
		}
	}
}

func TestSessionLowersMapAndSetStateMutations(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			function Collections(this: {
				state: {
					lookup: Map<string, number>;
					selected: Set<string>;
				};
			}) {
				this.state.lookup.set("answer", 42);
				this.state.lookup.delete("missing");
				this.state.selected.add("answer");
				this.state.selected.clear();
				return () => <output>{this.state.lookup.get("answer")}</output>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	writes := response.Analysis.StateWrites
	if len(writes) != 4 {
		t.Fatalf("received %d collection writes, expected 4: %#v", len(writes), writes)
	}
	expectedOperations := []string{
		"map-mutation",
		"map-mutation",
		"set-mutation",
		"set-mutation",
	}
	for index, operation := range expectedOperations {
		if writes[index].Operation != operation {
			t.Fatalf("unexpected collection write %d: %#v", index, writes[index])
		}
	}
	for _, expected := range []string{
		`mutateReactiveCollection as __exactCollectionMutation`,
		`__exactCollectionMutation(this.state, ["lookup"], "map", "set", () => ["answer", 42])`,
		`__exactCollectionMutation(this.state, ["lookup"], "map", "delete", () => ["missing"])`,
		`__exactCollectionMutation(this.state, ["selected"], "set", "add", () => ["answer"])`,
		`__exactCollectionMutation(this.state, ["selected"], "set", "clear", () => [])`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("collection state-write output is missing %q:\n%s", expected, response.Code)
		}
	}

	server := NewSession().Execute(Request{
		ID:     "server-collections.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `
			import { TaskContext } from "@exactjs/core";
			function Collections(this: {
				state: { lookup: Map<string, number> };
				task: { server(work: () => void): void };
			}) {
				const __fixtureTask7 = (_task: TaskContext = TaskContext.server()) => {
					this.state.lookup.set("answer", 42);
				};
__fixtureTask7();
				return () => <output />;
			}
		`,
	})
	if !strings.Contains(
		server.Code,
		`__exactTaskCollectionMutation(_task.signal, this.state, ["lookup"], "map", "set", () => ["answer", 42])`,
	) {
		t.Fatalf("server collection delta lowering is missing:\n%s", server.Code)
	}

	invalid := NewSession().Execute(Request{
		ID:     "invalid-server-map-key.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `
			import { TaskContext } from "@exactjs/core";
			function Collections(this: {
				state: { lookup: Map<{ id: string }, number> };
				task: { server(work: () => void): void };
			}) {
				const __fixtureTask8 = (_task: TaskContext = TaskContext.server()) => {
					this.state.lookup.set({ id: "answer" }, 42);
				};
__fixtureTask8();
				return () => <output />;
			}
		`,
	})
	found := false
	for _, diagnostic := range invalid.Diagnostics {
		if diagnostic.Code == "EXACT2001" &&
			strings.Contains(diagnostic.Message, "Map key must be") {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing server Map key diagnostic: %#v", invalid.Diagnostics)
	}
}

func TestSessionLowersAliasedCompoundStateWrites(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			function Counter() {
				const state = this.state;
				state.count += 2;
				const items = state.items;
				items.unshift("first");
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`__exactUpdate(this.state, ["count"], previous => previous + 2)`,
		`__exactArrayMutation(this.state, ["items"], "unshift", () => ["first"])`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("aliased state-write output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionLowersComputedStateWriteKeysAsExecutablePaths(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "computed-write.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			function Editor(
				this: Component<{ rows: Array<{ value: number }> }>,
				props: { index: number },
			) {
				const rows = this.state.rows;
				return () => <button onClick={() => {
					rows[props.index].value += calculate();
				}} />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", response.Diagnostics)
	}
	if len(response.Analysis.StateWrites) != 1 {
		t.Fatalf("unexpected writes: %#v", response.Analysis.StateWrites)
	}
	write := response.Analysis.StateWrites[0]
	if strings.Join(write.Path, ".") != "rows.*.value" {
		t.Fatalf("unexpected computed write path: %#v", write)
	}
	for _, expected := range []string{
		`__exactUpdate(this.state, ["rows", props.index, "value"]`,
		`previous => previous + calculate()`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("computed write output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionEnforcesRerunnableRenderContract(t *testing.T) {
	accepted := NewSession().Execute(Request{
		ID:   "accepted-render.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			function Panel(this: Component<{ count: number }>) {
				const Controls = () =>
					<button onClick={() => this.state.count++}>{String(this.state.count)}</button>;
				return () => <Controls />;
			}
		`,
	})
	if accepted.Error != "" {
		t.Fatal(accepted.Error)
	}
	if len(accepted.Diagnostics) != 0 {
		t.Fatalf("valid shared render produced diagnostics: %#v", accepted.Diagnostics)
	}
	if len(accepted.Analysis.Components) != 1 ||
		accepted.Analysis.Components[0].Name != "Panel" {
		t.Fatalf("micro-component acquired component identity: %#v", accepted.Analysis.Components)
	}

	rejected := NewSession().Execute(Request{
		ID:   "rejected-render.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> {
				state: State;
				onMount(work: () => void): void;
			}
			function Panel(this: Component<{ count: number }>) {
				return () => {
					this.state.count++;
					this.onMount(() => undefined);
					setTimeout(() => undefined, 1);
					return <button onClick={() => this.state.count++} />;
				};
			}
		`,
	})
	messages := []string{}
	for _, diagnostic := range rejected.Diagnostics {
		if diagnostic.Code == "EXACT_RENDER" {
			messages = append(messages, diagnostic.Message)
		}
	}
	for _, expected := range []string{
		"must contain one view expression",
		"may not write component state",
		"may not register lifecycle work",
		"may not schedule asynchronous work",
	} {
		found := false
		for _, message := range messages {
			if strings.Contains(message, expected) {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing %q render diagnostic: %#v", expected, rejected.Diagnostics)
		}
	}
}

func TestSessionLowersLexicalMicroComponentsWithoutDurableIdentity(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "micro-components.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			function Article(this: Component<{ copyrightText: string }>) {
				const Footer = (props: { prefix?: string } = {}) => (
					<footer>{props.prefix}{this.state.copyrightText}</footer>
				);
				const Page = () => <article><Footer prefix="Copyright: " /></article>;
				return () => <Page />;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("micro-component compilation failed: %#v", response)
	}
	if len(response.Analysis.Components) != 1 ||
		response.Analysis.Components[0].Name != "Article" {
		t.Fatalf("micro-components acquired durable identity: %#v", response.Analysis.Components)
	}
	for _, expected := range []string{
		`const Footer = (props: {`,
		`__exactVNode("footer"`,
		`const Page = () => __exactVNode("article",`,
		`Footer({ prefix: "Copyright: " })`,
		`return () => Page({});`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("micro-component output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionAppliesRenderPurityToLexicalMicroComponents(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "impure-micro-component.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			function Article(this: Component<{ count: number }>) {
				const Footer = () => {
					this.state.count++;
					return <footer>{this.state.count}</footer>;
				};
				return () => <Footer />;
			}
		`,
	})
	found := false
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == "EXACT_RENDER" &&
			strings.Contains(diagnostic.Message, "may not write component state") {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing micro-component render diagnostic: %#v", response.Diagnostics)
	}

	mutable := NewSession().Execute(Request{
		ID:   "mutable-micro-component.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			function Article(this: Component<{ text: string }>) {
				let Footer = () => <footer>{this.state.text}</footer>;
				return () => <Footer />;
			}
		`,
	})
	found = false
	for _, diagnostic := range mutable.Diagnostics {
		if diagnostic.Code == "EXACT_RENDER" &&
			strings.Contains(diagnostic.Message, "immutable const") {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing mutable micro-component diagnostic: %#v", mutable.Diagnostics)
	}
}

func TestSessionRejectsSharedRenderCallables(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "shared-arrow.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			const renderPanel = () => <p />;
			function renderStatus() { return <output />; }
			function Panel(this: Component<{}>) {
				return renderPanel;
			}
			function Status(this: Component<{}>) {
				return renderStatus;
			}
			function renderBound(this: Component<{}>) { return <aside />; }
			function Bound(this: Component<{}>) {
				return renderBound.bind(this);
			}
		`,
	})
	found := 0
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == "EXACT_RENDER" &&
			strings.Contains(diagnostic.Message, "component-local render arrow") {
			found++
		}
	}
	if found != 3 {
		t.Fatalf("missing shared-render diagnostics: %#v", response.Diagnostics)
	}
}

func TestSessionPassesThroughExplicitForeignJSXModules(t *testing.T) {
	source := `/** @jsxImportSource react */
			import { useState } from "react";
			export function ReactStepper() {
				const [count, setCount] = useState(0);
				if (count < 0) return <p>Invalid</p>;
				return <button onClick={() => setCount(count + 1)}>{count}</button>;
			}
		`
	response := NewSession().Execute(Request{
		ID:     "react-stepper.tsx",
		Kind:   "compile",
		Source: source,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf("foreign JSX module was analyzed as eXact: %#v", response)
	}
	if len(response.Analysis.Components) != 0 || response.Code != source {
		t.Fatalf("foreign JSX module was not passed through: %#v", response)
	}
}

func TestSessionPreservesChainedAndMixedAssignmentResults(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "assignment-results.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			function Editor(this: Component<{ a: number; b: number }>) {
				let local = 1;
				return () => <button onClick={() => consume(
					this.state.a = this.state.b = local = calculate()
				)} />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", response.Diagnostics)
	}
	for _, expected := range []string{
		`__exactWrite(this.state, ["a"], () => __exactWrite(this.state, ["b"], () => local = calculate()))`,
		`consume(__exactWrite`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("chained assignment output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionRejectsDynamicContinuationWriteContract(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "dynamic-continuation.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> {
				state: State;
				task(work: () => void): void;
			}
			function Editor(
				this: Component<{ rows: Array<{ value: number }> }>,
				props: { index: number },
			) {
				const __fixtureTask9 = (_task: TaskContext = TaskContext.latest()) => {
					this.state.rows[props.index].value = calculate();
				};
__fixtureTask9();
				return () => <output />;
			}
		`,
	})
	found := false
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == "EXACT2001" &&
			strings.Contains(diagnostic.Message, "dynamic computed path") {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing dynamic continuation diagnostic: %#v", response.Diagnostics)
	}
}

func TestSessionRejectsUnrepresentableStateMutationForms(t *testing.T) {
	tests := map[string]string{
		"for-of target": `
			function Editor(this: Component<{ current: number }>) {
				return () => <button onClick={() => {
					for (this.state.current of values) consume(this.state.current);
				}} />;
			}
		`,
		"destructured for-of target": `
			function Editor(this: Component<{ current: number }>) {
				return () => <button onClick={() => {
					for ([this.state.current] of values) consume(this.state.current);
				}} />;
			}
		`,
		"Reflect.set": `
			function Editor(this: Component<{ current: number }>) {
				return () => <button onClick={() => {
					Reflect.set(this.state, "current", 1);
				}} />;
			}
		`,
		"Object.defineProperty": `
			function Editor(this: Component<{ current: number }>) {
				return () => <button onClick={() => {
					Object.defineProperty(this.state, "current", { value: 1 });
				}} />;
			}
		`,
	}
	for name, source := range tests {
		t.Run(name, func(t *testing.T) {
			response := NewSession().Execute(Request{
				ID:     name + ".tsx",
				Kind:   "compile",
				Source: source,
			})
			found := false
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Code == "EXACT_STATE_WRITE" {
					found = true
				}
			}
			if !found {
				t.Fatalf("missing state-write diagnostic: %#v", response.Diagnostics)
			}
		})
	}
}

func TestSessionDefersCanonicalComponentLogArgumentsUntilRuntimeEnablement(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/tmp/component-logging.tsx",
		Kind: "compile",
		Source: `
			declare const audit: { log: { debug(message: string, data: unknown): void } };
			export function Panel(this: Component<{ count: number }>) {
				this.log.trace("trace", { count: this.state.count });
				this.log.debug("debug", { count: this.state.count });
				this.log.info("info");
				this.log.warn("warn");
				this.log.error("error", new Error("failure"));
				audit.log.debug("external", { count: this.state.count });
				return () => <output>{this.state.count}</output>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`componentLogMethod as __exactComponentLog`,
		`from "@exactjs/core/runtime/logging"`,
		`__exactComponentLog(this, "trace")?.(() => ["trace", { count: this.state.count }])`,
		`__exactComponentLog(this, "debug")?.(() => ["debug", { count: this.state.count }])`,
		`__exactComponentLog(this, "info")?.(() => ["info"])`,
		`__exactComponentLog(this, "warn")?.(() => ["warn"])`,
		`__exactComponentLog(this, "error")?.(() => ["error", new Error("failure")])`,
		`audit.log.debug("external", { count: this.state.count })`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("component logging output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `this.log.debug(`) {
		t.Fatalf("canonical component log call was left eager:\n%s", response.Code)
	}
}

func TestSessionKeepsLoweredLogWorkInsideRenderAndVariableBoundaries(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/tmp/render-logging.tsx",
		Kind: "compile",
		Source: `
			declare function inspect(value: number): { value: number };
				export function Panel(this: Component<{ count: number }>) {
				const authoredEager = inspect(1);
				const reactiveLabel = ` + "`label:${this.state.count}`" + `;
				const observation = (this.log.debug(
					` + "`observed:${this.state.count}`" + `
				), "logged");
				this.onRender(() => this.log.info(reactiveLabel));
				return () => <button onClick={() => this.log.debug(
					` + "`count:${this.state.count}`" + `,
					{ current: this.state.count, nested: inspect(this.state.count) }
				)}>{authoredEager.value}{observation}</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	code := strings.Join(strings.Fields(response.Code), " ")
	deferredCall := `__exactComponentLog(this, "debug")?.(() => [` +
		"`count:${this.state.count}`" +
		`, { current: this.state.count, nested: inspect(this.state.count) }])`
	if !strings.Contains(code, deferredCall) {
		t.Fatalf("log argument work escaped its optional-call boundary; missing %q:\n%s", deferredCall, response.Code)
	}
	if !strings.Contains(code, `const authoredEager = inspect(1)`) {
		t.Fatalf("an explicitly eager authored variable changed evaluation boundaries:\n%s", response.Code)
	}
	for _, expected := range []string{
		"const reactiveLabel = __exactDerived(() => `label:${this.state.count}`)",
		`__exactComponentLog(this, "info")?.(() => [reactiveLabel.get()])`,
	} {
		if !strings.Contains(code, expected) {
			t.Fatalf("derived log value did not retain its single reactive owner; missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(code, `__exactDerived(() => __exactComponentLog`) {
		t.Fatalf("the logging expression became a derived computation:\n%s", response.Code)
	}
	if strings.Contains(code, `const observation = __exactDerived`) ||
		!strings.Contains(
			code,
			"const observation = (__exactComponentLog(this, \"debug\")?.(() => [`observed:${this.state.count}`]), \"logged\")",
		) {
		t.Fatalf("a log-only reactive read changed the surrounding variable into derived state:\n%s", response.Code)
	}
}

func TestSessionPreservesCollapsedMultilineJSXTextBoundaries(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/tmp/multiline-whitespace.tsx",
		Kind: "compile",
		Source: `function Notice(this: Component<{ date: string }>) {
			return () => <>
				<p>
					Published
					{this.state.date}
					today.
				</p>
				<p>
					Published {this.state.date}
					.
				</p>
			</>;
		}`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{`"Published "`, `" today."`} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("multiline JSX output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, `" ",`) {
		t.Fatalf("indentation-only JSX text escaped into output:\n%s", response.Code)
	}
	if strings.Contains(response.Code, `" ."`) {
		t.Fatalf("multiline punctuation retained indentation whitespace:\n%s", response.Code)
	}
}

func TestSessionLowersFragmentsSpreadsAndNamespacedAttributes(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "fragment.tsx",
		Kind: "compile",
		Source: `
			const __exactVNode = "occupied";
			const view = <>
				<input disabled custom:active={ready} {...props} />
				{value}
			</>;
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`createCompiledVNode as __exactVNode_1`,
		`__exactFragment({}`,
		`__exactVNode_1("input"`,
		`disabled: true`,
		`"custom:active": __exactExpression(() => ready)`,
		`...props`,
		`__exactDynamic(() => value`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("native JSX output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionElidesSingleConsumerScalarDerivedBindings(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "derived.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			function Summary(this: Component<{ count: number }>) {
				const count = this.state.count;
				const label = ` + "`Count: ${count}`" + `;
				return () => <output>{label}</output>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`const __exact_count_1 = this.state.count`,
		"const __exact_label_1 = `Count: ${__exact_count_1}`",
		`return __exact_label_1`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("elided derived output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, "createDerived") ||
		strings.Contains(response.Code, "const count =") ||
		strings.Contains(response.Code, "const label =") {
		t.Fatalf("single-consumer scalar derived cells were retained:\n%s", response.Code)
	}
}

func TestSessionRetainsSharedAndIdentityBearingDerivedBindings(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "shared-derived.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			declare function Details(props: { options: { label: string } }): unknown;
			function Summary(this: Component<{ count: number }>) {
				const label = ` + "`Count: ${this.state.count}`" + `;
				const options = { label: String(this.state.count) };
				return () => <>
					<output>{label}</output>
					<input aria-label={label} />
					<Details options={options} />
				</>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`createDerived as __exactDerived`,
		"const label = __exactDerived(() => `Count: ${this.state.count}`)",
		`const options = __exactDerived(() => ({ label: String(this.state.count) }))`,
		`label.get()`,
		`options.get()`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("retained derived output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionCachesRepeatedDerivedReadsForControlFlowNarrowing(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "derived-narrowing.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			function Marker(this: Component<{ enabled: boolean }>) {
				const point = this.state.enabled ? { x: 1, y: 2 } : undefined;
				return () => <output>{point ? <><i>{point.x}</i><b>{point.y}</b></> : "missing"}</output>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`const point = __exactDerived(() => this.state.enabled ? { x: 1, y: 2 } : undefined)`,
		`const __exact_cached_point_1 = point.get()`,
		`return __exact_cached_point_1 ? __exactFragment`,
		`__exact_cached_point_1.x`,
		`__exact_cached_point_1.y`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("derived narrowing output is missing %q:\n%s", expected, response.Code)
		}
	}
	identities := regexp.MustCompile(`data-exact-id": "([^"]+)"`).
		FindAllStringSubmatch(response.Code, -1)
	seen := make(map[string]struct{}, len(identities))
	for _, identity := range identities {
		if _, duplicate := seen[identity[1]]; duplicate {
			t.Fatalf("cached derived lowering duplicated element identity %q:\n%s", identity[1], response.Code)
		}
		seen[identity[1]] = struct{}{}
	}
}

func TestSessionReadsDerivedValuesForInferredTaskDependencies(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "derived-task.ts",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Search(this: Component<{ query: string }>) {
				const label = this.state.query + "!";
				const __fixtureTask10 = (_task: TaskContext = TaskContext.latest()) => consume(label);
__fixtureTask10();
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`const label = __exactDerived(() => this.state.query + "!")`,
		`this.reactive(() => label.get())`,
		`(__exactDependency: string, _task: TaskContext) => consume(__exactDependency)`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("native derived task output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionTracksStateAliasesAndStopsAfterReassignment(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			function Editor(this: Component<any>) {
				const state = this.state;
				const user = state.user;
				const { profile: { name } } = user;
				const [first] = this.state.items;
				let current = this.state.current;
				state.count++;
				user.name = "updated";
				name.value = "nested";
				first.done = true;
				current.value = 1;
				current = other;
				current.value = 2;
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.StateAliases) != 5 {
		t.Fatalf(
			"received %d state aliases, expected 5: %#v",
			len(response.Analysis.StateAliases),
			response.Analysis.StateAliases,
		)
	}
	writes := response.Analysis.StateWrites
	if len(writes) != 5 {
		t.Fatalf("received %d alias-aware writes, expected 5: %#v", len(writes), writes)
	}
	expected := [][]string{
		{"count"},
		{"user", "name"},
		{"user", "profile", "name", "value"},
		{"items", "0", "done"},
		{"current", "value"},
	}
	for index := range expected {
		if !equalStrings(writes[index].Path, expected[index]) {
			t.Fatalf("unexpected state path %d: %#v", index, writes[index].Path)
		}
	}
	var invalidated *StateAlias
	for index := range response.Analysis.StateAliases {
		if response.Analysis.StateAliases[index].Name == "current" {
			invalidated = &response.Analysis.StateAliases[index]
			break
		}
	}
	if invalidated == nil || invalidated.InvalidAt == 0 {
		t.Fatalf("current alias did not record reassignment: %#v", invalidated)
	}
}

func TestSessionCollectsExactAndBroadStateReads(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			function Reader(this: Component<any>, index: number) {
				const user = this.state.user;
				const label = user.profile.name;
				const item = this.state.items[index];
				this.state.items.map((entry: any) => entry.id);
				this.state.count = 1;
				this.state.total += 1;
				return () => <output>{label}{item}</output>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	reads := response.Analysis.StateReads
	if !containsStateRead(reads, []string{"user"}, "exact") ||
		!containsStateRead(reads, []string{"user", "profile", "name"}, "exact") ||
		!containsStateRead(reads, []string{"items", "*"}, "broad") ||
		!containsStateRead(reads, []string{"items"}, "exact") {
		t.Fatalf("missing expected state reads: %#v", reads)
	}
	if containsStateRead(reads, []string{"count"}, "exact") ||
		!containsStateRead(reads, []string{"total"}, "exact") {
		t.Fatalf("state assignment/update reads were classified incorrectly: %#v", reads)
	}
}

func TestSessionBuildsReactiveBindingProvenance(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State; getContext(token: unknown): unknown }
			function Summary(this: Component<any>, title: string) {
				const count = this.state.count;
				const label = title + count;
				const constant = 1;
				const context = this.getContext(Token);
				const upper = label.toUpperCase();
				const helper = () => count;
				return () => <output>{upper}{constant}{context}{helper()}</output>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	bindings := response.Analysis.ReactiveBindings
	assertReactiveBinding(t, bindings, "this", "state", true)
	assertReactiveBinding(t, bindings, "title", "props", true)
	assertReactiveBinding(t, bindings, "count", "derived", true)
	label := assertReactiveBinding(t, bindings, "label", "derived", true)
	if !equalStrings(label.Dependencies, []string{"title", "count"}) {
		t.Fatalf("unexpected label dependencies: %#v", label.Dependencies)
	}
	if len(label.References) != 1 {
		t.Fatalf("expected one symbol-resolved label use: %#v", label.References)
	}
	assertReactiveBinding(t, bindings, "constant", "unknown", true)
	assertReactiveBinding(t, bindings, "context", "context", false)
	assertReactiveBinding(t, bindings, "upper", "derived", true)
	assertReactiveBinding(t, bindings, "helper", "unknown", true)
}

func TestSessionDoesNotQueryGeneratedTaskDependenciesWithSourceChecker(t *testing.T) {
	t.Parallel()
	session := NewSession()
	response := session.Execute(Request{
		ID:   "GeneratedTaskDependency.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			function View(
				this: Component<{ items: string[] }>
			) {
				const items = this.state.items;
				const __fixtureTask11 = (_task: TaskContext = TaskContext.latest()) => {
					items.map(item => item);
				};
__fixtureTask11();
				return () => <p />;
			}
		`,
	})
	if response.Error != "" || len(response.Diagnostics) != 0 {
		t.Fatalf(
			"generated task dependency failed compilation: %s %#v",
			response.Error,
			response.Diagnostics,
		)
	}
	if response.Code == "" {
		t.Fatal("generated task dependency produced no output")
	}
}

func TestSessionAttributesStateEffectsToTaskWork(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Loader(this: Component<any>) {
				const items = this.state.items;
				const __fixtureTask14 = async (_task: TaskContext = TaskContext.deferred()) => {
					const first = items[0].id;
					this.state.result = first;
					this.state.items.push(first);
				};
__fixtureTask14();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	tasks := response.Analysis.Tasks
	if len(tasks) != 1 {
		t.Fatalf("received %d tasks, expected 1: %#v", len(tasks), tasks)
	}
	task := tasks[0]
	if !task.Async || task.Placement != "isomorphic" {
		t.Fatalf("unexpected task execution facets: %#v", task)
	}
	hasItemsRead := false
	for _, read := range task.Reads {
		if read.Path == "items" && read.Confidence == "exact" {
			hasItemsRead = true
			break
		}
	}
	if !hasItemsRead {
		t.Fatalf("task omitted its state collection read: %#v", task.Reads)
	}
	if len(task.Writes) != 2 ||
		task.Writes[0].Path != "result" ||
		task.Writes[1].Path != "items" ||
		task.Writes[1].Confidence != "broad" {
		t.Fatalf("unexpected task writes: %#v", task.Writes)
	}
}

func TestSessionRejectsUnsafeDerivedTaskDependencies(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Derived(this: Component<any>) {
				const count = this.state.count;
				const label = "count-" + count;
				const unsafe = compute(count);
				const __fixtureTask15 = (_task: TaskContext = TaskContext.latest()) => consume(unsafe, label);
__fixtureTask15();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Tasks) != 1 {
		t.Fatalf("unexpected tasks: %#v", response.Analysis.Tasks)
	}
	task := response.Analysis.Tasks[0]
	if !equalStrings(task.ReactiveDependencies, []string{"unsafe", "label"}) {
		t.Fatalf("unexpected reactive dependencies: %#v", task.ReactiveDependencies)
	}
	if !containsString(
		task.Diagnostics,
		"error: task reads derived local unsafe, which cannot be safely reevaluated; capture an explicit reactive value or move the effectful expression into the task function body",
	) ||
		len(response.Diagnostics) != 1 ||
		response.Diagnostics[0].Code != "EXACT2001" {
		t.Fatalf(
			"unsafe derived dependency was not rejected: task=%#v response=%#v",
			task.Diagnostics,
			response.Diagnostics,
		)
	}
}

func TestSessionTreatsPeekAsExplicitTaskSnapshot(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare function peek<Value>(read: () => Value): Value
			function Page(props: { url: string }) {
				const parsed = parse(props.url);
				const request = peek(() => normalize(parsed));
				const __fixtureTask16 = (_task: TaskContext = TaskContext.latest()) => consume(request);
__fixtureTask16();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	request := assertReactiveBinding(
		t,
		response.Analysis.ReactiveBindings,
		"request",
		"snapshot",
		false,
	)
	if !equalStrings(request.Dependencies, []string{"parsed"}) {
		t.Fatalf("unexpected snapshot dependencies: %#v", request.Dependencies)
	}
	if len(response.Diagnostics) != 0 ||
		len(response.Analysis.Tasks) != 1 ||
		containsString(response.Analysis.Tasks[0].ReactiveDependencies, "request") {
		t.Fatalf(
			"explicit snapshot escaped into task activation: %#v %#v",
			response.Analysis.Tasks,
			response.Diagnostics,
		)
	}
}

func TestSessionDoesNotCaptureTaskLocalDerivedBindings(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "analyze",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Keyboard(this: Component<{ selected: number }>) {
				const __fixtureTask17 = ({ signal }: TaskContext = TaskContext.latest()) => {
					window.addEventListener("keydown", event => {
						const next = choose(this.state.selected, event.key);
						if (next !== this.state.selected) this.state.selected = next;
					}, { signal });
				};
__fixtureTask17();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 ||
		len(response.Analysis.Tasks) != 1 ||
		containsString(response.Analysis.Tasks[0].ReactiveDependencies, "next") {
		t.Fatalf("task-local derived binding escaped into activation: %#v %#v",
			response.Analysis.Tasks,
			response.Diagnostics,
		)
	}
}

func TestSessionKeepsEventHandlerFactoriesAsFunctions(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "view.tsx",
		Kind: "compile",
		Source: `
			declare function handler(name: string): (event: Event) => void;
			export function view() {
				return <input onInput={handler("value")} />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, `onInput: handler("value")`) ||
		strings.Contains(response.Code, `onInput: __exactExpression`) {
		t.Fatalf("event handler factory was emitted as a reactive value:\n%s", response.Code)
	}
}

func TestSessionLowersFunctionDefinedSetupTask(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			import { TaskContext } from "@exactjs/core";
			function Workspace(this: Component<{ revision: number }>) {
				async function persist(
					revision: number,
					task: TaskContext = TaskContext.client().latest()
				) {
					localStorage.setItem("revision", String(revision));
					await delay(task.signal);
				}
				persist(this.state.revision);
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 || len(response.Analysis.Tasks) != 1 {
		t.Fatalf(
			"function-defined task was not classified: %#v %#v",
			response.Analysis.Tasks,
			response.Diagnostics,
		)
	}
	task := response.Analysis.Tasks[0]
	if task.RequestedPlacement != "client" ||
		len(task.Dependencies) != 1 ||
		task.Dependencies[0].Path != "this.state.revision" {
		t.Fatalf("unexpected function-defined task analysis: %#v", task)
	}
	if !containsString(
		task.Diagnostics,
		"task placement explicitly requested as client",
	) {
		t.Fatalf("function-defined task omitted its placement explanation: %#v", task)
	}
	for _, expected := range []string{
		"activateTaskForHost as __exactActivateTask",
		"defineTask as __exactDefineTask",
		"__exactActivateTask(this, __exactDefineTask(",
		"this.reactive(() => this.state.revision)",
		"async (revision: number, task: TaskContext)",
		"__exactTaskAwait(task.signal, delay(task.signal))",
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("function-defined task output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionKeepsValueProducingSetupHelpersOutOfTaskAnalysis(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			declare const RouterContext: unknown;
			declare class Component<State> {
				state: State;
				getContext<T>(token: unknown): T;
			}
			type Source = {
				subscribe(callback: () => void): () => void;
			};
			function componentContext(component: Component<{}>) {
				return component.getContext(RouterContext);
			}
			function createController(source: Source) {
				const unsubscribe = source.subscribe(() => {});
				return {
					dispose: unsubscribe,
					load() {
						return fetch("/deferred");
					}
				};
			}
			function Router(this: Component<{ version: number }>, source: Source) {
				this.state.version = 0;
				void window.location.href;
				const context = componentContext(this);
				const controller = createController(source);
				void context;
				void controller;
				return () => <output>{this.state.version}</output>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 || len(response.Analysis.Tasks) != 0 {
		t.Fatalf(
			"value-producing setup helpers were classified as tasks: %#v %#v",
			response.Analysis.Tasks,
			response.Diagnostics,
		)
	}
	for _, expected := range []string{
		"const context = componentContext(this);",
		"const controller = createController(source);",
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("ordinary setup call is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, "__exactActivateTask") {
		t.Fatalf("ordinary setup calls received task lowering:\n%s", response.Code)
	}
}

func TestSessionTreatsDiscardedVoidSetupCallsAsTaskActivations(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			declare class Component<State> { state: State }
			function Panel(this: Component<{ value: string }>) {
				function persist(value: string) {
					localStorage.setItem("value", value);
				}
				void persist(this.state.value);
				return () => <output>{this.state.value}</output>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 || len(response.Analysis.Tasks) != 1 {
		t.Fatalf(
			"discarded setup activation was not classified as a task: %#v %#v",
			response.Analysis.Tasks,
			response.Diagnostics,
		)
	}
	if !response.Analysis.Tasks[0].FunctionDefined ||
		response.Analysis.Tasks[0].Placement != "client" {
		t.Fatalf("unexpected discarded setup task: %#v", response.Analysis.Tasks[0])
	}
}

func TestSessionCapturesReactiveTaskParameterDefaultsWithoutSubscribing(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Workspace(this: Component<{ revision: number; draft: string }>) {
				const persist = async (
					draft: string = this.state.draft,
					task: TaskContext = TaskContext.client().latest()
				) => {
					await save(this.state.revision, draft, task.signal);
				};
				persist();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 || len(response.Analysis.Tasks) != 1 {
		t.Fatalf(
			"captured task parameter was not classified: %#v %#v",
			response.Analysis.Tasks,
			response.Diagnostics,
		)
	}
	task := response.Analysis.Tasks[0]
	if len(task.Dependencies) != 1 ||
		task.Dependencies[0].Path != "this.state.revision" ||
		len(task.CapturedParameters) != 1 ||
		task.CapturedParameters[0] != 0 ||
		len(task.CapturedInputs) != 1 ||
		task.CapturedInputs[0].Parameter != 0 ||
		task.CapturedInputs[0].Path != "this.state.draft" {
		t.Fatalf("unexpected captured task analysis: %#v", task)
	}
	for _, expected := range []string{
		`captureArguments: (__exactTaskArgs: unknown[]) => {`,
		`const draft = __exactTaskArgs[1] === void 0 ? this.state.draft : __exactTaskArgs[1];`,
		`return [__exactTaskArgs[0], draft];`,
		`this.reactive(() => this.state.revision)`,
		`async (__exactDependency: number, draft: string, task: TaskContext)`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("captured task output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, "this.reactive(() => this.state.draft)") ||
		strings.Contains(response.Code, "draft: string = this.state.draft") {
		t.Fatalf("captured default remained a reactive dependency or body default:\n%s", response.Code)
	}
}

func TestSessionTransportsCapturedDefaultsForInvokedServerTasks(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Editor(this: Component<{ draft: string }>) {
				async function save(
					draft: string = this.state.draft,
					task: TaskContext = TaskContext.server().latest()
				) {
					await persist(draft, task.signal);
				}
				return () => <button onClick={() => save()}>Save</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 ||
		len(response.Analysis.Tasks) != 1 ||
		len(response.Analysis.Continuations) != 1 {
		t.Fatalf(
			"captured server task was not classified: %#v %#v",
			response.Analysis.Tasks,
			response.Diagnostics,
		)
	}
	continuation := response.Analysis.Continuations[0]
	if len(continuation.Activation.Dependencies) != 1 ||
		continuation.Activation.Dependencies[0].Source != "argument" {
		t.Fatalf("captured input was not authorized as a continuation argument: %#v", continuation)
	}
	for _, expected := range []string{
		`captureArguments: (__exactTaskArgs: unknown[]) => {`,
		`const draft = __exactTaskArgs[0] === void 0 ? this.state.draft : __exactTaskArgs[0];`,
		`return [draft];`,
		`__exactDispatchContinuation`,
		`save()`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("captured server task output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionLowersInvokedFunctionTaskThroughPublicABI(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Editor(this: Component<{ title: string }>) {
				async function save(
					title: string,
					task: TaskContext = TaskContext.server().latest()
				) {
					await persist(title, task.signal);
					return title;
				}
				return () => <button onClick={() => save(this.state.title)}>Save</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 || len(response.Analysis.Tasks) != 1 {
		t.Fatalf(
			"invoked function task was not classified: %#v %#v",
			response.Analysis.Tasks,
			response.Diagnostics,
		)
	}
	for _, expected := range []string{
		`bindTaskForHost as __exactBindTask`,
		`defineTask as __exactDefineTask`,
		`const save = __exactBindTask(this, __exactDefineTask(`,
		`placement: "server"`,
		`concurrency: "latest"`,
		`save(this.state.title)`,
		`__exactDispatchContinuation`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("invoked function task output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, "TaskContext.server().latest()") {
		t.Fatalf("task policy builder escaped into runtime output:\n%s", response.Code)
	}
}

func TestSessionSupportsAssignedAndExpressionTaskFunctions(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Editor(this: Component<{ title: string }>) {
				const assigned = async (
					title: string,
					task: TaskContext = TaskContext.client().queue()
				) => delay(title, task.signal);
				const expressed = async function persist(
					title: string,
					task: TaskContext = TaskContext.client().latest()
				) {
					localStorage.setItem("title", title);
					await delay(task.signal);
					return assigned(title);
				};
				return () => (
					<button onClick={() => Promise.all([
						assigned(this.state.title),
						expressed(this.state.title)
					])}>Save</button>
				);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 || len(response.Analysis.Tasks) != 2 {
		t.Fatalf(
			"assigned task functions were not classified: %#v %#v",
			response.Analysis.Tasks,
			response.Diagnostics,
		)
	}
	if strings.Count(response.Code, "__exactBindTask(this, __exactDefineTask(") != 2 ||
		strings.Contains(response.Code, "TaskContext.client()") ||
		!strings.Contains(response.Code, "__exactInvokeTask(task, assigned, title)") {
		t.Fatalf("assigned task functions were not lowered through the public ABI:\n%s", response.Code)
	}
}

func TestSessionEmitsEmptyInvocationArgumentsAsAnArray(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Feedback(this: Component<{ copied: boolean }>) {
				const clear = (
					_task: TaskContext = TaskContext.latest()
				) => {
					setTimeout(() => {
						this.state.copied = false;
					}, 100);
				};
				return () => <button onClick={() => clear()}>Clear</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 {
		t.Fatalf("parameterless task policy produced diagnostics: %#v", response.Diagnostics)
	}
	foundInvocation := false
	for _, continuation := range response.Analysis.Continuations {
		if continuation.Invocation == nil {
			continue
		}
		foundInvocation = true
		if continuation.Invocation.Arguments == nil {
			t.Fatalf("empty invocation arguments must serialize as an array: %#v", continuation)
		}
	}
	if !foundInvocation {
		t.Fatalf("parameterless invoked task did not produce invocation metadata: %#v", response.Analysis)
	}
}

func TestSessionTreatsNestedChildTaskCallsAsPlacementBoundaries(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `
			import { TaskContext } from "@exactjs/core";
			import { readFileSync } from "node:fs";
			declare class Component<State> { state: State }
			function Workspace(this: Component<{ ids: string[] }>) {
				function load(
					id: string,
					task: TaskContext = TaskContext.server().parallel()
				) {
					return readFileSync(id, "utf8");
				}
				async function refresh(
					task: TaskContext = TaskContext.client().latest()
				) {
					localStorage.setItem(
						"values",
						JSON.stringify(await Promise.all(this.state.ids.map(id => load(id))))
					);
				}
				refresh();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 || len(response.Analysis.Tasks) != 2 {
		t.Fatalf(
			"nested child tasks were not classified: %#v %#v",
			response.Analysis.Tasks,
			response.Diagnostics,
		)
	}
	for _, task := range response.Analysis.Tasks {
		if task.RequestedPlacement == "client" &&
			(task.ServerEffects || task.EnvironmentEffect == "mixed") {
			t.Fatalf("server child effects escaped into client parent: %#v", task)
		}
	}
	if strings.Contains(response.Code, "task: TaskContext, { signal:") {
		t.Fatalf(
			"server task work received a second synthetic context parameter:\n%s",
			response.Code,
		)
	}
	if !strings.Contains(response.Code, "(id: string, task: TaskContext) =>") {
		t.Fatalf("server task work did not retain one runtime task context:\n%s", response.Code)
	}
	if strings.Contains(response.Code, "localStorage") {
		t.Fatalf("client parent work escaped into the server artifact:\n%s", response.Code)
	}
}

func TestSessionOwnsSyntheticTaskStatusDiagnostics(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:          "component.tsx",
		Kind:        "analyze",
		Diagnostics: "semantic",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Editor(this: Component<{ title: string }>) {
				async function save(
					title: string,
					task: TaskContext = TaskContext.client().latest()
				) {
					await persist(title, task.signal);
				}
				return () => <button
					disabled={save.pending}
					onClick={() => save(this.state.title)}
				>Save</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == "TS2339" &&
			strings.Contains(diagnostic.Message, "pending") {
			t.Fatalf("raw TypeScript rejected synthetic task status: %#v", response.Diagnostics)
		}
	}
}

func TestSessionBuildsContinuationAndResumptionContracts(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			function Loader(this: Component<{ count: number }>) {
				const __fixtureTask22 = async (_task: TaskContext = TaskContext.server()) => {
					this.state.count++;
				};
__fixtureTask22();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Tasks) != 1 ||
		len(response.Analysis.Continuations) != 1 ||
		len(response.Analysis.Resumptions) != 1 {
		t.Fatalf("unexpected continuation analysis: %#v", response.Analysis)
	}
	task := response.Analysis.Tasks[0]
	component := response.Analysis.Components[0]
	continuation := response.Analysis.Continuations[0]
	if continuation.ID != task.ID ||
		continuation.TaskID != task.ID ||
		continuation.ComponentID != component.ID ||
		continuation.Placement != "server" ||
		continuation.Cancellation != "abort-signal" ||
		continuation.Ownership.ComponentID != component.ID ||
		continuation.Ownership.Lifetime != "component" ||
		len(continuation.Activation.StateReads) != 1 ||
		continuation.Activation.StateReads[0].Path != "count" ||
		len(continuation.Activation.Dependencies) != 0 ||
		len(continuation.Effects.StateWrites) != 1 ||
		continuation.Effects.StateWrites[0].Path != "count" {
		t.Fatalf("unexpected continuation contract: %#v", continuation)
	}
	resumption := response.Analysis.Resumptions[0]
	if resumption.ComponentID != component.ID ||
		!equalStrings(resumption.Client.StatePaths, []string{"count"}) {
		t.Fatalf("unexpected resumption contract: %#v", resumption)
	}
}

func TestSessionTagsServerContinuationWorkAndOmitsItFromClient(t *testing.T) {
	source := `
			import { TaskContext } from "@exactjs/core";
		declare class Component<State> { state: State }
		export function Loader(this: Component<{ count: number }>) {
			const __fixtureTask7 = async (_task: TaskContext = TaskContext.server()) => {
				this.state.count++;
			};
__fixtureTask7();
			return () => <output />;
		}
	`
	server := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Source: source,
		Target: TargetServer,
	})
	if server.Error != "" {
		t.Fatal(server.Error)
	}
	if len(server.Analysis.Tasks) != 1 {
		t.Fatalf("unexpected server tasks: %#v", server.Analysis.Tasks)
	}
	taskID := server.Analysis.Tasks[0].ID
	for _, expected := range []string{
		`markComponentContinuationTask as __exactContinuationTask`,
		`__exactActivateTask(this, __exactDefineTask(`,
		`__exactContinuationTask("` + taskID + `", async`,
	} {
		if !strings.Contains(server.Code, expected) {
			t.Fatalf(
				"server continuation output is missing %q:\n%s",
				expected,
				server.Code,
			)
		}
	}
	client := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Source: source,
		Target: TargetClient,
	})
	if client.Error != "" {
		t.Fatal(client.Error)
	}
	if !strings.Contains(client.Code, "export const Loader") ||
		!strings.Contains(client.Code, "createServerBoundary") ||
		strings.Contains(client.Code, "this.state.count++") {
		t.Fatalf(
			"server-only task implementation escaped into the client artifact:\n%s",
			client.Code,
		)
	}
}

func TestSessionEmitsClientDispatchStubForIsomorphicContinuation(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			export function Loader(this: Component<{ count: number }>) {
				const __fixtureTask23 = (_task: TaskContext = TaskContext.client()) => console.log("client");
__fixtureTask23();
				const __fixtureTask24 = async (_task: TaskContext = TaskContext.server()) => {
					this.state.count++;
				};
__fixtureTask24();
				return () => <output>Go</output>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Tasks) != 2 {
		t.Fatalf("unexpected tasks: %#v", response.Analysis.Tasks)
	}
	taskID := ""
	for _, task := range response.Analysis.Tasks {
		if task.Placement == "server" {
			taskID = task.ID
			break
		}
	}
	if taskID == "" {
		t.Fatalf("missing server continuation task: %#v", response.Analysis.Tasks)
	}
	for _, expected := range []string{
		`markComponentContinuationTask as __exactContinuationTask`,
		`dispatchComponentContinuation as __exactDispatchContinuation`,
		`__exactActivateTask(this, __exactDefineTask(`,
		`__exactContinuationTask("` + taskID,
		`(...__exactTaskArgs: any[]) => {`,
		`return __exactDispatchContinuation(this as any, "` +
			taskID +
			`", __exactTaskArgs, __exactTaskContext.signal, [], __exactTaskContext.generation);`,
		`const __exactImplementation_Loader_1 = function Loader(`,
		`export const Loader =`,
		`Object.assign(__exactImplementation_Loader_1, {`,
		`continuations: [`,
		`id: "` + taskID + `"`,
		`stateWrites: [`,
		`statePaths: [`,
		`"count"`,
		`role: "client"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf(
				"client continuation dispatch is missing %q:\n%s",
				expected,
				response.Code,
			)
		}
	}
	if strings.Contains(response.Code, "this.state.count++") {
		t.Fatalf(
			"server continuation implementation escaped into the client artifact:\n%s",
			response.Code,
		)
	}
}

func TestSessionEmitsServerContinuationExecutorContract(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Target: TargetServer,
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			export function Loader(this: Component<{ count: number }>) {
				const __fixtureTask25 = async (_task: TaskContext = TaskContext.server()) => {
					this.state.count++;
				};
__fixtureTask25();
				return () =>
					<button onClick={() => alert(1)}>Go</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Continuations) != 1 {
		t.Fatalf(
			"unexpected continuations: %#v",
			response.Analysis.Continuations,
		)
	}
	continuation := response.Analysis.Continuations[0]
	for _, expected := range []string{
		`role: "executor"`,
		`executors: [`,
		`id: "` + continuation.ID + `"`,
		`componentId: "` + continuation.ComponentID + `"`,
		`execute: async (__exactActivation_1: any, __exactExecution_1: any) =>`,
		`const __exactComponent_1 = { state: __exactActivation_1.state }`,
		`await (async (_task: TaskContext) =>`,
		`})(__exactExecution_1.task)`,
		`__exactUpdateResult(__exactComponent_1.state, ["count"]`,
		`return { state: __exactComponent_1.state, contexts: __exactContextWrites_1 }`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf(
				"server continuation executor is missing %q:\n%s",
				expected,
				response.Code,
			)
		}
	}
	if strings.Contains(response.Code, "__exactStageTaskMutation") {
		t.Fatalf(
			"server executor retained client generation staging:\n%s",
			response.Code,
		)
	}
}

func TestSessionEmitsTypedInvokedServerTaskArtifactsWithRenderImports(t *testing.T) {
	root := t.TempDir()
	helper := filepath.Join(root, "view.tsx")
	if err := os.WriteFile(
		helper,
		[]byte(`
			export function renderWorkspace() {
				return "workspace";
			}
		`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(root, "workspace.tsx")
	source := `
		import { TaskContext } from "@exactjs/core";
		import { renderWorkspace } from "./view.js";
		export function Workspace() {
			async function load(
				id: string,
				_task: TaskContext = TaskContext.server()
			) {
				return Promise.resolve(id);
			}
			return () => <button onClick={() => load("workspace")}>{renderWorkspace()}</button>;
		}
	`
	session := NewSession()
	client := session.Execute(Request{
		ID: entry, Root: root, Kind: "compile", Target: TargetClient, Source: source,
	})
	if client.Error != "" {
		t.Fatal(client.Error)
	}
	for _, expected := range []string{
		`const load = __exactBindTask(this, __exactDefineTask(`,
		`__exactDispatchContinuation(this as any, "`,
	} {
		if !strings.Contains(client.Code, expected) {
			t.Fatalf("client invoked task artifact is missing %q:\n%s", expected, client.Code)
		}
	}

	server := session.Execute(Request{
		ID: entry, Root: root, Kind: "compile", Target: TargetServer, Source: source,
	})
	if server.Error != "" {
		t.Fatal(server.Error)
	}
	for _, expected := range []string{
		`import { renderWorkspace } from "./view.js"`,
		`markComponentContinuationTask as __exactContinuationTask`,
		`__exactExecution_1.task`,
		`value: __exactTaskResult_1`,
	} {
		if !strings.Contains(server.Code, expected) {
			t.Fatalf("server invoked task artifact is missing %q:\n%s", expected, server.Code)
		}
	}
	component := findComponent(t, server.Analysis.Components, "Workspace")
	if component.EnvironmentEffect != "server" {
		t.Fatalf("server task effect was omitted from component placement: %#v", component)
	}
}

func TestSessionPartitionsContinuationContextsByResidency(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "analyze",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> {
				state: State;
				getContext(token: unknown): any;
				setContext(token: unknown, value: unknown): void;
			}
			declare function createContext<T>(
				value: T,
				options?: { keep?: "shared" | "server" }
			): unknown;
			const PublicConfig = createContext(
				{ domain: "public" },
				{ keep: "shared" }
			);
			const PublicStatus = createContext(
				{ ready: false },
				{ keep: "shared" }
			);
			const ServerResource = createContext(
				{ domain: "private" },
				{ keep: "server" }
			);
			export function Loader(
				this: Component<{ value: string }>
			) {
				const __fixtureTask26 = async (_task: TaskContext = TaskContext.server()) => {
					const config = this.getContext(PublicConfig);
					const resource = this.getContext(ServerResource);
					this.state.value = config.domain + resource.domain;
					this.setContext(PublicStatus, { ready: true });
					this.setContext(ServerResource, { domain: "changed" });
				};
				return () =>
					<button onClick={() => __fixtureTask26()}>{this.state.value}</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Continuations) != 1 {
		t.Fatalf(
			"unexpected continuations: %#v",
			response.Analysis.Continuations,
		)
	}
	continuation := response.Analysis.Continuations[0]
	if len(response.Analysis.Symbols) != 3 ||
		len(response.Analysis.Boundaries) != 1 {
		t.Fatalf(
			"split artifact records were not materialized: symbols=%#v boundaries=%#v",
			response.Analysis.Symbols,
			response.Analysis.Boundaries,
		)
	}
	boundary := response.Analysis.Boundaries[0]
	if boundary.OwnerComponentID != continuation.ComponentID ||
		boundary.Kind != "client-island" ||
		!containsString(continuation.Effects.Boundaries, boundary.ID) {
		t.Fatalf(
			"continuation did not inherit its component boundary: continuation=%#v boundary=%#v",
			continuation,
			boundary,
		)
	}
	if !containsContextEffect(
		continuation.Activation.PublicContexts,
		"PublicConfig",
		"read",
	) || !containsContextEffect(
		continuation.Activation.ServerContexts,
		"ServerResource",
		"read",
	) || !containsContextEffect(
		continuation.Effects.ContextWrites,
		"PublicStatus",
		"write",
	) || !containsContextEffect(
		continuation.Effects.ServerContextWrites,
		"ServerResource",
		"write",
	) {
		t.Fatalf("continuation contexts were not partitioned: %#v", continuation)
	}
}

func TestSessionInfersAndValidatesTaskEnvironmentPlacement(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			import { readFileSync } from "node:fs";
			function Environment() {
				const __fixtureTask27 = (_task: TaskContext = TaskContext.server()) => document.title;
__fixtureTask27();
				const __fixtureTask28 = (_task: TaskContext = TaskContext.client()) => readFileSync("input.txt");
__fixtureTask28();
				const __fixtureTask29 = (_task: TaskContext = TaskContext.latest()) => {
					document.title;
					readFileSync("input.txt");
				};
__fixtureTask29();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	tasks := response.Analysis.Tasks
	if len(tasks) != 3 {
		t.Fatalf("received %d tasks, expected 3: %#v", len(tasks), tasks)
	}
	if !tasks[0].BrowserEffects || tasks[0].ServerEffects ||
		tasks[0].Placement != "server" {
		t.Fatalf("unexpected forced server task: %#v", tasks[0])
	}
	if tasks[1].BrowserEffects || !tasks[1].ServerEffects ||
		tasks[1].Placement != "client" {
		t.Fatalf("unexpected forced client task: %#v", tasks[1])
	}
	if !tasks[2].BrowserEffects || !tasks[2].ServerEffects ||
		tasks[2].Placement != "unknown" ||
		tasks[2].EnvironmentEffect != "mixed" {
		t.Fatalf("unexpected mixed task: %#v", tasks[2])
	}
	if len(response.Diagnostics) != 3 {
		t.Fatalf("received %d placement diagnostics, expected 3: %#v", len(response.Diagnostics), response.Diagnostics)
	}
}

func TestSessionPropagatesCallableStateContextAndEnvironmentEffects(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			import { readFileSync } from "node:fs";
			declare class Component<State> {
				state: State;
				getContext(token: unknown): unknown;
				setContext(token: unknown, value: unknown): void;
				task(work: () => void): void;
			}
			const leaf = function(this: Component<any>) {
				const count = this.state.count;
				this.setContext(Status.Token, count);
				readFileSync("status.txt");
			};
			function middle(this: Component<any>) {
				leaf.call(this);
			}
			function Panel(this: Component<any>) {
				const alias = middle.bind(this);
				const __fixtureTask30 = (_task: TaskContext = TaskContext.latest()) => alias();
__fixtureTask30();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	leaf := findCallable(t, response.Analysis.Callables, "leaf")
	if leaf.DirectEffect != "server" ||
		!containsContextEffect(leaf.Contexts, "Status.Token", "write") ||
		len(leaf.StateReads) != 1 || leaf.StateReads[0].Path != "count" {
		t.Fatalf("unexpected leaf effects: %#v", leaf)
	}
	middle := findCallable(t, response.Analysis.Callables, "middle")
	if middle.Effect != "server" ||
		!containsContextEffect(middle.Contexts, "Status.Token", "write") ||
		len(middle.StateReads) != 1 || middle.StateReads[0].Path != "count" {
		t.Fatalf("callable effects did not propagate: %#v", middle)
	}
	if len(response.Analysis.Tasks) < 1 {
		t.Fatalf("unexpected tasks: %#v", response.Analysis.Tasks)
	}
	var task Task
	for _, candidate := range response.Analysis.Tasks {
		if candidate.Component == "Panel" {
			task = candidate
			break
		}
	}
	if task.Component == "" {
		t.Fatalf("missing Panel task: %#v", response.Analysis.Tasks)
	}
	if task.EnvironmentEffect != "server" || task.Placement != "server" ||
		!containsContextEffect(task.Contexts, "Status.Token", "write") ||
		len(task.Reads) != 1 || task.Reads[0].Path != "count" {
		t.Fatalf("task did not consume its completed callable summary: %#v", task)
	}
}

func TestSessionTreatsContextValueMethodsAsContextEffects(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			declare const BoardContext: unknown;
			declare class Component<State> {
				getContext<T>(token: unknown): T;
				onUnmount(handler: () => void): void;
			}
			function Panel(this: Component<{}>) {
				const board = this.getContext<{ clear(): void }>(BoardContext);
				const cleanup = () => board.clear();
				this.onUnmount(cleanup);
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	cleanup := findCallable(t, response.Analysis.Callables, "cleanup")
	if cleanup.Effect != "neutral" ||
		!containsContextEffect(cleanup.Contexts, "BoardContext", "read") {
		t.Fatalf("context value method remained opaque: %#v", cleanup)
	}
}

func TestSessionKeepsShadowedCallableSymbolsSeparate(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			function browserHelper() { return document.title; }
			function serverOwner() {
				function browserHelper() { return 1; }
				return browserHelper();
			}
			function Panel() {
				const __fixtureTask31 = (_task: TaskContext = TaskContext.latest()) => serverOwner();
__fixtureTask31();
				return () => <output>{browserHelper()}</output>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	serverOwner := findCallable(t, response.Analysis.Callables, "serverOwner")
	if serverOwner.Effect != "neutral" {
		t.Fatalf("shadowed helper inherited the outer browser effect: %#v", serverOwner)
	}
	if len(response.Analysis.Tasks) != 1 ||
		response.Analysis.Tasks[0].EnvironmentEffect != "neutral" {
		t.Fatalf("task inherited an unrelated shadowed effect: %#v", response.Analysis.Tasks)
	}
}

func TestSessionConvergesRecursiveCallableEffects(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			function left(value: number): number {
				if (value === 0) return document.title.length;
				return right(value - 1);
			}
			function right(value: number): number {
				return left(value);
			}
			export const result = left(1);
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	left := findCallable(t, response.Analysis.Callables, "left")
	right := findCallable(t, response.Analysis.Callables, "right")
	if left.Effect != "browser" || right.Effect != "browser" {
		t.Fatalf("recursive effects did not converge: left=%#v right=%#v", left, right)
	}
	if len(left.EffectSources) != 1 || len(right.EffectSources) != 1 ||
		len(left.EffectSources[0].Path) > 3 || len(right.EffectSources[0].Path) > 3 {
		t.Fatalf("recursive diagnostic paths grew after convergence: left=%#v right=%#v", left, right)
	}
}

func TestSessionCollectsOwnedTaskResourcesAndSignals(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare const store: {
				subscribe(callback: () => void): { unsubscribe(): void }
			};
			interface DisposableResource { dispose(): void }
			declare function disposableApi(): /** @exact own */ DisposableResource;
			declare function optionsApi(value: string, options?: { signal?: AbortSignal }): void;
			declare function directApi(value: string, signal?: AbortSignal): void;
			function Panel() {
				const __fixtureTask32 = (_task: TaskContext = TaskContext.client()) => {
					setTimeout(() => {}, 10);
					setInterval(() => {}, 20);
					requestAnimationFrame(() => {});
					requestIdleCallback(() => {});
					fetch("/items");
					new ResizeObserver(() => {});
					const socket = new WebSocket("/events");
					const worker = new Worker("worker.js");
					const subscription = store.subscribe(() => {});
					const disposable = disposableApi();
					optionsApi("ready");
					directApi("ready");
					window.addEventListener("resize", () => {});
					void socket.readyState;
					worker.postMessage("ready");
					void subscription;
					void disposable;
				};
__fixtureTask32();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Tasks) != 1 {
		t.Fatalf("unexpected tasks: %#v", response.Analysis.Tasks)
	}
	task := response.Analysis.Tasks[0]
	for _, kind := range []string{
		"timeout", "interval", "animation-frame", "idle-callback", "fetch", "observer",
	} {
		if !containsTaskResource(task.Resources, kind, "") {
			t.Fatalf("missing %s resource: %#v", kind, task.Resources)
		}
	}
	if !containsTaskResource(task.Resources, "owned", "close") ||
		!containsTaskResource(task.Resources, "owned", "terminate") ||
		!containsTaskResource(task.Resources, "owned", "unsubscribe") ||
		!containsTaskResourceDescription(task.Resources, "DisposableResource") {
		t.Fatalf("missing owned task resources: %#v", task.Resources)
	}
	if !containsSignalCall(task.SignalCalls, 1, "options") ||
		!containsSignalCall(task.SignalCalls, 2, "options") ||
		!containsSignalCall(task.SignalCalls, 1, "direct") {
		t.Fatalf("missing task signal calls: %#v", task.SignalCalls)
	}
	for _, expected := range []string{
		`taskTimeout as __exactTaskTimeout`,
		`taskFetch as __exactTaskFetch`,
		`taskObserver as __exactTaskObserver`,
		`ownTaskResource as __exactTaskResource`,
		`withAbortSignal as __exactAbortOptions`,
		`withTaskSignal as __exactTaskOptionsSignal`,
		`combineTaskSignal as __exactTaskCombinedSignal`,
		`_task: TaskContext`,
		`__exactTaskTimeout(_task.signal, () => {`,
		`__exactTaskFetch(_task.signal, fetch, "/items")`,
		`__exactTaskObserver(_task.signal, new ResizeObserver(() => {`,
		`__exactTaskResource(_task.signal, new WebSocket("/events"), "close")`,
		`optionsApi("ready", __exactTaskOptionsSignal(undefined, _task.signal))`,
		`directApi("ready", __exactTaskCombinedSignal(_task.signal))`,
		`window.addEventListener("resize", () => { }, __exactAbortOptions(undefined, _task.signal))`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("native task resource output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionDoesNotClaimEventHandlerResourcesAsSetupOwned(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			export function CodeBlock(this: Component<{ copied: boolean }>) {
				let copiedTimer: number | undefined;
				const copy = async () => {
					this.state.copied = true;
					copiedTimer = window.setTimeout(() => {
						this.state.copied = false;
					}, 1400);
				};
				return () => <button onClick={() => void copy()}>Copy</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 {
		t.Fatalf(
			"event-handler resource produced setup diagnostics: %#v; tasks: %#v",
			response.Diagnostics,
			response.Analysis.Tasks,
		)
	}
}

func TestSessionUsesExplicitPlacementToConstrainOpaqueComponentCalls(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "analyze",
		Source: `
			declare const registry: { register(value: unknown): boolean };
			/** @exact client */
			export function Field() {
				const registered = registry.register({});
				return () => <div>{registered}</div>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	field := findComponent(t, response.Analysis.Components, "Field")
	if field.Placement != "client" || field.EnvironmentEffect != "browser" {
		t.Fatalf("explicit client placement did not constrain opaque call: %#v", field)
	}
	if len(field.Diagnostics) != 0 {
		t.Fatalf("constrained opaque call produced diagnostics: %#v", field.Diagnostics)
	}
}

func TestSessionPreservesKnownClientPlacementThroughOpaqueRenderCalls(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "analyze",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare function checked(value: unknown): boolean;
			function renderPanel(value: unknown) {
				return <button onClick={() => {}}>{checked(value) ? "yes" : "no"}</button>;
			}
			export function Panel(this: Component<{}>, props: { value: unknown }) {
				const __fixtureTask33 = (_task: TaskContext = TaskContext.client()) => {};
__fixtureTask33();
				return () => renderPanel(props.value);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	panel := findComponent(t, response.Analysis.Components, "Panel")
	if panel.Placement != "client" || panel.EnvironmentEffect != "browser" {
		t.Fatalf("opaque render call erased known client placement: %#v", panel)
	}
}

func TestSessionBrandsBrowserComponentWithOpaqueSetupCalls(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			declare class Component<State> { state: State }
			declare function tokenize(source: string): string[];
			export function CodeBlock(
				this: Component<{ copied: boolean }>,
				props: { source: string },
			) {
				void tokenize(props.source);
				const copy = () => navigator.clipboard.writeText(props.source);
				return () => <button onClick={() => void copy()}>Copy</button>;
			}
		`,
		JSXInterop: &JSXInterop{
			AdapterModule: "@exactjs/react-compat/exact",
			AdapterExport: "adaptReactComponent",
		},
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) != 0 {
		t.Fatalf("unexpected diagnostics: %#v", response.Diagnostics)
	}
	component := findComponent(t, response.Analysis.Components, "CodeBlock")
	if component.Placement != "client" ||
		component.EnvironmentEffect != "browser" ||
		strings.Contains(strings.Join(component.Diagnostics, "\n"), "opaque call") ||
		!strings.Contains(response.Code, `[Symbol.for("@exactjs/component")]: "`+component.ID+`"`) {
		t.Fatalf(
			"opaque setup call erased the browser component contract: %#v\n%s",
			component,
			response.Code,
		)
	}
}

func TestSessionDoesNotScheduleTaskFromItsOwnUpdateTarget(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			export function Counter(this: Component<{ revision: number }>) {
				const __fixtureTask34 = (_task: TaskContext = TaskContext.client()) => { this.state.revision++; };
__fixtureTask34();
				return () => <output>{this.state.revision}</output>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Tasks) != 1 ||
		len(response.Analysis.Tasks[0].Reads) != 1 ||
		len(response.Analysis.Tasks[0].Writes) != 1 ||
		len(response.Analysis.Tasks[0].Dependencies) != 0 ||
		strings.Contains(response.Code, "this.reactive(() => this.state.revision)") {
		t.Fatalf(
			"task mutation became a self-invalidating dependency: %#v\n%s",
			response.Analysis.Tasks,
			response.Code,
		)
	}
}

func TestSessionTreatsCoreRuntimeCallsAsPlacementNeutral(t *testing.T) {
	root := t.TempDir()
	coreRoot := filepath.Join(root, "node_modules", "@exactjs", "core")
	if err := os.MkdirAll(coreRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(coreRoot, "package.json"),
		[]byte(`{"name":"@exactjs/core","types":"./index.d.ts"}`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(coreRoot, "index.d.ts"),
		[]byte(`export declare function isExactComponent(value: unknown): boolean;`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(root, "component.tsx")
	response := NewSession().Execute(Request{
		ID:   entry,
		Root: root,
		Kind: "analyze",
		Source: `
			import { isExactComponent } from "@exactjs/core";
			export function ReactHost(props: { component: unknown }) {
				const exact = isExactComponent(props.component);
				return () => <div>{exact}</div>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	host := findComponent(t, response.Analysis.Components, "ReactHost")
	if len(host.Diagnostics) != 0 {
		t.Fatalf("neutral core call produced diagnostics: %#v", host.Diagnostics)
	}
}

func TestSessionRetainsResolvedRecursiveCallsWhenMergingProjectEffects(t *testing.T) {
	root := t.TempDir()
	helper := filepath.Join(root, "helper.ts")
	if err := os.WriteFile(
		helper,
		[]byte(`
			export function describe(value: unknown): string {
				if (typeof value === "object" && value)
					return "Object(" + describe(String(value)) + ")";
				return String(value);
			}
		`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(root, "component.tsx")
	response := NewSession().Execute(Request{
		ID:   entry,
		Root: root,
		Kind: "analyze",
		Source: `
			import { describe } from "./helper.js";
			export function Host(props: { value: unknown }) {
				const label = describe(props.value);
				return () => <div>{label}</div>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	host := findComponent(t, response.Analysis.Components, "Host")
	if len(host.Diagnostics) != 0 {
		t.Fatalf("resolved recursive helper produced diagnostics: %#v", host.Diagnostics)
	}
}

func TestSessionLowersKeyedMapsInsideMaterializedReactiveClosures(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			interface Item {
				/** @exact key */
				id: string;
				visible: boolean;
			}
			export function List(props: { items: Item[] }) {
				const visible = props.items.filter((item) => item.visible);
				return () => <ul>{visible.map((item) => <li>{item.id}</li>)}</ul>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, "this.map(") {
		t.Fatalf("keyed map was not lowered inside reactive closure: %s", response.Code)
	}
}

func TestSessionLowersKeyedMapsDeclaredInImportedTypes(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	modelFile := filepath.Join(root, "model.ts")
	componentFile := filepath.Join(root, "component.tsx")
	for filename, source := range map[string]string{
		configFile: `{"compilerOptions":{"module":"esnext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		modelFile: `export interface Item {
			/** @exact key */
			id: string;
			visible: boolean;
		}`,
		componentFile: `import type { Item } from "./model.js";
			export function List(props: { items: Item[] }) {
				const visible = props.items.filter((item) => item.visible);
				const copy = () => props.items.map((item) => ({ ...item }));
				return () => <ul>{visible.map((item) => <li>{item.id}</li>)}</ul>;
			}`,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	response := NewSession().Execute(Request{
		ID: componentFile, Kind: "compile", Target: TargetClient,
		Source: `import type { Item } from "./model.js";
			export function List(props: { items: Item[] }) {
				const visible = props.items.filter((item) => item.visible);
				const copy = () => props.items.map((item) => ({ ...item }));
				return () => <ul>{visible.map((item) => <li>{item.id}</li>)}</ul>;
			}`,
		ConfigFile: configFile,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, "this.map(") {
		t.Fatalf("imported keyed item type was not lowered: %s", response.Code)
	}
	if strings.Contains(response.Code, "const copy = () => this.map(") {
		t.Fatalf("ordinary data mapping was lowered as a rendered list: %s", response.Code)
	}
}

func TestSessionAvoidsReactiveWrappersInsideDeclarativeModuleCollections(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			const rows = [{ id: "first" }] as const;
			export function List() {
				return () => <ul>{rows.map((row) => <li title={row.id}>{row.id}</li>)}</ul>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, "rows.map((row) => __exactRenderProgram") ||
		!strings.Contains(response.Code, "[() => row.id, () => row.id]") ||
		!strings.Contains(response.Code, "title: row.id }, row.id") {
		t.Fatalf("declarative collection did not preserve direct values: %s", response.Code)
	}
	if strings.Contains(response.Code, "__exactExpression(() => row.id)") ||
		strings.Contains(response.Code, "__exactDynamic(() => row.id") {
		t.Fatalf("declarative collection allocated reactive wrappers: %s", response.Code)
	}
}

func TestSessionReportsAuthoredLocationsAfterSourceNormalization(t *testing.T) {
	source := `
		export function Card(props: { title: string }) {
			return () => <article {title}>{props.title}</article>;
		}
	`
	response := NewSession().Execute(Request{
		ID:        "component.tsx",
		Kind:      "compile",
		Source:    source,
		SourceMap: true,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.JSX) != 1 {
		t.Fatalf("unexpected JSX analysis: %#v", response.Analysis.JSX)
	}
	// TypeScript node positions include the trivia immediately before JSX.
	expectedStart := strings.Index(source, "<article") - 1
	if response.Analysis.JSX[0].Start != expectedStart {
		t.Fatalf(
			"JSX start points into normalized source: got %d, expected %d",
			response.Analysis.JSX[0].Start,
			expectedStart,
		)
	}
	if response.SourceMap == nil ||
		len(response.SourceMap.SourcesContent) != 1 ||
		response.SourceMap.SourcesContent[0] == nil ||
		*response.SourceMap.SourcesContent[0] != source {
		t.Fatalf("source map did not retain authored source: %#v", response.SourceMap)
	}
}

func TestSessionLowersTaskAwaitWithGenerationSignal(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			function Panel() {
				const __fixtureTask35 = async (_task: TaskContext = TaskContext.latest()) => {
					const value = await loadValue();
					consume(value);
				};
__fixtureTask35();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`taskAwait as __exactTaskAwait`,
		`async (_task: TaskContext) =>`,
		`await __exactTaskAwait(_task.signal, loadValue())`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("native task await output is missing %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionRejectsEscapingAndOmitsExplicitlyDisposedTaskResources(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare const store: {
				subscribe(callback: () => void): () => void
			};
			function Panel() {
				const __fixtureTask36 = (_task: TaskContext = TaskContext.client()) => {
					this.state.socket = new WebSocket("/escape");
				};
__fixtureTask36();
				const __fixtureTask37 = (_task: TaskContext = TaskContext.client()) => {
					const socket = new WebSocket("/explicit");
					return () => socket.close();
				};
__fixtureTask37();
				const observe = (task: TaskContext = TaskContext.client()) => {
					task.cleanup(store.subscribe(() => {}));
				};
				observe();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Tasks) != 3 {
		t.Fatalf("unexpected tasks: %#v", response.Analysis.Tasks)
	}
	if len(response.Analysis.Tasks[0].Diagnostics) == 0 ||
		len(response.Analysis.Tasks[0].Resources) != 0 {
		t.Fatalf("escaping resource was not rejected: %#v", response.Analysis.Tasks[0])
	}
	if !containsString(
		response.Analysis.Tasks[0].Diagnostics,
		"error: task-owned WebSocket escapes its task generation; keep the resource local or move it to a deliberately longer-lived owner",
	) {
		t.Fatalf(
			"escaping resource diagnostic did not describe the current ownership model: %#v",
			response.Analysis.Tasks[0].Diagnostics,
		)
	}
	if len(response.Analysis.Tasks[1].Resources) != 0 {
		t.Fatalf("explicit cleanup was not respected: %#v", response.Analysis.Tasks[1])
	}
	for _, diagnostic := range response.Analysis.Tasks[1].Diagnostics {
		if strings.HasPrefix(diagnostic, "error:") {
			t.Fatalf("explicit cleanup was not respected: %#v", response.Analysis.Tasks[1])
		}
	}
	if len(response.Analysis.Tasks[2].Resources) != 0 {
		t.Fatalf("TaskContext cleanup was not respected: %#v", response.Analysis.Tasks[2])
	}
	for _, diagnostic := range response.Analysis.Tasks[2].Diagnostics {
		if strings.HasPrefix(diagnostic, "error:") {
			t.Fatalf("TaskContext cleanup was not respected: %#v", response.Analysis.Tasks[2])
		}
	}
}

func TestSessionAnalyzesComponentPlacementIslandsAndContexts(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			import { readFileSync } from "node:fs";
			function Mixed() {
				const __fixtureTask38 = (_task: TaskContext = TaskContext.client()) => window.addEventListener("resize", () => {});
__fixtureTask38();
				this.getContext(Theme);
				this.setContext(this.state.token, "value");
				const server = readFileSync;
				return () => <section onClick={() => window.scrollTo(0, 0)}>
					<button onClick={() => {}}>nested</button>
				</section>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Components) != 1 {
		t.Fatalf("unexpected components: %#v", response.Analysis.Components)
	}
	component := response.Analysis.Components[0]
	if component.Placement != "isomorphic" ||
		component.EnvironmentEffect != "server" ||
		component.ClientIslandCount != 1 ||
		len(component.ArtifactTargets) != 2 ||
		component.ArtifactTargets[0] != "client" ||
		component.ArtifactTargets[1] != "server" {
		t.Fatalf("unexpected component placement: %#v", component)
	}
	if !containsString(component.SplitBoundaries, "event-handler") ||
		!containsString(component.SplitBoundaries, "browser:window") ||
		!containsString(component.SplitBoundaries, "server-import:readFileSync") {
		t.Fatalf("missing component split boundaries: %#v", component.SplitBoundaries)
	}
	if !containsContextEffect(component.Contexts, "Theme", "read") ||
		!containsContextEffect(component.Contexts, "this.state.token", "write") {
		t.Fatalf("missing component context effects: %#v", component.Contexts)
	}
}

func TestSessionEmitsEnhancementContextTokenContracts(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "enhancement-contexts.tsx",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import { PhysicsContext, WorldContext } from "./contexts.js";
			function readOptionalPhysics(this: Component<{}>) {
				if (!this.hasContext(PhysicsContext)) return;
				this.getContext(PhysicsContext);
			}
			export function Provider(this: Component<{}>) {
				this.setContext(PhysicsContext, { ready: true });
				return () => <section />;
			}
			export function Consumer(this: Component<{}>) {
				readOptionalPhysics.call(this);
				this.getContext(WorldContext);
				return () => <button />;
			}
				export function DynamicToken(this: Component<{ token: unknown }>) {
				this.setContext(this.state.token, "value");
				return () => <output />;
			}
			export function LateProvider(this: Component<{}>) {
				this.setContext(LateContext, "value");
				return () => <aside />;
			}
			const LateContext = { id: Symbol("late") };
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	provider := findComponent(t, response.Analysis.Components, "Provider")
	if !containsString(provider.EnhancementContexts.Provides, "PhysicsContext") ||
		len(provider.EnhancementContexts.Requires) != 0 ||
		len(provider.EnhancementContexts.OptionallyConsumes) != 0 {
		t.Fatalf("unexpected provider enhancement contexts: %#v", provider.EnhancementContexts)
	}
	consumer := findComponent(t, response.Analysis.Components, "Consumer")
	if !containsString(consumer.EnhancementContexts.Requires, "WorldContext") ||
		!containsString(consumer.EnhancementContexts.OptionallyConsumes, "PhysicsContext") ||
		containsString(consumer.EnhancementContexts.Requires, "PhysicsContext") ||
		!containsContextEffect(consumer.Contexts, "PhysicsContext", "probe") {
		t.Fatalf("unexpected consumer enhancement contexts: %#v", consumer.EnhancementContexts)
	}
	dynamic := findComponent(t, response.Analysis.Components, "DynamicToken")
	if len(dynamic.EnhancementContexts.Provides) != 0 {
		t.Fatalf("instance-dependent token escaped into pre-activation metadata: %#v", dynamic.EnhancementContexts)
	}
	compactCode := strings.Join(strings.Fields(response.Code), "")
	for _, expected := range []string{
		`Symbol.for("@exactjs/enhancement-contexts")`,
		`provides: Object.freeze([PhysicsContext.id])`,
		`requires: Object.freeze([WorldContext.id])`,
		`optionallyConsumes: Object.freeze([PhysicsContext.id])`,
	} {
		expected = strings.Join(strings.Fields(expected), "")
		if !strings.Contains(compactCode, expected) {
			t.Fatalf("native output is missing %q:\n%s", expected, response.Code)
		}
	}
	if strings.Contains(response.Code, "this.state.token.id") {
		t.Fatalf("instance-dependent context token escaped into module metadata:\n%s", response.Code)
	}
	lateDeclaration := strings.Index(response.Code, `const LateContext = { id: Symbol("late") };`)
	lateAttachment := strings.LastIndex(response.Code, `Object.defineProperty(LateProvider`)
	if lateDeclaration < 0 || lateAttachment < lateDeclaration {
		t.Fatalf("late context metadata ran before token initialization:\n%s", response.Code)
	}
}

func TestSessionComposesImportedCallableEnhancementContexts(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(
		configFile,
		[]byte(`{
			"compilerOptions": {
				"module": "ESNext",
				"moduleResolution": "Bundler",
				"target": "ES2022",
				"jsx": "preserve"
			},
			"include": ["*.ts", "*.tsx"]
		}`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	contextsFile := filepath.Join(root, "contexts.ts")
	if err := os.WriteFile(
		contextsFile,
		[]byte(`export const HiddenContext = { id: Symbol("hidden") };`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	helperFile := filepath.Join(root, "helper.ts")
	helperSource := `
		import { HiddenContext } from "./contexts.js";
		export function readHidden(owner: Component<{}>) {
			if (!owner.hasContext(HiddenContext)) return;
			owner.getContext(HiddenContext);
		}
		export function publishHidden(owner: Component<{}>) {
			owner.setContext(HiddenContext, "ready");
		}
	`
	if err := os.WriteFile(helperFile, []byte(helperSource), 0o600); err != nil {
		t.Fatal(err)
	}
	entryFile := filepath.Join(root, "entry.tsx")
	entrySource := `
		import { publishHidden, readHidden } from "./helper.js";
		export function Consumer(this: Component<{}>) {
			readHidden(this);
			publishHidden(this);
			return () => <button />;
		}
	`
	if err := os.WriteFile(entryFile, []byte(entrySource), 0o600); err != nil {
		t.Fatal(err)
	}
	session := NewSession()
	helper := session.Execute(Request{
		ID: helperFile, Root: root, ConfigFile: configFile,
		Kind: "compile", Source: helperSource, Target: TargetClient,
	})
	if helper.Error != "" {
		t.Fatal(helper.Error)
	}
	entry := session.Execute(Request{
		ID: entryFile, Root: root, ConfigFile: configFile,
		Kind: "compile", Source: entrySource, Target: TargetClient,
	})
	if entry.Error != "" {
		t.Fatal(entry.Error)
	}
	helperCode := strings.Join(strings.Fields(helper.Code), "")
	for _, expected := range []string{
		`Object.defineProperty(readHidden,Symbol.for("@exactjs/enhancement-contexts")`,
		`optionallyConsumes:Object.freeze([HiddenContext.id])`,
		`Object.defineProperty(publishHidden,Symbol.for("@exactjs/enhancement-contexts")`,
		`provides:Object.freeze([HiddenContext.id])`,
	} {
		if !strings.Contains(helperCode, expected) {
			t.Fatalf("helper output is missing %q:\n%s", expected, helper.Code)
		}
	}
	entryCode := strings.Join(strings.Fields(entry.Code), "")
	for _, expected := range []string{
		`Reflect.get(readHidden,Symbol.for("@exactjs/enhancement-contexts")).optionallyConsumes`,
		`Reflect.get(publishHidden,Symbol.for("@exactjs/enhancement-contexts")).provides`,
	} {
		if !strings.Contains(entryCode, expected) {
			t.Fatalf(
				"component output is missing %q:\ncode=%q\nanalysis=%#v",
				expected,
				entry.Code,
				entry.Analysis,
			)
		}
	}
}

func TestSessionSeparatesTaskEffectsFromComponentSetupPlacement(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "workspace.tsx",
		Kind: "analyze",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare function loadOnServer(): Promise<number>;
			export function Workspace(this: Component<{ count: number }>) {
				async function load(_task: TaskContext = TaskContext.server()) {
					this.state.count = await loadOnServer();
				}
				function refresh(_task: TaskContext = TaskContext.client()) {
					localStorage.setItem("refreshing", "true");
				}
				load();
				return () => <button onClick={() => refresh()}>{this.state.count}</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	workspace := findComponent(t, response.Analysis.Components, "Workspace")
	if workspace.Placement != "isomorphic" ||
		len(workspace.ArtifactTargets) != 2 ||
		workspace.ArtifactTargets[0] != "client" ||
		workspace.ArtifactTargets[1] != "server" ||
		strings.Contains(strings.Join(workspace.Diagnostics, "\n"), "mixed placement effects") {
		t.Fatalf(
			"task effects contaminated component setup placement: component=%#v tasks=%#v",
			workspace,
			response.Analysis.Tasks,
		)
	}
}

func TestSessionBuildsLocalComponentRenderSubgraphs(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			function Parent() {
				return () => <main><Child /></main>;
			}
			function Child() {
				return () => <button onClick={() => {}}>child</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	parent := findComponent(t, response.Analysis.Components, "Parent")
	child := findComponent(t, response.Analysis.Components, "Child")
	if child.Placement != "client" || child.ClientIslandCount != 1 {
		t.Fatalf("unexpected child placement: %#v", child)
	}
	if len(parent.RenderEdges) != 1 ||
		parent.RenderEdges[0].Tag != "Child" ||
		parent.RenderEdges[0].Placement != "client" ||
		parent.SubgraphPlacement != "isomorphic" {
		t.Fatalf("unexpected parent subgraph: %#v", parent)
	}
}

func TestSessionKeepsNestedSameNamedComponentsDistinct(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			function left() {
				function Card() { return () => <p>left</p>; }
				return Card;
			}
			function right() {
				function Card() { return () => <p>right</p>; }
				return Card;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	cards := 0
	for _, component := range response.Analysis.Components {
		if component.Name == "Card" {
			cards++
		}
	}
	if cards != 2 {
		t.Fatalf("nested same-named components were collapsed: %#v", response.Analysis.Components)
	}
}

func TestSessionAppliesStateAndContextResidencyToTasks(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "component.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> {
				state: State;
				task(work: () => void): void;
				getContext(token: unknown): unknown;
			}
			declare function createContext<T>(
				value: T,
				options?: { keep?: "client" | "server" | "shared" | "secret" }
			): unknown;
			interface State {
				/** @exact keep=secret */
				token: string;
				/** @exact keep=client */
				draft: string;
			}
			const BrowserContext = createContext("", { keep: "client" });
			function Panel(this: Component<State>) {
				const __fixtureTask39 = (_task: TaskContext = TaskContext.latest()) => consume(this.state.token);
__fixtureTask39();
				const __fixtureTask40 = (_task: TaskContext = TaskContext.server()) => consume(this.state.draft);
__fixtureTask40();
				const __fixtureTask41 = (_task: TaskContext = TaskContext.latest()) => this.getContext(BrowserContext);
__fixtureTask41();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Tasks) != 3 {
		t.Fatalf("unexpected tasks: %#v", response.Analysis.Tasks)
	}
	if response.Analysis.Tasks[0].Placement != "server" ||
		response.Analysis.Tasks[0].EnvironmentEffect != "server" {
		t.Fatalf("secret state did not force server placement: %#v", response.Analysis.Tasks[0])
	}
	if !containsString(
		response.Analysis.Tasks[1].Diagnostics,
		"error: server task reads or writes client-kept data",
	) {
		t.Fatalf("client-kept state contradiction was not diagnosed: %#v", response.Analysis.Tasks[1])
	}
	if response.Analysis.Tasks[2].Placement != "client" {
		t.Fatalf("client-kept context did not force client placement: %#v", response.Analysis.Tasks[2])
	}
	if !containsPolicySubject(
		response.Analysis.Policy.Subjects,
		"state",
		"Panel.state.token",
		"server",
		true,
	) || !containsPolicySubject(
		response.Analysis.Policy.Subjects,
		"context",
		"BrowserContext",
		"client",
		false,
	) {
		t.Fatalf("missing native policy subjects: %#v", response.Analysis.Policy.Subjects)
	}
}

func TestSessionRejectsNonSharedCapturedInputsForServerTasks(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "captured-policy.tsx",
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			declare class Component<State> { state: State }
			interface State {
				/** @exact keep=client */
				draft: string;
			}
			function Editor(this: Component<State>) {
				async function save(
					draft: string = this.state.draft,
					task: TaskContext = TaskContext.server().latest()
				) {
					await persist(draft, task.signal);
				}
				return () => <button onClick={() => save()}>Save</button>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Tasks) != 1 ||
		!containsString(
			response.Analysis.Tasks[0].Diagnostics,
			"error: a server task captured parameter must not transport client-kept, server-kept, or secret data",
		) {
		t.Fatalf(
			"server capture did not enforce its data boundary: %#v",
			response.Analysis.Tasks,
		)
	}
}

func TestSessionAppliesCallablePlacementAndResidencyAnnotations(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "policy.ts",
		Kind: "compile",
		Source: `
			/** @exact client */
			function browserOnly() { return 1; }
			/** @exact keep=secret */
			function secretValue() { return "secret"; }
			/** @exact pure */
			function safeValue() { return 1; }
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	browser := findCallable(t, response.Analysis.Callables, "browserOnly")
	secret := findCallable(t, response.Analysis.Callables, "secretValue")
	safe := findCallable(t, response.Analysis.Callables, "safeValue")
	if browser.Effect != "browser" ||
		len(browser.ArtifactTargets) != 1 ||
		browser.ArtifactTargets[0] != "client" {
		t.Fatalf("client annotation did not restrict callable: %#v", browser)
	}
	if secret.Effect != "server" ||
		len(secret.ArtifactTargets) != 1 ||
		secret.ArtifactTargets[0] != "server" {
		t.Fatalf("secret policy did not restrict callable: %#v", secret)
	}
	if !safe.ReevaluationSafe {
		t.Fatalf("pure annotation did not mark callable safe: %#v", safe)
	}
}

func TestSessionPropagatesAmbientCallablePlacementAnnotations(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "ambient-policy.tsx",
		Kind: "analyze",
		Source: `
			/** @exact client */
			declare function render(): void;
			/** @exact server */
			declare function load(): string;
			export function ClientPage() { render(); return () => <p />; }
			export function ServerPage() { const value = load(); return () => <p>{value}</p>; }
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	client := findComponent(t, response.Analysis.Components, "ClientPage")
	server := findComponent(t, response.Analysis.Components, "ServerPage")
	if client.Placement != "client" || server.Placement != "server" {
		t.Fatalf("ambient callable annotations were not propagated: %#v %#v", client, server)
	}
}

func TestSessionBuildsAndAuthorizesDeclarationPolicyFlows(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "policy.ts",
		Kind: "compile",
		Source: `
			/** @exact keep=secret */
			const token = "private";
			const inherited = token;
			/** @exact shared */
			const leaked = inherited;
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !containsPolicySubject(
		response.Analysis.Policy.Subjects,
		"declaration",
		"inherited",
		"server",
		true,
	) {
		t.Fatalf("policy did not propagate to inferred declaration: %#v", response.Analysis.Policy)
	}
	unauthorized := false
	for _, flow := range response.Analysis.Policy.Flows {
		if flow.To == policySubjectID(
			response.Analysis.Policy.Subjects,
			"declaration",
			"leaked",
		) && !flow.Authorized {
			unauthorized = true
		}
	}
	if !unauthorized {
		t.Fatalf("secret release was not rejected in policy graph: %#v", response.Analysis.Policy.Flows)
	}
	if !containsDiagnosticCode(response.Diagnostics, "EXACT3001") {
		t.Fatalf("secret release did not produce a diagnostic: %#v", response.Diagnostics)
	}
}

func TestSessionAuditsImportedSecretConsumption(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "policy.ts",
		Kind: "compile",
		Source: `
			import { consume as reveal } from "@exactjs/secrets";
			declare const secrets: { require(name: string): string };
			/** @exact keep=secret */
			const token = secrets.require("API_KEY");
			function loadToken() {
				return reveal(token);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	consumers := response.Analysis.Policy.SecretConsumers
	if len(consumers) != 1 {
		t.Fatalf("collected %d secret consumers, expected 1: %#v", len(consumers), consumers)
	}
	consumer := consumers[0]
	if consumer.Caller != "loadToken" ||
		consumer.Consumer.Package != "<application>" ||
		consumer.Consumer.Symbol != "consume" ||
		consumer.Authorization != "implicit-application-owner" ||
		consumer.Target != "server" ||
		consumer.Dynamic ||
		consumer.Selector != "API_KEY" {
		t.Fatalf("unexpected secret consumer: %#v", consumer)
	}
	if !hasPolicyFlowTo(response.Analysis.Policy.Flows, consumer.ID, true) {
		t.Fatalf("secret consumption receipt was not authorized: %#v", response.Analysis.Policy.Flows)
	}
	if containsDiagnosticCode(response.Diagnostics, "EXACT3002") ||
		containsDiagnosticCode(response.Diagnostics, "EXACT3004") {
		t.Fatalf("authorized consumption produced diagnostics: %#v", response.Diagnostics)
	}
}

func TestSessionPreservesSelectorFromTypedSecretProviderFacade(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:          "app.ts",
		Kind:        "analyze",
		PackageType: "application",
		PackageName: "@acme/app",
		Target:      TargetServer,
		Source: `
			import { consume, type Secret } from "@exactjs/secrets";
			declare const secrets: { require(name: string): Secret<string> };
			const apiKey = secrets.require("STRIPE_SECRET_KEY");
			export const client = consume(apiKey);
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	consumers := response.Analysis.Policy.SecretConsumers
	if len(consumers) != 1 ||
		consumers[0].Dynamic ||
		consumers[0].Selector != "STRIPE_SECRET_KEY" {
		t.Fatalf("typed provider selector was not preserved: %#v", consumers)
	}
}

func TestSessionEmitsLibrarySecretConsumptionRequirements(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:          "policy.ts",
		Kind:        "analyze",
		PackageType: "library",
		PackageName: "@scope/secrets-client",
		Source: `
			import { consume } from "@exactjs/secrets";
			/** @exact keep=secret */
			const token = "private";
			export function reveal() { return consume(token); }
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	consumers := response.Analysis.Policy.SecretConsumers
	if len(consumers) != 1 ||
		consumers[0].Consumer.Package != "@scope/secrets-client" ||
		consumers[0].Authorization != "library-requirement" {
		t.Fatalf("library secret requirement was not retained: %#v", consumers)
	}
}

func TestSessionValidatesNativeUnsafeHTMLCapabilities(t *testing.T) {
	library := NewSession().Execute(Request{
		ID:          "library.ts",
		Kind:        "analyze",
		PackageType: "library",
		PackageName: "@scope/article",
		Source: `
			import { unsafeHtml as html } from "@exactjs/core";
			export function article(value: string) { return html(value); }
		`,
	})
	if library.Error != "" {
		t.Fatal(library.Error)
	}
	if len(library.Diagnostics) != 0 ||
		len(library.Analysis.Capabilities.RawHTML) != 1 ||
		library.Analysis.Capabilities.RawHTML[0].Symbol != "article" {
		t.Fatalf("library unsafeHtml requirement was not emitted: %#v %#v",
			library.Analysis.Capabilities,
			library.Diagnostics,
		)
	}
}

func TestSessionPlansAndPartitionsNativeAssetImports(t *testing.T) {
	source := `
		import "./app.scss";
		import poster from "./poster.avif?url";
		export const asset = poster;
	`
	request := Request{
		ID:     "assets.ts",
		Kind:   "analyze",
		Source: source,
		AssetRules: []AssetRule{{
			Extensions: []string{".avif"},
			Queries:    []string{"url"},
			Kind:       "image",
			ImportMode: "url",
		}},
	}
	analysis := NewSession().Execute(request)
	if analysis.Error != "" {
		t.Fatal(analysis.Error)
	}
	if len(analysis.Diagnostics) != 0 ||
		len(analysis.Analysis.Assets) != 2 ||
		analysis.Analysis.Assets[0].EvaluationTarget != "client" ||
		analysis.Analysis.Assets[1].Kind != "image" ||
		analysis.Analysis.Assets[1].ImportMode != "url" ||
		analysis.Analysis.Assets[1].EvaluationTarget != "both" {
		t.Fatalf("unexpected native asset plan: %#v %#v",
			analysis.Analysis.Assets,
			analysis.Diagnostics,
		)
	}
	request.Kind = "compile"
	request.Target = TargetServer
	server := NewSession().Execute(request)
	if strings.Contains(server.Code, "./app.scss") ||
		!strings.Contains(server.Code, "./poster.avif?url") {
		t.Fatalf("server asset partition is incorrect:\n%s", server.Code)
	}
	request.PreserveClientAssetImports = true
	preserved := NewSession().Execute(request)
	if !strings.Contains(preserved.Code, "./app.scss") {
		t.Fatalf("client asset edge was not preserved for bundler:\n%s", preserved.Code)
	}
}

func TestSessionConsumesNativeExactImportPlacementAttributes(t *testing.T) {
	source := `import { privateConfig } from "./config.js" with { exact: "server" };
		export const config = privateConfig;`
	client := NewSession().Execute(Request{
		ID: "placement.ts", Kind: "compile", Target: TargetClient, Source: source,
	})
	if client.Error != "" {
		t.Fatal(client.Error)
	}
	if strings.Contains(client.Code, "./config.js") ||
		strings.Contains(client.Code, "privateConfig") {
		t.Fatalf("server import leaked into client output:\n%s", client.Code)
	}
	server := NewSession().Execute(Request{
		ID: "placement.ts", Kind: "compile", Target: TargetServer, Source: source,
	})
	if server.Error != "" {
		t.Fatal(server.Error)
	}
	if !strings.Contains(server.Code, "./config.js") ||
		strings.Contains(server.Code, "exact:") {
		t.Fatalf("exact placement attribute was not consumed:\n%s", server.Code)
	}
}

func TestSessionPreservesInferredSecretQualificationInOutput(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "secret.ts",
		Kind: "compile",
		Source: `
			declare function loadToken(): string;
			/** @exact keep=secret */
			const token = loadToken();
			/** @exact keep=secret */
			function currentToken() {
				return loadToken();
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []string{
		`import type { Secret as __ExactSecret } from "@exactjs/secrets"`,
		`const token = loadToken() as __ExactSecret<string>`,
		`return loadToken() as __ExactSecret<string>`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf(
				"native secret qualification output is missing %q:\n%s",
				expected,
				response.Code,
			)
		}
	}
}

func TestSessionRejectsSecretConsumptionInClientArtifact(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "policy.ts",
		Kind:   "compile",
		Target: TargetClient,
		Source: `
			import * as secrets from "@exactjs/secrets";
			/** @exact keep=secret */
			const token = "private";
			const exposed = secrets.consume(token);
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	consumers := response.Analysis.Policy.SecretConsumers
	if len(consumers) != 1 ||
		consumers[0].Authorization != "denied" ||
		consumers[0].Target != "client" {
		t.Fatalf("client secret consumption was not denied: %#v", consumers)
	}
	if !containsDiagnosticCode(response.Diagnostics, "EXACT3004") ||
		hasPolicyFlowTo(response.Analysis.Policy.Flows, consumers[0].ID, true) {
		t.Fatalf(
			"client secret consumption did not produce a denied receipt: %#v %#v",
			response.Diagnostics,
			response.Analysis.Policy.Flows,
		)
	}
}

func TestSessionRequiresQualifiedSecretCallBoundaries(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "policy.ts",
		Kind: "compile",
		Source: `
			import { consume as reveal } from "@exactjs/secrets";
			type Secret<T> = T & { readonly __secret: unique symbol };
			declare function acceptsSecret(value: Secret<string>): void;
			declare function acceptsPlain(value: string): void;
			function consume(value: string): string { return value; }
			/** @exact keep=secret */
			const token = "private";
			reveal("ordinary");
			acceptsSecret(token);
			acceptsPlain(token);
			consume(token);
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Policy.SecretConsumers) != 0 {
		t.Fatalf(
			"unqualified or local calls were incorrectly audited as consumption: %#v",
			response.Analysis.Policy.SecretConsumers,
		)
	}
	if !containsDiagnosticCode(response.Diagnostics, "EXACT3002") {
		t.Fatalf("ordinary consume argument was not rejected: %#v", response.Diagnostics)
	}
	unauthorized := 0
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == "EXACT3003" {
			unauthorized++
		}
	}
	if unauthorized != 2 {
		t.Fatalf(
			"received %d unqualified secret-call diagnostics, expected 2: %#v",
			unauthorized,
			response.Diagnostics,
		)
	}
}

func TestSessionPropagatesTypeAndReturnSecretPolicies(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "policy.ts",
		Kind: "compile",
		Source: `
			type Secret<T> = T & { readonly __secret: unique symbol };
			declare const secrets: { require(name: string): Secret<string> };
			const token = secrets.require("API_KEY");
			function header() {
				return "Bearer " + token;
			}
			const authorization = header();
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, expected := range []struct {
		kind string
		name string
	}{
		{kind: "declaration", name: "token"},
		{kind: "return", name: "header"},
		{kind: "declaration", name: "authorization"},
	} {
		if !containsPolicySubject(
			response.Analysis.Policy.Subjects,
			expected.kind,
			expected.name,
			"server",
			true,
		) {
			t.Fatalf(
				"missing propagated policy for %s %s: %#v",
				expected.kind,
				expected.name,
				response.Analysis.Policy,
			)
		}
	}
}

func TestSessionPropagatesSecretThroughDestructuringUntilConsume(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "policy.ts",
		Kind: "compile",
		Source: `
			import { consume } from "@exactjs/secrets";
			/** @exact keep=secret */
			const combo = "key:secret";
			const [key, secret] = combo.split(":");
			const authorization = key + ":" + secret;
			const rawAuthorization = consume(authorization);
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, name := range []string{"key", "secret", "authorization"} {
		if !containsPolicySubject(
			response.Analysis.Policy.Subjects,
			"declaration",
			name,
			"server",
			true,
		) {
			t.Fatalf("missing destructured policy for %s: %#v", name, response.Analysis.Policy)
		}
	}
	if containsPolicySubject(
		response.Analysis.Policy.Subjects,
		"declaration",
		"rawAuthorization",
		"server",
		true,
	) {
		t.Fatalf(
			"consume result retained secret qualification: %#v",
			response.Analysis.Policy.Subjects,
		)
	}
	if len(response.Analysis.Policy.SecretConsumers) != 1 {
		t.Fatalf(
			"derived secret consumption was not audited: %#v",
			response.Analysis.Policy.SecretConsumers,
		)
	}
}

func TestSessionPropagatesCallableEffectsAcrossProjectImports(t *testing.T) {
	root := t.TempDir()
	helper := filepath.Join(root, "helper.ts")
	if err := os.WriteFile(
		helper,
		[]byte(`
			import { readFileSync } from "node:fs";
			export function loadConfig() {
				return readFileSync("config.json", "utf8");
			}
		`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(root, "entry.tsx")
	response := NewSession().Execute(Request{
		ID:   entry,
		Root: root,
		Kind: "compile",
		Source: `
			import { TaskContext } from "@exactjs/core";
			import { loadConfig } from "./helper.js";
			function Panel() {
				const __fixtureTask42 = (_task: TaskContext = TaskContext.latest()) => loadConfig();
__fixtureTask42();
				return () => <output />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Analysis.Tasks) != 1 ||
		response.Analysis.Tasks[0].EnvironmentEffect != "server" ||
		response.Analysis.Tasks[0].Placement != "server" {
		t.Fatalf(
			"imported callable effects did not reach the task: %#v",
			response.Analysis.Tasks,
		)
	}
	for _, callable := range response.Analysis.Callables {
		if callable.Name == "loadConfig" {
			t.Fatalf("dependency callable leaked into module-scoped response: %#v", callable)
		}
	}
}

func TestSessionPropagatesInteractiveHelperEffectsAcrossProjectImports(t *testing.T) {
	root := t.TempDir()
	helper := filepath.Join(root, "helper.tsx")
	if err := os.WriteFile(
		helper,
		[]byte(`
			export function renderWorkspace(click: () => void) {
				return <button onClick={click}>open</button>;
			}
		`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(root, "entry.tsx")
	response := NewSession().Execute(Request{
		ID:   entry,
		Root: root,
		Kind: "analyze",
		Source: `
			import { renderWorkspace } from "./helper.js";
			export function Workspace(this: Component<{ count: number }>) {
				this.state.count = 0;
				return () => renderWorkspace(() => this.state.count++);
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	workspace := findComponent(t, response.Analysis.Components, "Workspace")
	if workspace.Placement != "client" {
		t.Fatalf("interactive helper effect did not reach component: %#v", workspace)
	}
	workspaceFile := filepath.Join(root, "workspace.tsx")
	if err := os.WriteFile(
		workspaceFile,
		[]byte(`
			import { renderWorkspace } from "./helper.js";
			export function Workspace(this: Component<{ count: number }>) {
				this.state.count = 0;
				return () => renderWorkspace(() => this.state.count++);
			}
		`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	pageFile := filepath.Join(root, "page.tsx")
	pageResponse := NewSession().Execute(Request{
		ID:   pageFile,
		Root: root,
		Kind: "analyze",
		Source: `
			import { Workspace } from "./workspace.js";
			export function Page() {
				return () => <main><Workspace /></main>;
			}
		`,
	})
	if pageResponse.Error != "" {
		t.Fatal(pageResponse.Error)
	}
	page := findComponent(t, pageResponse.Analysis.Components, "Page")
	if len(page.RenderEdges) != 1 || page.RenderEdges[0].Placement != "client" {
		t.Fatalf("transitive client component edge was not linked: %#v", page)
	}
}

func TestSessionInvalidatesRetainedProjectCallableEffects(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(
		configFile,
		[]byte(`{
			"compilerOptions": {
				"module": "NodeNext",
				"moduleResolution": "NodeNext",
				"target": "ES2022",
				"jsx": "preserve"
			},
			"include": ["*.ts", "*.tsx"]
		}`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	helper := filepath.Join(root, "helper.ts")
	initialHelper := `
		export function loadConfig() {
			return "ready";
		}
	`
	if err := os.WriteFile(helper, []byte(initialHelper), 0o600); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(root, "entry.tsx")
	entrySource := `
			import { TaskContext } from "@exactjs/core";
		import { loadConfig } from "./helper.js";
		export function Panel() {
			const __fixtureTask8 = (_task: TaskContext = TaskContext.latest()) => loadConfig();
__fixtureTask8();
			return () => <output />;
		}
	`
	if err := os.WriteFile(entry, []byte(entrySource), 0o600); err != nil {
		t.Fatal(err)
	}
	session := NewSession()
	initial := session.Execute(Request{
		ID: entry, Root: root, ConfigFile: configFile,
		Kind: "compile", Source: entrySource,
	})
	if initial.Error != "" {
		t.Fatal(initial.Error)
	}
	if len(initial.Analysis.Tasks) != 1 ||
		initial.Analysis.Tasks[0].EnvironmentEffect == "server" {
		t.Fatalf("initial helper unexpectedly required the server: %#v", initial.Analysis.Tasks)
	}

	changedHelper := `
		import { readFileSync } from "node:fs";
		export function loadConfig() {
			return readFileSync("config.json", "utf8");
		}
	`
	changed := session.Execute(Request{
		ID: helper, Root: root, ConfigFile: configFile,
		Kind: "compile", Source: changedHelper,
	})
	if changed.Error != "" {
		t.Fatal(changed.Error)
	}
	updated := session.Execute(Request{
		ID: entry, Root: root, ConfigFile: configFile,
		Kind: "compile", Source: entrySource,
	})
	if updated.Error != "" {
		t.Fatal(updated.Error)
	}
	if !updated.CacheHit {
		t.Fatal("unchanged entry did not reuse the retained TypeScript-Go project")
	}
	if len(updated.Analysis.Tasks) != 1 ||
		updated.Analysis.Tasks[0].EnvironmentEffect != "server" ||
		updated.Analysis.Tasks[0].Placement != "server" {
		t.Fatalf(
			"changed dependency did not invalidate retained callable effects: %#v",
			updated.Analysis.Tasks,
		)
	}
}

func TestSessionDiagnosesConsumersAfterProjectSourceChanges(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(
		configFile,
		[]byte(`{
			"compilerOptions": {
				"module": "ESNext",
				"moduleResolution": "Bundler",
				"target": "ES2022"
			},
			"include": ["*.ts"]
		}`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	model := filepath.Join(root, "model.ts")
	initialModel := `export interface Model { value: number }
export const model: Model = { value: 1 };`
	if err := os.WriteFile(model, []byte(initialModel), 0o600); err != nil {
		t.Fatal(err)
	}
	consumer := filepath.Join(root, "consumer.ts")
	if err := os.WriteFile(
		consumer,
		[]byte(`import { model } from "./model.js";
export const value: number = model.value;`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	session := NewSession()
	initial := session.Execute(Request{
		ID: model, Root: root, ConfigFile: configFile,
		Kind: "diagnose", Source: initialModel, Diagnostics: "semantic",
	})
	if initial.Error != "" {
		t.Fatal(initial.Error)
	}
	if len(initial.Diagnostics) != 0 {
		t.Fatalf("valid project returned diagnostics: %#v", initial.Diagnostics)
	}

	changedModel := `export interface Model { value: string }
export const model: Model = { value: "changed" };`
	changed := session.Execute(Request{
		ID: model, Root: root, ConfigFile: configFile,
		Kind: "diagnose", Source: changedModel, Diagnostics: "semantic",
	})
	if changed.Error != "" {
		t.Fatal(changed.Error)
	}
	found := false
	for _, diagnostic := range changed.Diagnostics {
		if diagnostic.Code == "TS2322" &&
			filepath.ToSlash(diagnostic.FileName) == filepath.ToSlash(consumer) {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("consumer type error was not reported: %#v", changed.Diagnostics)
	}
}

func TestSessionResolvesImportedComponentPlacementSubgraphs(t *testing.T) {
	root := t.TempDir()
	childFile := filepath.Join(root, "child.tsx")
	if err := os.WriteFile(
		childFile,
		[]byte(`
			export function Child() {
				return () => <button onClick={() => {}}>child</button>;
			}
		`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(root, "entry.tsx")
	response := NewSession().Execute(Request{
		ID:   entry,
		Root: root,
		Kind: "compile",
		Source: `
			import { Child } from "./child.js";
			export function Parent() {
				return () => <main><Child /></main>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	parent := findComponent(t, response.Analysis.Components, "Parent")
	if len(parent.RenderEdges) != 1 ||
		parent.RenderEdges[0].Tag != "Child" ||
		parent.RenderEdges[0].ComponentID == "" ||
		parent.RenderEdges[0].Placement != "client" ||
		parent.SubgraphPlacement != "isomorphic" {
		t.Fatalf("imported component placement did not propagate: %#v", parent)
	}
}

func TestSessionDescribesOpaqueRuntimeComponentImports(t *testing.T) {
	root := t.TempDir()
	entry := filepath.Join(root, "entry.tsx")
	response := NewSession().Execute(Request{
		ID:   entry,
		Root: root,
		Kind: "compile",
		Source: `
			import { RemoteComponent } from "@exactjs/microfrontends/client";
			export function Page() {
				return () => <RemoteComponent binding="billing" />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	page := findComponent(t, response.Analysis.Components, "Page")
	if len(page.Diagnostics) != 0 {
		t.Fatalf("opaque runtime import produced diagnostics: %#v", page.Diagnostics)
	}
	if len(page.RenderEdges) != 1 ||
		page.RenderEdges[0].ModuleSpecifier != "@exactjs/microfrontends/client" ||
		page.RenderEdges[0].ExportName != "RemoteComponent" ||
		page.RenderEdges[0].ComponentID != "" {
		t.Fatalf("opaque runtime import build edge was not retained: %#v", page.RenderEdges)
	}
	if !strings.Contains(response.Code, "__exactVNode(RemoteComponent") {
		t.Fatalf("runtime component import was not lowered: %s", response.Code)
	}
}

func TestSessionRejectsOpaqueTypeOnlyComponentImports(t *testing.T) {
	root := t.TempDir()
	entry := filepath.Join(root, "entry.tsx")
	response := NewSession().Execute(Request{
		ID:   entry,
		Root: root,
		Kind: "analyze",
		Source: `
			import type { RemoteComponent } from "@exactjs/microfrontends/client";
			export function Page() {
				return () => <RemoteComponent />;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	page := findComponent(t, response.Analysis.Components, "Page")
	if !containsString(
		page.Diagnostics,
		"error: JSX tag RemoteComponent resolves to a type-only import and cannot be rendered at runtime",
	) {
		t.Fatalf("type-only import was not diagnosed: %#v", page.Diagnostics)
	}
}

func TestSessionInvalidatesRetainedProjectComponentGraph(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(
		configFile,
		[]byte(`{
			"compilerOptions": {
				"module": "NodeNext",
				"moduleResolution": "NodeNext",
				"target": "ES2022",
				"jsx": "preserve"
			},
			"include": ["*.tsx"]
		}`),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	childFile := filepath.Join(root, "child.tsx")
	clientChild := `
		export function Child() {
			return () => <button onClick={() => {}}>child</button>;
		}
	`
	if err := os.WriteFile(childFile, []byte(clientChild), 0o600); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(root, "entry.tsx")
	entrySource := `
		import { Child } from "./child.js";
		export function Parent() {
			return () => <main><Child /></main>;
		}
	`
	if err := os.WriteFile(entry, []byte(entrySource), 0o600); err != nil {
		t.Fatal(err)
	}
	session := NewSession()
	initial := session.Execute(Request{
		ID: entry, Root: root, ConfigFile: configFile,
		Kind: "compile", Source: entrySource,
	})
	if initial.Error != "" {
		t.Fatal(initial.Error)
	}
	initialParent := findComponent(t, initial.Analysis.Components, "Parent")
	if len(initialParent.RenderEdges) != 1 ||
		initialParent.RenderEdges[0].Placement != "client" {
		t.Fatalf("initial component graph was not client-linked: %#v", initialParent)
	}

	sharedChild := `
		export function Child() {
			return () => <span>child</span>;
		}
	`
	changed := session.Execute(Request{
		ID: childFile, Root: root, ConfigFile: configFile,
		Kind: "compile", Source: sharedChild,
	})
	if changed.Error != "" {
		t.Fatal(changed.Error)
	}
	updated := session.Execute(Request{
		ID: entry, Root: root, ConfigFile: configFile,
		Kind: "compile", Source: entrySource,
	})
	if updated.Error != "" {
		t.Fatal(updated.Error)
	}
	updatedParent := findComponent(t, updated.Analysis.Components, "Parent")
	if len(updatedParent.RenderEdges) != 1 ||
		updatedParent.RenderEdges[0].Placement == "client" ||
		updatedParent.RenderEdges[0].ComponentID == "" {
		t.Fatalf(
			"changed dependency did not invalidate retained component graph: %#v",
			updatedParent,
		)
	}
}

func TestSessionRejectsUnknownNamespacedDirectives(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Source: "/* @exact missing.feature */ const value = 1;",
	})
	if len(response.Diagnostics) != 1 ||
		response.Diagnostics[0].Code != "EXACT1001" {
		t.Fatalf("unexpected namespace diagnostics: %#v", response.Diagnostics)
	}
}

func TestSessionIncrementallyUpdatesProgramAndChecker(t *testing.T) {
	session := NewSession()
	request := Request{
		ID:     "component.tsx",
		Kind:   "compile",
		Source: "const value = 1;",
	}
	if response := session.Execute(request); response.Error != "" {
		t.Fatal(response.Error)
	}
	request.Source = `const value = "updated";`
	response := session.Execute(request)
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if response.CacheHit {
		t.Fatal("changed source unexpectedly reused the previous program generation")
	}
	if !strings.Contains(response.Code, `const value = "updated"`) {
		t.Fatalf("updated program was not printed:\n%s", response.Code)
	}
}

func TestSessionCanReportSemanticDiagnostics(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:          "component.tsx",
		Kind:        "compile",
		Source:      `const value: number = "wrong";`,
		Diagnostics: "semantic",
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if len(response.Diagnostics) == 0 {
		t.Fatal("semantic type error was not reported")
	}
	if response.Diagnostics[0].Code != "TS2322" {
		t.Fatalf("unexpected semantic diagnostic: %#v", response.Diagnostics[0])
	}
}

func TestSessionAnalyzesImportsWithoutLoweringOrPrinting(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:          "component.tsx",
		Kind:        "analyze",
		Diagnostics: "syntax",
		Source: `
			import type { Shape } from "./shape.js";
			import { value } from "./value.js";
			import "./side-effect.js";
			export { Widget } from "./widget.js";
			export type { WidgetProps } from "./widget-types.js";
			export function Panel() {
				return () => <output>{value}</output>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if response.Code != "" {
		t.Fatalf("analysis-only request unexpectedly printed code: %s", response.Code)
	}
	if len(response.Analysis.Imports) != 5 {
		t.Fatalf("unexpected native imports: %#v", response.Analysis.Imports)
	}
	if !response.Analysis.Imports[0].TypeOnly ||
		!response.Analysis.Imports[1].RuntimeBinding ||
		!response.Analysis.Imports[2].SideEffectOnly ||
		!response.Analysis.Imports[3].RuntimeBinding ||
		!response.Analysis.Imports[4].TypeOnly {
		t.Fatalf("incorrect native import facets: %#v", response.Analysis.Imports)
	}
}

func equalStrings(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func containsStateRead(reads []StateRead, path []string, confidence string) bool {
	for _, read := range reads {
		if read.Confidence == confidence && equalStrings(read.Path, path) {
			return true
		}
	}
	return false
}

func assertReactiveBinding(
	t *testing.T,
	bindings []ReactiveBinding,
	name string,
	provenance string,
	safe bool,
) ReactiveBinding {
	t.Helper()
	for _, binding := range bindings {
		if binding.Name != name {
			continue
		}
		if binding.Provenance != provenance || binding.SafeToReevaluate != safe {
			t.Fatalf("unexpected reactive binding %s: %#v", name, binding)
		}
		return binding
	}
	t.Fatalf("missing reactive binding %s: %#v", name, bindings)
	return ReactiveBinding{}
}

func findCallable(
	t *testing.T,
	callables []CallableSummary,
	name string,
) CallableSummary {
	t.Helper()
	for _, callable := range callables {
		if callable.Name == name {
			return callable
		}
	}
	t.Fatalf("missing callable %s: %#v", name, callables)
	return CallableSummary{}
}

func containsContextEffect(
	effects []ContextEffect,
	token string,
	kind string,
) bool {
	for _, effect := range effects {
		if effect.Token == token && effect.Kind == kind {
			return true
		}
	}
	return false
}

func containsTaskResource(
	resources []TaskResource,
	kind string,
	disposal string,
) bool {
	for _, resource := range resources {
		if resource.Kind == kind && (disposal == "" || resource.Disposal == disposal) {
			return true
		}
	}
	return false
}

func containsSignalCall(
	calls []TaskSignalCall,
	parameter int,
	mode string,
) bool {
	for _, call := range calls {
		if call.Parameter == parameter && call.Mode == mode {
			return true
		}
	}
	return false
}

func containsTaskResourceDescription(
	resources []TaskResource,
	description string,
) bool {
	for _, resource := range resources {
		if strings.Contains(resource.Description, description) {
			return true
		}
	}
	return false
}

func findComponent(
	t *testing.T,
	components []Component,
	name string,
) Component {
	t.Helper()
	for _, component := range components {
		if component.Name == name {
			return component
		}
	}
	t.Fatalf("missing component %s: %#v", name, components)
	return Component{}
}

func containsPolicySubject(
	subjects []PolicySubject,
	kind string,
	name string,
	residency string,
	secret bool,
) bool {
	for _, subject := range subjects {
		if subject.Kind == kind &&
			subject.Name == name &&
			subject.Policy.Residency == residency &&
			subject.Policy.Secret == secret {
			return true
		}
	}
	return false
}

func policySubjectID(
	subjects []PolicySubject,
	kind string,
	name string,
) string {
	for _, subject := range subjects {
		if subject.Kind == kind && subject.Name == name {
			return subject.ID
		}
	}
	return ""
}

func hasPolicyFlowTo(
	flows []PolicyFlow,
	target string,
	authorized bool,
) bool {
	for _, flow := range flows {
		if flow.To == target && flow.Authorized == authorized {
			return true
		}
	}
	return false
}

func containsDiagnosticCode(diagnostics []Diagnostic, code string) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.Code == code {
			return true
		}
	}
	return false
}

func TestSessionDoesNotReportForeignModuleInitializerDiagnostics(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	currentFile := filepath.Join(root, "current.ts")
	foreignFile := filepath.Join(root, "foreign.ts")
	for filename, source := range map[string]string{
		configFile:  `{"compilerOptions":{"module":"esnext","target":"es2022"},"include":["*.ts"]}`,
		currentFile: `export const current = 1;`,
		foreignFile: `declare function opaque(): unknown; opaque();`,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	response := NewSession().Execute(Request{
		ID:         currentFile,
		Kind:       "compile",
		Source:     `export const current = 1;`,
		Target:     TargetClient,
		ConfigFile: configFile,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if containsDiagnosticCode(response.Diagnostics, "EXACT2101") {
		t.Fatalf(
			"current module inherited a foreign initializer diagnostic: %#v",
			response.Diagnostics,
		)
	}
}

func TestSessionAcceptsUninitializedComponentLocals(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/virtual/uninitialized-local.tsx",
		Kind: "compile",
		Source: `
			export function View(this: Component<{ value?: string }>) {
				let pending: string;
				pending = "ready";
				return () => <p>{pending}</p>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Severity == "error" {
			t.Fatalf("uninitialized local produced an error: %#v", response.Diagnostics)
		}
	}
}

func TestSessionTreatsUnderscoreJSXAsCompilerFragment(t *testing.T) {
	response := NewSession().Execute(Request{
		ID:   "C:/virtual/fragment.tsx",
		Kind: "compile",
		Source: `
			import { _ } from "@exactjs/jsx";
			export function View() {
				return () => <_><span>one</span><span>two</span></_>;
			}
		`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Severity == "error" {
			t.Fatalf("compiler fragment produced an error: %#v", response.Diagnostics)
		}
	}
	if !strings.Contains(response.Code, "__exactFragment(") {
		t.Fatalf("compiler fragment was not lowered:\n%s", response.Code)
	}
}

func TestSessionLowersAttributedEnhancementJSXNamespaces(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	entryFile := filepath.Join(root, "enhancement-composition.tsx")
	motionFile := filepath.Join(root, "motion.ts")
	implementationFile := filepath.Join(root, "motion-implementation.ts")
	entrySource := `
			import { TaskContext } from "@exactjs/core";
			import { gravity, motion as animate } from "./motion.js" with { type: "exact-enhancement" };
			function ServerSummary() {
				const load = async (_task: TaskContext = TaskContext.server()) => summary();
				load();
				return () => <span>Summary</span>;
			}
			export function View(this: Component<{ duration: number }>) {
				this.state.duration = 120;
				return () => (
					<button
						animate:preset="fade"
						animate:exit-duration={this.state.duration}
						animate:root
						gravity:apply="field"
					>
						<ServerSummary />
					</button>
				);
			}
		`
	for filename, source := range map[string]string{
		configFile:         `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		entryFile:          entrySource,
		motionFile:         `export { gravity, motion } from "./motion-implementation.js" with { type: "exact-enhancement" };`,
		implementationFile: `export function motion(props: { preset?: string; exitDuration?: number; children?: unknown }) { return props.children; } export function gravity(props: { apply?: string; children?: unknown }) { return props.children; }`,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	response := NewSession().Execute(Request{
		ID:               entryFile,
		Kind:             "compile",
		Source:           entrySource,
		ConfigFile:       configFile,
		ServerComponents: true,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Severity == "error" {
			t.Fatalf("enhancement JSX namespace produced an error: %#v", response.Diagnostics)
		}
	}
	if strings.Contains(response.Code, `from "./motion.js"`) {
		t.Fatalf("compile-only enhancement import was retained:\n%s", response.Code)
	}
	for _, expected := range []string{
		"createEnhancementNode",
		`identity: "./motion.js#motion"`,
		`preset: "fade"`,
		"exitDuration:",
		"root: true",
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("enhancement lowering omitted %q:\n%s", expected, response.Code)
		}
	}
	if strings.Count(response.Code, "__exactEnhancements:") != 1 {
		t.Fatalf("enhancement props were not emitted as one grouped marker:\n%s", response.Code)
	}
	if len(response.Analysis.Enhancements) != 2 ||
		response.Analysis.Enhancements[1].Identity != "./motion.js#motion" ||
		response.Analysis.Enhancements[1].ModuleSpecifier != "./motion.js" ||
		response.Analysis.Enhancements[1].ExportName != "motion" {
		t.Fatalf("compiler omitted renderer enhancement bundle metadata: %#v", response.Analysis.Enhancements)
	}
	if len(response.Analysis.EnhancementActivations) != 4 {
		t.Fatalf("compiler omitted canonical enhancement activations: %#v", response.Analysis.EnhancementActivations)
	}
	for _, activation := range response.Analysis.EnhancementActivations {
		if activation.TargetStart <= 0 || activation.TargetLength <= 0 || activation.Application != "direct" {
			t.Fatalf("compiler emitted an invalid enhancement target: %#v", activation)
		}
		if activation.Namespace == "animate" && activation.Identity != "./motion.js#motion" {
			t.Fatalf("compiler lost aliased enhancement identity: %#v", activation)
		}
		if activation.Namespace == "gravity" && activation.Identity != "./motion.js#gravity" {
			t.Fatalf("compiler lost named enhancement identity: %#v", activation)
		}
	}
	var enhancementNode PartitionPlanNode
	var gravityNode PartitionPlanNode
	for _, node := range response.Analysis.PartitionPlan.Nodes {
		if node.Kind == "enhancement-component" &&
			node.ComponentContract == "./motion.js#motion" {
			enhancementNode = node
		}
		if node.Kind == "enhancement-component" &&
			node.ComponentContract == "./motion.js#gravity" {
			gravityNode = node
		}
	}
	if enhancementNode.ID == "" || gravityNode.ID == "" || !enhancementNode.Optional ||
		enhancementNode.OwnerComponent != enhancementNode.ID {
		t.Fatalf(
			"active enhancement was not planned as an ordinary optional component owner: %#v",
			response.Analysis.PartitionPlan,
		)
	}
	if len(partitionEdgesFrom(response.Analysis.PartitionPlan, enhancementNode.ID, "enhancement")) != 1 {
		t.Fatalf("co-targeted enhancement owners were not chained deterministically: %#v", response.Analysis.PartitionPlan)
	}
	serverRanges := partitionEdgesFrom(response.Analysis.PartitionPlan, gravityNode.ID, "server-range")
	if len(serverRanges) != 1 {
		t.Fatalf("enhancement output did not retain its nested server range: %#v", response.Analysis.PartitionPlan)
	}
}

func TestSessionLowersFiniteEnhancementActivatorNamespaces(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	entryFile := filepath.Join(root, "entry.tsx")
	entrySource := `
		import * as motion from "./motion.js" with { type: "exact-enhancement" };
		export const view = (
			<section motion:fade motion:slide-up={{ distance: 24 }} motion:duration={180} />
		);
	`
	for filename, source := range map[string]string{
		configFile: `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		entryFile:  entrySource,
		filepath.Join(root, "motion.ts"): `
			export { FadeMotion as fade, SlideUpMotion as slideUp }
				from "./motion-implementation.js" with { type: "exact-enhancement" };
		`,
		filepath.Join(root, "motion-implementation.ts"): `
			export function FadeMotion(props: { duration?: number; children?: unknown }) { return props.children; }
			export function SlideUpMotion(props: { slideUp: true | { distance: number }; duration?: number; children?: unknown }) { return props.children; }
		`,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	response := NewSession().Execute(Request{
		ID: entryFile, Kind: "compile", Source: entrySource, ConfigFile: configFile,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Severity == "error" {
			t.Fatalf("finite enhancement namespace produced an error: %#v", response.Diagnostics)
		}
	}
	for _, expected := range []string{
		`identity: "./motion.js#fade"`,
		`identity: "./motion.js#slideUp"`,
		"slideUp:",
		"distance: 24",
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("finite enhancement lowering omitted %q:\n%s", expected, response.Code)
		}
	}
	if strings.Count(response.Code, "duration: __exactExpression(() => 180)") != 2 {
		t.Fatalf("shared enhancement prop was not distributed to both components:\n%s", response.Code)
	}
	if len(response.Analysis.Enhancements) != 2 {
		t.Fatalf("finite namespace omitted renderer metadata: %#v", response.Analysis.Enhancements)
	}
}

func TestSessionGroupsEnhancementActivatorAliasesByCanonicalComponent(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	entryFile := filepath.Join(root, "entry.tsx")
	entrySource := `
		import * as motion from "./motion.js" with { type: "exact-enhancement" };
		export const view = (
			<section motion:fade={false} motion:slide-up={{ distance: 24 }} motion:duration={180} />
		);
	`
	for filename, source := range map[string]string{
		configFile: `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		entryFile:  entrySource,
		filepath.Join(root, "motion.ts"): `
			export { fade, slideUp } from "./motion-capability.js";
		`,
		filepath.Join(root, "motion-capability.ts"): `
			export { TransitionMotion as fade, TransitionMotion as slideUp }
				from "./motion-implementation.js" with { type: "exact-enhancement" };
		`,
		filepath.Join(root, "motion-implementation.ts"): `
			export function TransitionMotion(props: {
				fade?: boolean;
				slideUp?: true | { distance: number };
				duration?: number;
				children?: unknown;
			}) { return props.children; }
		`,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	response := NewSession().Execute(Request{
		ID: entryFile, Kind: "compile", Source: entrySource, ConfigFile: configFile,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Severity == "error" {
			t.Fatalf("canonical enhancement activators produced an error: %#v", response.Diagnostics)
		}
	}
	if strings.Count(response.Code, "createEnhancementNode") != 1 {
		t.Fatalf("canonical activator aliases did not produce one grouped marker:\n%s", response.Code)
	}
	for _, expected := range []string{"fade:", "slideUp:", "distance: 24", "duration:"} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("canonical activator group omitted %q:\n%s", expected, response.Code)
		}
	}
	if len(response.Analysis.Enhancements) != 1 {
		t.Fatalf("canonical activator aliases produced duplicate metadata: %#v", response.Analysis.Enhancements)
	}
	if response.Analysis.Enhancements[0].Identity != "./motion-capability.js#fade" ||
		response.Analysis.Enhancements[0].ExportName != "fade" {
		t.Fatalf("canonical activator aliases selected an unstable representative: %#v", response.Analysis.Enhancements)
	}
}

func TestSessionSuppressesDefaultEnhancementWhenNamedActivatorIsPresent(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	entryFile := filepath.Join(root, "entry.tsx")
	entrySource := `
		import * as motion from "./motion.js" with { type: "exact-enhancement" };
		export const implicit = <section motion:duration={100} />;
		export const selected = <section motion:fade motion:duration={200} />;
	`
	for filename, source := range map[string]string{
		configFile: `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		entryFile:  entrySource,
		filepath.Join(root, "motion.ts"): `
			export { DefaultMotion as default, FadeMotion as fade }
				from "./motion-implementation.js" with { type: "exact-enhancement" };
		`,
		filepath.Join(root, "motion-implementation.ts"): `
			export function DefaultMotion(props: { duration?: number; children?: unknown }) { return props.children; }
			export function FadeMotion(props: { duration?: number; children?: unknown }) { return props.children; }
		`,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	response := NewSession().Execute(Request{
		ID: entryFile, Kind: "compile", Source: entrySource, ConfigFile: configFile,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Severity == "error" {
			t.Fatalf("default and named enhancement selection produced an error: %#v", response.Diagnostics)
		}
	}
	if strings.Count(response.Code, `identity: "./motion.js#default"`) != 1 {
		t.Fatalf("default enhancement was not limited to the unactivated boundary:\n%s", response.Code)
	}
	if strings.Count(response.Code, `identity: "./motion.js#fade"`) != 1 {
		t.Fatalf("named activator did not suppress the default enhancement:\n%s", response.Code)
	}
}

func TestSessionLowersOrdinaryTargetBoundariesAndRequiresChildren(t *testing.T) {
	valid := NewSession().Execute(Request{
		ID: "target.tsx", Kind: "compile",
		Source: `export const view = <_target className="surface"><button>Save</button></_target>;`,
	})
	if valid.Error != "" {
		t.Fatal(valid.Error)
	}
	if !strings.Contains(valid.Code, "createCompiledTarget") || strings.Contains(valid.Code, `"_target"`) {
		t.Fatalf("_target was not lowered as a transparent target boundary:\n%s", valid.Code)
	}
	missing := NewSession().Execute(Request{
		ID: "missing-target.tsx", Kind: "compile", Source: `export const view = <_target />;`,
	})
	if !containsDiagnosticCode(missing.Diagnostics, "EXACT6016") {
		t.Fatalf("childless _target was accepted: %#v", missing.Diagnostics)
	}
	targetBinding := NewSession().Execute(Request{
		ID: "target-binding.tsx", Kind: "compile",
		Source: `export const view = <_target open:onOpenChanged={state.open}><button>Save</button></_target>;`,
	})
	if containsDiagnosticCode(targetBinding.Diagnostics, "EXACT_COMPONENT_BINDING") {
		t.Fatalf("_target was treated as a generic component binding boundary: %#v", targetBinding.Diagnostics)
	}
}

func TestSessionValidatesAttributedEnhancementComponentSchemas(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	componentFile := filepath.Join(root, "enhancements.ts")
	implementationFile := filepath.Join(root, "enhancement-implementations.ts")
	entryFile := filepath.Join(root, "entry.tsx")
	for filename, source := range map[string]string{
		configFile:         `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		componentFile:      `export { motion, open, value } from "./enhancement-implementations.js" with { type: "exact-enhancement" };`,
		implementationFile: `export function motion(props: { layoutId?: string; children?: unknown }) { return props.children; } export function open(props: { [key: string]: unknown }) { return props; } export const value = 1;`,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	compile := func(source string) Response {
		if err := os.WriteFile(entryFile, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
		return NewSession().Execute(Request{
			ID:         entryFile,
			Kind:       "compile",
			Source:     source,
			ConfigFile: configFile,
		})
	}

	unknown := compile(`import { motion } from "./enhancements.js" with { type: "exact-enhancement" }; export const view = <div motion:unknown />;`)
	if !containsDiagnosticCode(unknown.Diagnostics, "EXACT6007") {
		t.Fatalf("unknown enhancement prop was accepted: %#v", unknown.Diagnostics)
	}
	reserved := compile(`import { motion } from "./enhancements.js" with { type: "exact-enhancement" }; export const view = <div motion:key="x" />;`)
	if !containsDiagnosticCode(reserved.Diagnostics, "EXACT6006") {
		t.Fatalf("reserved enhancement prop was accepted: %#v", reserved.Diagnostics)
	}
	ordinary := compile(`import { motion } from "./enhancements.js"; export const view = <div motion:layout-id="x" />;`)
	if !containsDiagnosticCode(ordinary.Diagnostics, "EXACT6005") {
		t.Fatalf("ordinary import established a enhancement prefix: %#v", ordinary.Diagnostics)
	}
	open := compile(`import { open as field } from "./enhancements.js" with { type: "exact-enhancement" }; export const view = <div field:anything />;`)
	if !containsDiagnosticCode(open.Diagnostics, "EXACT6004") {
		t.Fatalf("open enhancement prop schema was accepted: %#v", open.Diagnostics)
	}
	nonComponent := compile(`import { value as field } from "./enhancements.js" with { type: "exact-enhancement" }; export const view = <div field:anything />;`)
	if !containsDiagnosticCode(nonComponent.Diagnostics, "EXACT6004") {
		t.Fatalf("non-component plugin capability was accepted: %#v", nonComponent.Diagnostics)
	}
	openSpread := compile(`import { motion } from "./enhancements.js" with { type: "exact-enhancement" }; const props: Record<string, unknown> = {}; export const view = <div {...props} />;`)
	if !containsDiagnosticCode(openSpread.Diagnostics, "EXACT6008") {
		t.Fatalf("open enhancement spread key space was accepted: %#v", openSpread.Diagnostics)
	}
}

func TestSessionAcceptsTypedAnalyzerOnlyEnhancementFieldsWithoutRuntimeComposition(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	capabilityFile := filepath.Join(root, "enhancements.ts")
	implementationFile := filepath.Join(root, "enhancement-implementation.ts")
	entryFile := filepath.Join(root, "entry.tsx")
	for filename, source := range map[string]string{
		configFile:     `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		capabilityFile: `export { intl as default } from "./enhancement-implementation.js" with { type: "exact-enhancement" };`,
		implementationFile: `
			interface IntlProps {
				/** @exact analyzer-only */
				fragment?: string;
				message?: true | string;
				children?: unknown;
			}
			export function intl(props: IntlProps) { return props.children; }
		`,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	compile := func(source string) Response {
		if err := os.WriteFile(entryFile, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
		return NewSession().Execute(Request{
			ID: entryFile, Kind: "compile", Source: source, ConfigFile: configFile,
		})
	}
	valid := compile(`import intl from "./enhancements.js" with { type: "exact-enhancement" }; declare function Badge(): unknown; export const view = <_ intl:fragment="report"><Badge /></_>;`)
	for _, diagnostic := range valid.Diagnostics {
		if diagnostic.Severity == "error" {
			t.Fatalf("analyzer-only enhancement field produced an error: %#v", valid.Diagnostics)
		}
	}
	if strings.Contains(valid.Code, "createEnhancementNode") || strings.Contains(valid.Code, "intl:fragment") {
		t.Fatalf("analyzer-only enhancement field reached runtime output:\n%s", valid.Code)
	}
	if containsDiagnosticCode(valid.Diagnostics, "EXACT_COMPONENT_BINDING") {
		t.Fatalf("analyzer-only enhancement field was treated as component binding shorthand: %#v", valid.Diagnostics)
	}
	invalid := compile(`import intl from "./enhancements.js" with { type: "exact-enhancement" }; export const view = <strong intl:fragment={42}>Report</strong>;`)
	if !containsDiagnosticCode(invalid.Diagnostics, "EXACT6011") {
		t.Fatalf("invalid analyzer-only enhancement field value was accepted: %#v", invalid.Diagnostics)
	}
}

func TestSessionLowersTimeEnhancementClockReadsToRangeActivation(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	entryFile := filepath.Join(root, "entry.tsx")
	packageRoot := filepath.Join(root, "node_modules", "@exactjs", "time")
	intlRoot := filepath.Join(root, "node_modules", "@exactjs", "intl")
	entrySource := `
		import * as time from "@exactjs/time/enhancements" with { type: "exact-enhancement" };
		import * as intl from "@exactjs/intl/enhancements" with { type: "exact-enhancement" };
		declare namespace Temporal {
			interface Instant {
				readonly epochMilliseconds: number;
				until(other: Instant): Duration;
				since(other: Instant): Duration;
			}
			class Duration { constructor(...values: number[]); round(options: { smallestUnit: string; roundingMode?: string }): Duration }
			namespace Now { function instant(): Instant }
		}
		declare namespace Intl {
			class DurationFormat { constructor(locale?: string, options?: object); format(value: Temporal.Duration): string }
		}
		const elapsedSeconds = (startedAt: number, now: number) => Math.floor((now - startedAt) / 1000);
		export function Countdown(deadline: Date) {
			return () => <time time:update="second">{Math.ceil((deadline.getTime() - Date.now()) / 1000)}</time>;
		}
		export function Sliding(startedAt: number) {
			const seconds = Math.floor((Date.now() - startedAt) / 1000);
			return () => <time time:update>{seconds < 60 ? seconds + " seconds ago" : Math.floor((Date.now() - startedAt) / 60000) + " minutes ago"}</time>;
		}
		export function SignedSliding(anchor: number) {
			const seconds = Math.floor((Date.now() - anchor) / 1000);
			const minutes = Math.floor((Date.now() - anchor) / 60000);
			return () => <time time:update>{Math.abs(seconds) < 60 ? seconds + " seconds" : minutes + " minutes"}</time>;
		}
		export function CalendarYear() {
			return () => <time time:update>{new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" }).format(new Date())}</time>;
		}
		export function NativeClock() {
			return () => <time time:update>{new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "numeric", second: "numeric", timeZone: "UTC" })}</time>;
		}
		export function TemporalElapsed(startedAt: Temporal.Instant) {
			return () => <time time:update>{Math.floor((Temporal.Now.instant().epochMilliseconds - startedAt.epochMilliseconds) / 1000)}</time>;
		}
		export function DurationElapsed(startedAt: number) {
			const seconds = Math.floor((Date.now() - startedAt) / 1000);
			return () => <time time:update>{new Intl.DurationFormat("en-US", { style: "short" }).format(new Temporal.Duration(0, 0, 0, 0, 0, 0, seconds))}</time>;
		}
		export function TemporalCountdown(deadline: Temporal.Instant) {
			return () => <time time:update>{new Intl.DurationFormat("en-US", { style: "short" }).format(
				Temporal.Now.instant().until(deadline).round({ smallestUnit: "second" })
			)}</time>;
		}
		export function HelperElapsed(startedAt: number) {
			return () => <time time:update>{elapsedSeconds(startedAt, Date.now())}</time>;
		}
		export function DestructuredElapsed(startedAt: number) {
			const timing = { seconds: Math.floor((Date.now() - startedAt) / 1000) };
			const { seconds } = timing;
			return () => <time time:update>{seconds}</time>;
		}
		export function ArrayElapsed(startedAt: number) {
			const timing = [Math.floor((Date.now() - startedAt) / 1000)] as const;
			const [seconds] = timing;
			return () => <time time:update>{seconds}</time>;
		}
		export function ReusedCountdown(first: Date, second: Date) {
			const Countdown = (props: { deadline: Date }) => (
				<time time:update>{Math.ceil((props.deadline.getTime() - Date.now()) / 1000)}</time>
			);
			return () => <><Countdown deadline={first} /><Countdown deadline={second} /></>;
		}
		export function LocalizedRelease(releaseDate: Date) {
			const releaseSeconds = Math.floor((Date.now() - releaseDate.getTime()) / 1000);
			const releaseMinutes = Math.floor((Date.now() - releaseDate.getTime()) / 60000);
			const releaseHours = Math.floor((Date.now() - releaseDate.getTime()) / 3600000);
			const releaseDays = Math.floor((Date.now() - releaseDate.getTime()) / 86400000);
			const releaseWeeks = Math.floor((Date.now() - releaseDate.getTime()) / 604800000);
			const releaseMonths = Math.floor((Date.now() - releaseDate.getTime()) / 2592000000);
			const releaseYears = Math.floor((Date.now() - releaseDate.getTime()) / 31536000000);
			return () => <p intl:message="live-relative-time">Testbed release: <time time:update>{Math.abs(releaseSeconds) < 60
				? new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(-releaseSeconds, "second")
				: Math.abs(releaseMinutes) < 60
					? new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(-releaseMinutes, "minute")
					: Math.abs(releaseHours) < 24
						? new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(-releaseHours, "hour")
						: Math.abs(releaseDays) < 7
							? new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(-releaseDays, "day")
							: Math.abs(releaseWeeks) < 5
								? new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(-releaseWeeks, "week")
								: Math.abs(releaseMonths) < 12
									? new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(-releaseMonths, "month")
									: new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(-releaseYears, "year")}</time>.</p>;
		}
		export function LocalizedPair(first: Date, second: Date) {
			return () => <p intl:message>
				First <time time:update="second">{Math.ceil((first.getTime() - Date.now()) / 1000)}</time>,
				second <time time:update="minute">{Math.ceil((second.getTime() - Date.now()) / 60000)}</time>.
			</p>;
		}
	`
	if err := os.MkdirAll(filepath.Join(packageRoot, "dist"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(intlRoot, "dist"), 0o700); err != nil {
		t.Fatal(err)
	}
	for filename, source := range map[string]string{
		configFile: `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.tsx"]}`,
		entryFile:  entrySource,
		filepath.Join(packageRoot, "package.json"):            `{"name":"@exactjs/time","type":"module","exports":{"./enhancements":{"types":"./capability.d.ts","default":"./dist/components.js"}}}`,
		filepath.Join(packageRoot, "capability.d.ts"):         `export { TimeUpdate as update } from "./dist/components.js" with { type: "exact-enhancement" };`,
		filepath.Join(packageRoot, "dist", "components.d.ts"): `export type TimeUpdatePolicy = true | "auto" | "second" | "minute" | "disabled"; export declare function TimeUpdate(props: { update?: TimeUpdatePolicy; children?: unknown }): unknown;`,
		filepath.Join(intlRoot, "package.json"):               `{"name":"@exactjs/intl","type":"module","exports":{"./enhancements":{"types":"./capability.d.ts","default":"./dist/components.js"}}}`,
		filepath.Join(intlRoot, "capability.d.ts"):            `export { message } from "./dist/components.js" with { type: "exact-enhancement" };`,
		filepath.Join(intlRoot, "dist", "components.d.ts"):    `export declare function message(props: { message?: true | string; children?: unknown }): unknown;`,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	response := NewSession().Execute(Request{
		ID: entryFile, Kind: "compile", Source: entrySource, ConfigFile: configFile,
	})
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Severity == "error" {
			t.Fatalf("time enhancement lowering produced an error: %#v", response.Diagnostics)
		}
	}
	for _, expected := range []string{
		`from "@exactjs/time/internal"`,
		"createTimeActivation",
		"readEpochMilliseconds",
		`kind: "quantized"`,
		`kind: "threshold"`,
		`kind: "calendar"`,
		`unit: "year"`,
		`timeZone: "UTC"`,
		"startedAt + 60000",
		"anchor - 59000",
		"anchor + 60000",
		"anchorMilliseconds: { binding: 0 }",
		"quantumMilliseconds: 1000",
		`boundary: "half-expand-decreasing"`,
		"deadline.epochMilliseconds",
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("time lowering omitted %q:\n%s", expected, response.Code)
		}
	}
	if !strings.Contains(response.Code, "const seconds = __exactDerived(") ||
		!strings.Contains(response.Code, "const releaseMinutes = __exactDerived(") {
		t.Fatalf("retained clock-derived aliases lost their backing cells:\n%s", response.Code)
	}
	if strings.Contains(response.Code, "cached_seconds") || strings.Contains(response.Code, "releaseMinutes.get()") {
		t.Fatalf("time ranges read a setup snapshot instead of their range-local clock sample:\n%s", response.Code)
	}
	if !strings.Contains(response.Code, `readEpochMilliseconds([`) {
		t.Fatalf("adaptive range reads did not refresh compact plan inputs:\n%s", response.Code)
	}
	if activations := strings.Count(response.Code, "__exactCreateTimeActivation("); activations != 15 {
		t.Fatalf("time ranges allocated %d activations, want one per authored range:\n%s", activations, response.Code)
	}
	localizedStart := strings.Index(response.Code, "export function LocalizedRelease")
	if localizedStart < 0 {
		t.Fatalf("localized time range was not emitted:\n%s", response.Code)
	}
	localized := response.Code[localizedStart:]
	if !strings.Contains(localized, `kind: "quantized"`) || strings.Contains(localized, `kind: "continuous"`) {
		t.Fatalf("localized time range did not retain its inferred minute plan:\n%s", localized)
	}
	pairStart := strings.Index(response.Code, "export function LocalizedPair")
	if pairStart < 0 {
		t.Fatalf("localized time pair was not emitted:\n%s", response.Code)
	}
	localizedSingle := response.Code[localizedStart:pairStart]
	if activations := strings.Count(localizedSingle, "__exactCreateTimeActivation("); activations != 1 {
		t.Fatalf("one localized authored range allocated %d activations, want one:\n%s", activations, localizedSingle)
	}
	if strings.Contains(localizedSingle, "__exactTimeRange[") {
		t.Fatalf("one localized authored range was incorrectly lowered as an activation array:\n%s", localizedSingle)
	}
	pair := response.Code[pairStart:]
	for _, expected := range []string{
		`update: __exactTimeRange[0]`,
		`update: __exactTimeRange[1]`,
		`__exactTimeRange[0].readEpochMilliseconds([first.getTime()])`,
		`__exactTimeRange[1].readEpochMilliseconds([second.getTime()])`,
	} {
		if !strings.Contains(pair, expected) {
			t.Fatalf("localized time pair did not retain independent range %q:\n%s", expected, pair)
		}
	}
	authoredPackageSource := `
		export function PackageLocalizedRelease(releaseDate: Date) {
			const releaseMinutes = Math.round((releaseDate.getTime() - Date.now()) / 60000);
			return () => <p intl:message><time time:update>{new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(releaseMinutes, "minute")}</time></p>;
		}
	`
	packageSource := authoredPackageSource + `
		import * as time from "@exactjs/time/enhancements" with { type: "exact-enhancement" };
		import * as intl from "@exactjs/intl/enhancements" with { type: "exact-enhancement" };
	`
	packageResponse := NewSession().Execute(Request{
		ID: entryFile, Kind: "compile", Source: packageSource, ConfigFile: configFile,
		PackageEnhancementBoundary: len(authoredPackageSource),
	})
	for _, diagnostic := range packageResponse.Diagnostics {
		if diagnostic.Severity == "error" {
			t.Fatalf("package-scoped Intl/time alias lowering produced an error: %#v", packageResponse.Diagnostics)
		}
	}
	opaqueSource := `
		import * as time from "@exactjs/time/enhancements" with { type: "exact-enhancement" };
		declare function arbitraryFormatter(value: number): string;
		declare const ordinaryValue: number;
		declare namespace Temporal {
			interface Instant { until(other: Instant): Duration }
			interface Duration { round(options: { smallestUnit: string }): Duration }
			namespace Now { function instant(): Instant }
		}
		declare const deadline: Temporal.Instant;
		export const opaque = <output time:update>{arbitraryFormatter(Date.now())}</output>;
		export const explicitOpaque = <output time:update="second">{arbitraryFormatter(Date.now())}</output>;
		export const unavailablePrecision = <output time:update>{Temporal.Now.instant().until(deadline).round({ smallestUnit: "microsecond" })}</output>;
		export const missing = <output time:update="second">Static</output>;
		export const missingExpression = <output time:update="second">{ordinaryValue}</output>;
	`
	if err := os.WriteFile(entryFile, []byte(opaqueSource), 0o600); err != nil {
		t.Fatal(err)
	}
	invalid := NewSession().Execute(Request{
		ID: entryFile, Kind: "compile", Source: opaqueSource, ConfigFile: configFile,
	})
	if !containsDiagnosticCode(invalid.Diagnostics, "EXACT_TIME_AUTO") {
		t.Fatalf("unbounded automatic time update was accepted: %#v", invalid.Diagnostics)
	}
	if !containsDiagnosticCode(invalid.Diagnostics, "EXACT_TIME_UNSAFE") {
		t.Fatalf("effectful clock reevaluation was accepted: %#v", invalid.Diagnostics)
	}
	if !containsDiagnosticCode(invalid.Diagnostics, "EXACT_TIME_PRECISION") {
		t.Fatalf("unavailable clock precision was accepted: %#v", invalid.Diagnostics)
	}
	if !containsDiagnosticCode(invalid.Diagnostics, "EXACT_TIME_NO_CLOCK") {
		t.Fatalf("clock-free time update was accepted: %#v", invalid.Diagnostics)
	}
}

func TestSessionRejectsEnhancementAndComponentBindingAmbiguity(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	entryFile := filepath.Join(root, "entry.tsx")
	enhancementFile := filepath.Join(root, "enhancement.ts")
	implementationFile := filepath.Join(root, "enhancement-implementation.ts")
	entrySource := `
		import { mode } from "./enhancement.js" with { type: "exact-enhancement" };
		type WidgetProps = { mode: boolean; toggle(next: boolean): void };
		declare function Widget(props: WidgetProps): unknown;
		export function View(this: Component<{ enabled: boolean }>) {
			return () => <Widget mode:toggle={this.state.enabled} />;
		}
	`
	for filename, source := range map[string]string{
		configFile: `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		entryFile:  entrySource,
		enhancementFile: `
			export { mode, value } from "./enhancement-implementation.js" with { type: "exact-enhancement" };
		`,
		implementationFile: `
			export function mode(props: { toggle?: boolean; children?: unknown }) { return props.children; }
			export function value(props: { tone?: string; children?: unknown }) { return props.children; }
		`,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	response := NewSession().Execute(Request{
		ID: entryFile, Kind: "compile", Source: entrySource, ConfigFile: configFile,
	})
	if !containsDiagnosticCode(response.Diagnostics, "EXACT_COMPONENT_BINDING") {
		t.Fatalf("ambiguous enhancement and component binding was accepted: %#v", response.Diagnostics)
	}
	foundMessage := false
	for _, diagnostic := range response.Diagnostics {
		if strings.Contains(diagnostic.Message, "ambiguous between component props") {
			foundMessage = true
			break
		}
	}
	if !foundMessage {
		t.Fatalf("ambiguity diagnostic omitted both interpretations: %#v", response.Diagnostics)
	}
	for _, source := range []string{
		`import { mode } from "./enhancement.js" with { type: "exact-enhancement" };
		 type WidgetProps = { label: string }; declare function Widget(props: WidgetProps): unknown;
		 export const view = <Widget mode:toggle />;`,
		`import { value } from "./enhancement.js" with { type: "exact-enhancement" };
		 export const view = <input value:tone="quiet" />;`,
	} {
		if err := os.WriteFile(entryFile, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
		enhancementOnly := NewSession().Execute(Request{
			ID: entryFile, Kind: "compile", Source: source, ConfigFile: configFile,
		})
		if containsDiagnosticCode(enhancementOnly.Diagnostics, "EXACT_COMPONENT_BINDING") ||
			containsDiagnosticCode(enhancementOnly.Diagnostics, "EXACT_FORM_BINDING") {
			t.Fatalf("valid enhancement was misclassified as a value binding: %#v", enhancementOnly.Diagnostics)
		}
	}
}

func TestSessionSemanticallyChecksUntransformedModulesDuringCompilation(t *testing.T) {
	source := `export const answer: string = 42;`
	response := NewSession().Execute(Request{
		ID:          filepath.Join(t.TempDir(), "model.ts"),
		Kind:        "compile",
		Source:      source,
		Diagnostics: "semantic",
	})
	if !containsDiagnosticCode(response.Diagnostics, "TS2322") {
		t.Fatalf("semantic compilation omitted ordinary TypeScript diagnostics: %#v", response.Diagnostics)
	}
}

func TestSessionAttributesComponentBindingWritesToCallbackCallable(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	entryFile := filepath.Join(root, "entry.tsx")
	if err := os.WriteFile(configFile, []byte(`{"compilerOptions":{"target":"es2022","jsx":"preserve"},"include":["*.tsx"]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	compile := func(body string) Response {
		source := `
			declare class Component<S extends object> { state: S; }
			type DialogProps = { open: boolean; onOpenChanged(open: boolean): void };
			declare function Dialog(props: DialogProps): unknown;
			export function View(this: Component<{ open: boolean }>) {
				return () => ` + body + `;
			}
		`
		if err := os.WriteFile(entryFile, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
		return NewSession().Execute(Request{
			ID: entryFile, Kind: "compile", Source: source, ConfigFile: configFile,
		})
	}
	shorthand := compile(`<Dialog open:onOpenChanged={this.state.open} />`)
	explicit := compile(`<Dialog open={this.state.open} onOpenChanged={(open) => { this.state.open = open; }} />`)
	callbackShape := func(response Response) (string, string, int) {
		for _, callable := range response.Analysis.Callables {
			if callable.Kind != "function" || len(callable.StateWrites) != 1 ||
				callable.StateWrites[0].Path != "open" {
				continue
			}
			return callable.DirectEffect, callable.StateWrites[0].Operation, len(callable.ArtifactTargets)
		}
		return "missing", "missing", -1
	}
	shorthandEffect, shorthandOperation, shorthandTargets := callbackShape(shorthand)
	explicitEffect, explicitOperation, explicitTargets := callbackShape(explicit)
	if shorthandEffect == "missing" || explicitEffect == "missing" {
		t.Fatalf("callback callable missing: shorthand=%#v explicit=%#v", shorthand.Analysis.Callables, explicit.Analysis.Callables)
	}
	if shorthandEffect != explicitEffect || shorthandOperation != explicitOperation || shorthandTargets != explicitTargets {
		t.Fatalf(
			"binding callback analysis differs from explicit lambda: shorthand=%q/%q/%d explicit=%q/%q/%d",
			shorthandEffect, shorthandOperation, shorthandTargets,
			explicitEffect, explicitOperation, explicitTargets,
		)
	}
}

func TestSessionPartitionsFiniteEnhancementSpreads(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	entryFile := filepath.Join(root, "entry.tsx")
	componentFile := filepath.Join(root, "motion.ts")
	implementationFile := filepath.Join(root, "motion-implementation.ts")
	entrySource := `
		import { motion } from "./motion.js" with { type: "exact-enhancement" };
		const effects = { "motion:layout-id": "card", "motion:disabled": false, title: "Card" };
		export const view = <article {...effects} />;
	`
	for filename, source := range map[string]string{
		configFile:         `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		entryFile:          entrySource,
		componentFile:      `export { motion } from "./motion-implementation.js" with { type: "exact-enhancement" };`,
		implementationFile: `export function motion(props: { layoutId?: string; disabled?: boolean; children?: unknown }) { return props.children; }`,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	response := NewSession().Execute(Request{
		ID:         entryFile,
		Kind:       "compile",
		Source:     entrySource,
		ConfigFile: configFile,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Severity == "error" {
			t.Fatalf("finite enhancement spread produced an error: %#v", response.Diagnostics)
		}
	}
	for _, expected := range []string{
		"omitKnownProps",
		"createEnhancementNode",
		"layoutId:",
		"disabled:",
		`title: "Card"`,
	} {
		if !strings.Contains(response.Code, expected) {
			t.Fatalf("finite enhancement spread omitted %q:\n%s", expected, response.Code)
		}
	}
}

func TestSessionChecksEnhancementPropTypesAndUnionCorrelation(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	entryFile := filepath.Join(root, "entry.tsx")
	componentFile := filepath.Join(root, "motion.ts")
	implementationFile := filepath.Join(root, "motion-implementation.ts")
	for filename, source := range map[string]string{
		configFile:    `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		componentFile: `export { motion } from "./motion-implementation.js" with { type: "exact-enhancement" };`,
		implementationFile: `
			type MotionProps =
				| { kind: "spring"; stiffness?: number; children?: unknown }
				| { kind: "tween"; duration?: "fast" | "slow"; delay?: ` + "`${number}ms`" + `; children?: unknown };
			export function motion(props: MotionProps) { return props.children; }
		`,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	compile := func(source string) Response {
		if err := os.WriteFile(entryFile, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
		return NewSession().Execute(Request{
			ID: entryFile, Kind: "compile", Source: source, ConfigFile: configFile,
		})
	}
	valid := compile(`
		import { motion } from "./motion.js" with { type: "exact-enhancement" };
		const options:
			| { "motion:kind": "spring"; "motion:stiffness": number }
			| { "motion:kind": "tween"; "motion:duration": "fast" | "slow" } =
				{ "motion:kind": "spring", "motion:stiffness": 12 };
		export const direct = <div motion:kind="spring" motion:stiffness={20} />;
		export const template = <div motion:kind="tween" motion:delay="120ms" />;
		export const spread = <div {...options} />;
	`)
	if containsDiagnosticCode(valid.Diagnostics, "EXACT6011") {
		t.Fatalf("valid discriminated enhancement props were rejected: %#v", valid.Diagnostics)
	}
	wrongValue := compile(`
		import { motion } from "./motion.js" with { type: "exact-enhancement" };
		export const view = <div motion:kind="spring" motion:stiffness="strong" />;
	`)
	if !containsDiagnosticCode(wrongValue.Diagnostics, "EXACT6011") {
		t.Fatalf("invalid enhancement prop value was accepted: %#v", wrongValue.Diagnostics)
	}
	wrongTemplate := compile(`
		import { motion } from "./motion.js" with { type: "exact-enhancement" };
		export const view = <div motion:kind="tween" motion:delay="soon" />;
	`)
	if !containsDiagnosticCode(wrongTemplate.Diagnostics, "EXACT6011") {
		t.Fatalf("invalid enhancement template-literal prop was accepted: %#v", wrongTemplate.Diagnostics)
	}
	wrongCombination := compile(`
		import { motion } from "./motion.js" with { type: "exact-enhancement" };
		export const view = <div motion:kind="spring" motion:duration="fast" />;
	`)
	if !containsDiagnosticCode(wrongCombination.Diagnostics, "EXACT6011") {
		t.Fatalf("invalid enhancement prop union combination was accepted: %#v", wrongCombination.Diagnostics)
	}
	wrongSpread := compile(`
		import { motion } from "./motion.js" with { type: "exact-enhancement" };
		const options:
			| { "motion:kind": "spring"; "motion:duration": "fast" }
			| { "motion:kind": "tween"; "motion:duration": "fast" } =
				{ "motion:kind": "spring", "motion:duration": "fast" };
		export const view = <div {...options} />;
	`)
	if !containsDiagnosticCode(wrongSpread.Diagnostics, "EXACT6011") {
		t.Fatalf("invalid finite enhancement union spread was accepted: %#v", wrongSpread.Diagnostics)
	}
}

func TestSessionResolvesDefaultStarAndAmbiguousEnhancementExports(t *testing.T) {
	root := t.TempDir()
	configFile := filepath.Join(root, "tsconfig.json")
	entryFile := filepath.Join(root, "entry.tsx")
	for filename, source := range map[string]string{
		configFile: `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		filepath.Join(root, "default-implementation.ts"): `export default function motion(props: { preset?: "fade" | "slide"; children?: unknown }) { return props.children; }`,
		filepath.Join(root, "default-capability.ts"):     `export { default } from "./default-implementation.js" with { type: "exact-enhancement" };`,
		filepath.Join(root, "named-implementation.ts"):   `export function motion(props: { preset?: "fade" | "slide"; children?: unknown }) { return props.children; }`,
		filepath.Join(root, "star-capability.ts"):        `export * from "./named-implementation.js" with { type: "exact-enhancement" };`,
		filepath.Join(root, "left-capability.ts"):        `export { motion } from "./named-implementation.js" with { type: "exact-enhancement" };`,
		filepath.Join(root, "right-capability.ts"):       `export { motion } from "./named-implementation.js" with { type: "exact-enhancement" };`,
		filepath.Join(root, "ambiguous.ts"): `
			export { motion } from "./left-capability.js";
			export { motion } from "./right-capability.js";
		`,
	} {
		if err := os.WriteFile(filename, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	validSource := `
		import defaultMotion from "./default-capability.js" with { type: "exact-enhancement" };
		import { motion as starMotion } from "./star-capability.js" with { type: "exact-enhancement" };
		export const view = <button defaultMotion:preset="fade" starMotion:preset="slide" />;
	`
	if err := os.WriteFile(entryFile, []byte(validSource), 0o600); err != nil {
		t.Fatal(err)
	}
	valid := NewSession().Execute(Request{
		ID: entryFile, Kind: "compile", Source: validSource, ConfigFile: configFile,
	})
	for _, diagnostic := range valid.Diagnostics {
		if diagnostic.Severity == "error" {
			t.Fatalf("default or star enhancement export produced an error: %#v", valid.Diagnostics)
		}
	}
	identities := make(map[string]struct{}, len(valid.Analysis.Enhancements))
	for _, enhancement := range valid.Analysis.Enhancements {
		identities[enhancement.Identity] = struct{}{}
	}
	for _, identity := range []string{
		"./default-capability.js#default",
		"./star-capability.js#motion",
	} {
		if _, exists := identities[identity]; !exists {
			t.Fatalf("compiler omitted resolved enhancement identity %q: %#v", identity, valid.Analysis.Enhancements)
		}
	}

	ambiguousSource := `
		import { motion } from "./ambiguous.js" with { type: "exact-enhancement" };
		export const view = <button motion:preset="fade" />;
	`
	if err := os.WriteFile(entryFile, []byte(ambiguousSource), 0o600); err != nil {
		t.Fatal(err)
	}
	ambiguous := NewSession().Execute(Request{
		ID: entryFile, Kind: "compile", Source: ambiguousSource, ConfigFile: configFile,
	})
	if !containsDiagnosticCode(ambiguous.Diagnostics, "EXACT6010") {
		t.Fatalf("ambiguous enhancement export path was accepted: %#v", ambiguous.Diagnostics)
	}
}
