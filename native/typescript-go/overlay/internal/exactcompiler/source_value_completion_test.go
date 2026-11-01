package exactcompiler

import (
	"encoding/json"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// Resolved breaks skip work within their actual label and permit work after its
// exit. Unsupported jumps and exception regions cannot certify a producer.
func TestModuleProducerBranchCompletion(t *testing.T) {
	for _, test := range []struct {
		name, body        string
		possible, certain bool
	}{
		{"break", `done:{break done;MARK}`, false, true},
		{"break-selected", `done:{if(true)break done;MARK}`, false, true},
		{"break-skipped", `done:{if(false)break done;MARK}`, true, true},
		{"nested-label", `outer:{inner:{break outer;MARK}}`, false, true},
		{"label-completion", `done:{break done;}MARK`, true, true},
		{"break-before-return", `done:{break done;return;}MARK`, true, true},
		{"outer-after-inner", `outer:{inner:{break outer;}MARK}`, false, true},
		{"same-spelling", `done:{break done;}done:{break done;MARK}`, false, true},
		{"unknown-normal", `if(flag){}else{}MARK`, true, true},
		{"unknown-terminal", `if(flag)return;else throw new Error();MARK`, false, true},
		{"unknown-break", `done:{if(flag)break done;MARK}`, true, false},
		{"incomplete-before-terminal", `done:{if(flag)break done;return;}MARK`, true, false},
		{"label-return", `done:{return;}MARK`, false, true},
		{"block-return", `{return;}MARK`, false, true},
		{"throw", `throw new Error();MARK`, false, true},
		{"continue", `for(let i=0;i<1;i++){continue;MARK}`, true, false},
		{"loop-break", `while(true){break;MARK}`, true, false},
		{"switch-break", `switch(1){case 1:break;MARK}`, true, false},
		{"finally", `try{return;}finally{MARK}`, true, false},
		{"finally-after", `try{}finally{}MARK`, true, false},
		{"nested-block", `{{MARK}}`, true, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			session := NewSession()
			source := `declare const flag:boolean;function run(){let marker=0;` + strings.ReplaceAll(test.body, "MARK", `marker=1;`) + `}`
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/completion.ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("invalid witness: %#v", response)
			}
			found := false
			for _, project := range session.projects {
				owner := project.callableCache.owner.values
				walkNode(project.program.GetSourceFile("/virtual/completion.ts").AsNode(), func(node *ast.Node) bool {
					if ast.IsAssignmentExpression(node, false) {
						query := sourceValueQuery{owner: owner, remaining: 4096}
						possible, certain := query.reachable(node, nil)
						if possible != test.possible || certain != test.certain {
							t.Fatalf("possible=%v certain=%v", possible, certain)
						}
						found = true
					}
					return true
				})
			}
			if !found {
				t.Fatal("missing assignment")
			}
		})
	}
}

// Later unowned effects cannot retarget a value acquired in an earlier module
// statement. A callable or repeated acquisition has no such lexical guarantee.
func TestModuleProducerBranchIntrinsicOrder(t *testing.T) {
	for _, test := range []struct {
		name, source string
		known        bool
	}{
		{"later-call", `declare function foreign():void;export const value=Number("1");foreign();`, true},
		{"earlier-call", `declare function foreign():void;foreign();export const value=Number("1");`, false},
		{"same-statement", `declare function foreign():void;export const value=(Number("1"),foreign());`, false},
		{"callable", `declare function foreign():void;export function value(){return Number("1")}foreign();`, false},
		{"repeated", `declare function foreign():void;for(let i=0;i<1;i++){Number("1");foreign();}`, false},
		{"exception", `declare function foreign():void;try{Number("1")}finally{foreign();}`, false},
		{"later-constructor", `export const value=Number("1");new (class {})();`, true},
		{"later-tag", "function tag(parts:TemplateStringsArray){}export const value=Number(\"1\");tag``;", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/intrinsic-order.ts", Source: test.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("invalid witness: %#v", response)
			}
			found := false
			for _, project := range session.projects {
				owner := project.callableCache.owner.values
				for _, node := range owner.index(project.program.GetSourceFile("/virtual/intrinsic-order.ts")).calls {
					target := node.AsCallExpression().Expression
					if !ast.IsIdentifier(target) || target.Text() != "Number" {
						continue
					}
					query := sourceValueQuery{owner: owner, remaining: 4096}
					known, truthy, _ := query.literalDecision(node, nil)
					if known != test.known || known && !truthy {
						t.Fatalf("known=%v truthy=%v", known, truthy)
					}
					found = true
				}
			}
			if !found {
				t.Fatal("missing Number call")
			}
		})
	}
}

// Completion keeps finalizer return authority separate from a resolved jump.
// Invalid jumps exercise defensive resolution only, not supported source syntax.
func TestSourceLabelCompletionProjection(t *testing.T) {
	for _, test := range []struct {
		name, body string
		kind       sourceCompletionKind
		invalid    bool
	}{
		{"normal", `done:{break done;}`, sourceCompletionNormal, false},
		{"selected-then", `done:{if(true)break done;return;}`, sourceCompletionNormal, false},
		{"selected-else", `done:{if(false)return;else break done;}`, sourceCompletionNormal, false},
		{"selected-no-else", `if(false)return;`, sourceCompletionNormal, false},
		{"normal-merge", `if(flag){}else{}`, sourceCompletionNormal, false},
		{"terminal-merge", `if(flag)return;else throw new Error();`, sourceCompletionTerminal, false},
		{"terminal-normal", `if(flag)return;`, sourceCompletionIncomplete, false},
		{"break-normal", `done:{if(flag)break done;}`, sourceCompletionIncomplete, false},
		{"break-break", `done:{if(flag)break done;else break done;}`, sourceCompletionIncomplete, false},
		{"incomplete-prefix", `done:{if(flag)break done;return;}`, sourceCompletionIncomplete, false},
		{"label-return", `done:{break done;}return;`, sourceCompletionTerminal, false},
		{"continue", `outer:for(;;){continue outer;}`, sourceCompletionIncomplete, false},
		{"try", `try{return;}finally{}`, sourceCompletionIncomplete, false},
		{"unresolved", `break missing;`, sourceCompletionIncomplete, true},
		{"unnamed", `break;`, sourceCompletionIncomplete, true},
		{"cross-callable", `break outer;`, sourceCompletionIncomplete, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			session := NewSession()
			source := `declare const flag:boolean;outer:{function run(){` + test.body + `}}`
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/label-projection.ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) != test.invalid {
				t.Fatalf("diagnostics: %#v", response)
			}
			for _, project := range session.projects {
				owner := project.callableCache.owner.values
				walkNode(project.program.GetSourceFile("/virtual/label-projection.ts").AsNode(), func(node *ast.Node) bool {
					if !ast.IsFunctionDeclaration(node) {
						return true
					}
					query := sourceValueQuery{owner: owner, remaining: 4096}
					result := query.completion(node.Body(), nil)
					if result.kind != test.kind {
						t.Fatalf("outcome=%v want=%v", result.kind, test.kind)
					}
					query = sourceValueQuery{owner: owner, remaining: 4096}
					certain, possible := query.terminates(node.Body(), nil)
					if certain != (test.kind == sourceCompletionTerminal) || possible != (test.kind != sourceCompletionNormal) {
						t.Fatalf("projection=%v,%v", certain, possible)
					}
					query = sourceValueQuery{owner: owner, remaining: 0}
					if query.completion(node.Body(), nil).kind != test.kind {
						t.Fatal("advisory estimate changed completion")
					}
					if query.completion(nil, nil).kind != sourceCompletionIncomplete {
						t.Fatal("nil certified completion")
					}
					return true
				})
			}
		})
	}
}

// A required finalizer's own label can consume its break, but a raw break to an
// outer label remains incomplete for the legacy return/throw override consumer.
func TestSourceLabelFinalizerProjection(t *testing.T) {
	for _, test := range []struct {
		name, body string
		terminal   bool
	}{
		{"local-return", `try{return 1;}finally{done:{break done;}return 2;}`, true},
		{"outer-break", `outer:{try{return 1;}finally{break outer;}}`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/label-finalizer.ts", Source: `function run(){` + test.body + `}`, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("invalid witness: %#v", response)
			}
			for _, project := range session.projects {
				walkNode(project.program.GetSourceFile("/virtual/label-finalizer.ts").AsNode(), func(node *ast.Node) bool {
					if ast.IsTryStatement(node) {
						query := sourceValueQuery{owner: project.callableCache.owner.values, remaining: 4096}
						terminal, possible := query.terminates(node.AsTryStatement().FinallyBlock, nil)
						if terminal != test.terminal || !possible {
							t.Fatalf("projection=%v,%v", terminal, possible)
						}
					}
					return true
				})
			}
		})
	}
}

// Advisory estimates cannot change lexical target or containment authority.
func TestSourceLabelTargetAdvisoryEstimate(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/label-budget.ts", Source: `function run(){done:{{break done;}}}`, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("invalid witness: %#v", response)
	}
	for _, project := range session.projects {
		walkNode(project.program.GetSourceFile("/virtual/label-budget.ts").AsNode(), func(node *ast.Node) bool {
			if !ast.IsBreakStatement(node) {
				return true
			}
			target := node.Parent.Parent.Parent
			if !ast.IsLabeledStatement(target) {
				t.Fatal("missing lexical label")
			}
			for _, budget := range []int{0, 1, 4096} {
				query := sourceValueQuery{owner: project.callableCache.owner.values, remaining: budget}
				result := query.completion(node, nil)
				if result.kind != sourceCompletionBreak || result.target != target {
					t.Fatal("wrong lexical target")
				}
				query = sourceValueQuery{owner: project.callableCache.owner.values, remaining: budget}
				if !query.breakExits(target, node.Parent) {
					t.Fatal("advisory estimate changed containment")
				}
			}
			query := sourceValueQuery{owner: project.callableCache.owner.values, remaining: 4096}
			if query.breakExits(target, target.Parent) {
				t.Fatal("containment crossed callable")
			}
			query = sourceValueQuery{owner: project.callableCache.owner.values, remaining: 4096}
			if query.breakExits(target, project.program.GetSourceFile("/virtual/label-budget.ts").AsNode()) {
				t.Fatal("unowned containment")
			}
			return true
		})
	}
}

// Invocation-local return provenance can prove an acquisition before later module
// effects. It cannot borrow another call's prefix or ignore earlier replacement.
func TestModuleProducerInvocationAcquisitionOrder(t *testing.T) {
	factory := `function make(){const obj={item:{get value(){return document.title}}};if(Number("1"))return obj;obj.item={value:"safe"};return obj}`
	for _, test := range []struct {
		name, source string
		placements   map[string]string
	}{
		{"later-call", factory + `export const value=make().item.value;Math.abs(1);export const stable="safe";`, map[string]string{"value": "client", "stable": "isomorphic"}},
		{"earlier-call", factory + `Math.abs(1);export const value=make().item.value;`, map[string]string{"value": "unknown"}},
		{"two-occurrences", factory + `export const first=make().item.value;Math.abs(1);export const second=make().item.value;`, map[string]string{"first": "client", "second": "unknown"}},
		{"uncalled-opaque-body", factory + `function spare(){Math.abs(1)}export const value=make().item.value;`, map[string]string{"value": "unknown"}},
		{"unknown-order", factory + `declare function foreign():void;foreign();export const value=make().item.value;`, map[string]string{"value": "unknown"}},
		{"earlier-replacement", factory + `Object.defineProperty(globalThis,"Number",{value:()=>0,configurable:true,writable:true});export const value=make().item.value;`, map[string]string{"value": "unknown"}},
		{"acquired-before-replacement", `const selected=Number;Object.defineProperty(globalThis,"Number",{value:()=>0,configurable:true,writable:true});export const value=selected("1");`, map[string]string{"value": "isomorphic"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/invocation-order.ts", Source: test.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("invalid witness: %s %#v", response.Error, response.Diagnostics)
			}
			for name, want := range test.placements {
				found := false
				for _, exported := range response.Analysis.Exports {
					if exported.Name == name {
						found = true
						if exported.Placement != want {
							t.Errorf("%s placement=%s want=%s", name, exported.Placement, want)
						}
					}
				}
				if !found {
					t.Errorf("missing export %s", name)
				}
			}
		})
	}
}

// Numeric conversion can replace a later global binding only through a completed
// selected own method under the preserved startup prefix. Protocol uncertainty,
// opaque work and structural refusal retain the conservative boundary.
func TestNumericOwnValueOfStartup(t *testing.T) {
	for _, test := range []struct{ name, entry, helper, placement string }{
		{`original`, `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};`, `client`},
		{`no-write`, `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `export const foreign={valueOf(){return 0}};`, `unknown`},
		{`uncalled`, `import {foreign} from "./helper.js";function source(){+foreign}function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};`, `unknown`},
		{`own-protocol`, `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `export const foreign={[Symbol.toPrimitive](){return 0},valueOf(){globalThis.Number=()=>0;return 0}};`, `unknown`},
		{`inherited-protocol`, `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `Object.prototype[Symbol.toPrimitive]=()=>0;export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};`, `unknown`},
		{`accessor-selection`, `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `export const foreign={get valueOf(){return function(){globalThis.Number=()=>0;return 0}}};`, `unknown`},
		{`object-fallback-throw`, `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `export const foreign={valueOf(){globalThis.Number=()=>0;return {}},toString(){throw new Error("fallback")}};`, `unknown`},
		{`captured-callee`, `import {foreign} from "./helper.js";const selected=Number;function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(selected("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};`, `unknown`},
		{`unknown-startup`, `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `globalThis.__audit_noop?.();export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};`, `unknown`},
		{`global-descriptor`, `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `Object.defineProperty(globalThis,"Number",{get(){return ()=>1},configurable:true});export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};`, `unknown`},
		{`long-prefix`, strings.Replace(`import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `;function source()`, `;`+numericStartupNeutralPrefix()+`function source()`, 1), `export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};`, `client`},
	} {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			id := filepath.Join(root, "entry.ts")
			helper := filepath.Join(root, "helper.js")
			config := filepath.Join(root, "tsconfig.json")
			if err := os.WriteFile(config, []byte(`{"compilerOptions":{"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","strict":true,"skipLibCheck":true,"allowJs":true,"checkJs":false},"files":["entry.ts"]}`), 0600); err != nil {
				t.Fatal(err)
			}
			for path, source := range map[string]string{id: test.entry, helper: test.helper} {
				if err := os.WriteFile(path, []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
			}
			session := NewSession()
			for _, target := range []Target{TargetClient, TargetServer} {
				request := Request{Kind: "compile", Root: root, ConfigFile: config, ID: id, Source: test.entry, Target: target, Diagnostics: "semantic"}
				response := session.Execute(request)
				record, _ := json.Marshal(struct {
					Request  Request
					Response Response
				}{request, response})
				t.Log(string(record))
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("invalid witness: %s %#v", response.Error, response.Diagnostics)
				}
				found := false
				for _, exported := range response.Analysis.Exports {
					if exported.Name == "value" {
						found = true
						if exported.Placement != test.placement {
							t.Errorf("value placement=%s want=%s", exported.Placement, test.placement)
						}
					}
				}
				if !found {
					t.Fatal("missing value export analysis")
				}
				if test.placement == "client" && target == TargetServer && strings.Contains(response.Code, "export const value") {
					t.Error("server retained browser export")
				}
			}
			if test.name == "long-prefix" {
				source := `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`
				request := Request{Kind: "compile", Root: root, ConfigFile: config, ID: id, Source: source, Target: TargetServer, Diagnostics: "semantic"}
				response := session.Execute(request)
				record, _ := json.Marshal(struct {
					Request  Request
					Response Response
				}{request, response})
				t.Log(string(record))
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatal("restoration witness failed", response.Error, response.Diagnostics)
				}
				for _, exported := range response.Analysis.Exports {
					if exported.Name == "value" && exported.Placement != "client" {
						t.Errorf("prior estimate changed the next source occurrence: %s", exported.Placement)
					}
				}
			}
		})
	}
}

// numericStartupNeutralPrefix exhausts shared proof fuel through ordinary source
// initialization. It adds no executable unknown call or custom checker certificate.
func numericStartupNeutralPrefix() string {
	var source strings.Builder
	for index := 0; index < 1100; index++ {
		source.WriteString("const neutral")
		source.WriteString(strconv.Itoa(index))
		source.WriteString("=")
		source.WriteString(strconv.Itoa(index))
		source.WriteString(";")
	}
	return source.String()
}

// A final aliased declaration does not account for its re-export module's startup.
// A path into one activation cannot truncate an earlier activation of that body.
// Unproved intermediate initialization and overlapping calls stay conservative.
func TestNumericStartupModuleAndOccurrenceBoundaries(t *testing.T) {
	for _, test := range []struct {
		name, placement string
		files           map[string]string
	}{
		{name: `barrel-protocol`, placement: `unknown`, files: map[string]string{`barrel.js`: `export {foreign} from "./helper.js";Object.prototype[Symbol.toPrimitive]=function(){globalThis.Number=()=>0;return 0};`, `entry.ts`: `import {foreign} from "./barrel.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `helper.js`: `export const foreign={valueOf(){globalThis.Number=()=>1;return 0}};`}},
		{name: `barrel-descriptor`, placement: `unknown`, files: map[string]string{`barrel.js`: `export {foreign} from "./helper.js";Object.defineProperty(globalThis,"Number",{set(value){},get(){return ()=>0},configurable:true});`, `entry.ts`: `import {foreign} from "./barrel.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `helper.js`: `export const foreign={valueOf(){globalThis.Number=()=>1;return 0}};`}},
		{name: `barrel-neutral`, placement: `unknown`, files: map[string]string{`barrel.js`: `export {foreign} from "./helper.js";`, `entry.ts`: `import {foreign} from "./barrel.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `helper.js`: `export const foreign={valueOf(){globalThis.Number=()=>1;return 0}};`}},
		{name: `repeated-call-tail-typed`, placement: `unknown`, files: map[string]string{`entry.ts`: `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1")){globalThis.Number=(()=>0) as unknown as NumberConstructor;return obj;}obj.item={get value(){return document.title}};return obj}make();export const value=make().item.value;export const stable="safe";`, `helper.js`: `export const foreign={valueOf(){globalThis.Number=()=>1;return 0}};`}},
		{name: `repeated-call-tail-no-write`, placement: `unknown`, files: map[string]string{`entry.ts`: `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1")){return obj;}obj.item={get value(){return document.title}};return obj}make();export const value=make().item.value;export const stable="safe";`, `helper.js`: `export const foreign={valueOf(){globalThis.Number=()=>1;return 0}};`}},
		{name: `repeated-source`, placement: `client`, files: map[string]string{`entry.ts`: `import {foreign} from "./helper.js";function source(){+foreign}source();source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `helper.js`: `export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};`}},
		{name: `argument-interference-typed`, placement: `client`, files: map[string]string{`entry.ts`: `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number((globalThis.Number=(()=>1) as unknown as NumberConstructor,"1")))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `helper.js`: `export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};`}},
		{name: `later-import-unknown`, placement: `unknown`, files: map[string]string{`entry.ts`: `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";import {late} from "./late.js";`, `late.js`: `globalThis.Number=()=>1;export const late=0;`, `helper.js`: `export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};`}},
		{name: `inherited-accessor`, placement: `unknown`, files: map[string]string{`entry.ts`: `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `helper.js`: `Object.defineProperty(Object.prototype,Symbol.toPrimitive,{get(){return ()=>1},configurable:true});export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};`}},
		{name: `star-reexport`, placement: `unknown`, files: map[string]string{`entry.ts`: `import {foreign} from "./barrel.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `helper.js`: `export const foreign={valueOf(){globalThis.Number=()=>1;return 0}};`, `barrel.js`: `export * from "./helper.js";Object.prototype[Symbol.toPrimitive]=function(){globalThis.Number=()=>0;return 0};`}},
		{name: `cycle-initialization`, placement: `unknown`, files: map[string]string{`entry.ts`: `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";`, `helper.js`: `import "./cycle.js";export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};`, `cycle.js`: `import "./helper.js";`}},
		{name: `side-effect-import`, placement: `unknown`, files: map[string]string{`entry.ts`: `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";import "./side.js";`, `helper.js`: `export const foreign={valueOf(){globalThis.Number=()=>1;return 0}};`, `side.js`: `Object.prototype[Symbol.toPrimitive]=function(){globalThis.Number=()=>0;return 0};`}},
		{name: `direct-import-after-read`, placement: `client`, files: map[string]string{`entry.ts`: `function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;export const stable="safe";import {foreign} from "./helper.js";`, `helper.js`: `export const foreign={valueOf(){globalThis.Number=()=>0;return 0}};`}},
		{name: `nested-wrapper-tail`, placement: `unknown`, files: map[string]string{`entry.ts`: `import {foreign} from "./helper.js";function source(){+foreign}source();function make(){const obj={item:{value:"safe"}};if(Number("1")){globalThis.Number=(()=>0) as unknown as NumberConstructor;return obj;}obj.item={get value(){return document.title}};return obj}function before(){make()}before();export const value=make().item.value;export const stable="safe";`, `helper.js`: `export const foreign={valueOf(){globalThis.Number=()=>1;return 0}};`}},
	} {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			config := filepath.Join(root, "tsconfig.json")
			id := filepath.Join(root, "entry.ts")
			if err := os.WriteFile(config, []byte(`{"compilerOptions":{"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","strict":true,"skipLibCheck":true,"allowJs":true,"checkJs":false},"files":["entry.ts"]}`), 0600); err != nil {
				t.Fatal(err)
			}
			for name, source := range test.files {
				if err := os.WriteFile(filepath.Join(root, name), []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
			}
			session := NewSession()
			for _, target := range []Target{TargetClient, TargetServer} {
				request := Request{Kind: "compile", Root: root, ConfigFile: config, ID: id, Source: test.files["entry.ts"], Target: target, Diagnostics: "semantic"}
				response := session.Execute(request)
				record, _ := json.Marshal(struct {
					Request  Request
					Response Response
				}{request, response})
				t.Log(string(record))
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("invalid boundary witness: %s %#v", response.Error, response.Diagnostics)
				}
				found := false
				for _, exported := range response.Analysis.Exports {
					if exported.Name == "value" {
						found = true
						if exported.Placement != test.placement {
							t.Errorf("value placement=%s want=%s", exported.Placement, test.placement)
						}
					}
				}
				if !found {
					t.Fatal("missing value export analysis")
				}
				if test.placement == "client" && target == TargetServer && strings.Contains(response.Code, "export const value") {
					t.Error("server retained browser export")
				}
			}
		})
	}
}
