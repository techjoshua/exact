package exactcompiler

import (
	_ "embed"
	"os"
	"path/filepath"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

func withWriterInputGraph(t *testing.T, source string, inspect func(*sourceValueQuery, *ast.Node, *sourceWriterInputGraph)) {
	t.Helper()
	withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
		facts := []callableFacts{{node: q.effectOwner}}
		restore := registerWriterInputFacts(q.executable, facts)
		defer restore()
		inspect(q, call, facts[0].writerInputs)
	})
}

// Stable graph growth must be independent of repeated accepted use. A template
// result is a noncallable exposure even when interpolation evaluation is unknown.
// This test does not account for, execute or erase those original Call effects.
func TestWriterInputGraphRetiresDiscovery(t *testing.T) {
	for _, source := range []string{
		`export function invoke(name:string){return Symbol.for(name)}`,
		"export function invoke(name:string){return Symbol.for(`store/${name}`)}",
		`export function invoke(){return Object.defineProperties({}, {value:{get(){return document.title}}})}`,
	} {
		withWriterInputGraph(t, source, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
			// The unknown formal alone must not be treated as an observed primitive.
			r := q.registerWriterInputRequest(call)
			defer r.revoke()
			_, key := sourceLiteralMemberReference(call.Expression())
			template := call.AsCallExpression().Arguments.Nodes[0]
			if key == "for" && ast.IsIdentifier(template) {
				if r.excludeDiscovery(q, nil) {
					t.Fatal("unbound typed formal closed exposure")
				}
				return
			}
			if !r.excludeDiscovery(q, nil) {
				t.Fatal("covered source-only discovery was not retired")
			}
			nodes, edges, facts := g.stats.NewNodes, g.stats.NewEdges, g.stats.NewFacts
			for i := 0; i < 32; i++ {
				next := q.registerWriterInputRequest(call)
				covered := next.excludeDiscovery(q, nil)
				next.revoke()
				if !covered {
					t.Fatal("repeated use lost coverage")
				}
			}
			if g.stats.NewNodes != nodes || g.stats.NewEdges != edges || g.stats.NewFacts != facts || g.stats.DiscoveryRetired != 33 {
				t.Fatal("unchanged source recipe grew or replayed discovery", g.stats)
			}
		})
	}
}

// The body-entry relation deliberately joins rest positions. The transfer graph
// must preserve the actual selected group and each live capture on every use.
func TestWriterInputGraphOrderedRest(t *testing.T) {
	const source = `declare function foreign(value:unknown):void;function quiet(){}function writer(){document.title}export function invoke(...callbacks:(()=>void)[]){foreign(callbacks[0])}`
	withWriterInputGraph(t, source, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
		var quiet, writer *ast.Node
		walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(n *ast.Node) bool {
			if ast.IsFunctionDeclaration(n) {
				switch callableNameText(n.Name()) {
				case "quiet":
					quiet = n
				case "writer":
					writer = n
				}
			}
			return true
		})
		parameter := enclosingCallableNode(call).Parameters()[0]
		symbol := q.owner.checker.GetSymbolAtLocation(parameter.Name())
		if symbol == nil || quiet == nil || writer == nil {
			t.Fatal("missing rest endpoints")
		}
		a := sourceValueBindings{ast.GetSymbolId(symbol): {{node: parameter.Name(), rest: [][]sourceValue{{{node: quiet}}, {{node: writer}}}}}}
		b := sourceValueBindings{ast.GetSymbolId(symbol): {{node: parameter.Name(), rest: [][]sourceValue{{{node: writer}}, {{node: quiet}}}}}}
		r := q.registerWriterInputRequest(call)
		defer r.revoke()
		for _, row := range []struct {
			bindings sourceValueBindings
			want     *ast.Node
		}{{a, quiet}, {b, writer}, {a, quiet}} {
			values, ok := r.component(q, 0, row.bindings)
			if !ok || len(values) != 1 || values[0].node != row.want {
				t.Fatal("rest order collapsed", ok, values)
			}
		}
		old := q.reading
		q.reading = writer
		if _, ok := r.component(q, 0, b); ok {
			t.Fatal("another observation cut inherited component coverage")
		}
		q.reading = old
	})
}

// One uncovered actual cannot hide an independent known callable. The existing
// recovery consumer still strips unknown writer formals and retains its capture.
func TestWriterInputGraphIndependentDonor(t *testing.T) {
	const source = `declare function foreign(...values:unknown[]):void;declare function produce():unknown;function writer(){document.title}export function invoke(){foreign(produce(),writer)}`
	withWriterInputGraph(t, source, func(q *sourceValueQuery, last *ast.Node, g *sourceWriterInputGraph) {
		var call, writer *ast.Node
		walkNode(ast.GetSourceFileOfNode(last).AsNode(), func(n *ast.Node) bool {
			if ast.IsFunctionDeclaration(n) && callableNameText(n.Name()) == "writer" {
				writer = n
			}
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "foreign" {
				call = n
			}
			return true
		})
		if call == nil || writer == nil {
			t.Fatal("missing source endpoints")
		}
		q.reading, q.dependencyUse = call, call
		r := q.registerWriterInputRequest(call)
		defer r.revoke()
		if r.excludeDiscovery(q, nil) {
			t.Fatal("foreign or unobserved output closed exposure")
		}
		if _, ok := r.component(q, 0, nil); ok {
			t.Fatal("receiptless Call supplied a current value")
		}
		q.initializing = call
		part := accessorCandidates{}
		scopes := q.refusedMemberWriterScopes(writer, call, nil, &part, r)
		if len(scopes) != 1 || g.stats.RecoveryRetired == 0 {
			t.Fatal("independent known donor or actual recovery bypass missing", len(scopes), g.stats)
		}
		retired := g.stats.RecoveryRetired
		r.revoke()
		expiredPart := accessorCandidates{}
		expiredScopes := q.refusedMemberWriterScopes(writer, call, nil, &expiredPart, r)
		if len(expiredScopes) != 1 || g.stats.RecoveryRetired != retired {
			t.Fatal("expired request suppressed original donor recovery", len(expiredScopes), g.stats)
		}
	})
}

func TestWriterInputGraphUnsupportedBindings(t *testing.T) {
	for _, source := range []string{
		`declare function foreign(value:unknown):void;function writer(){document.title}export function invoke(callback:()=>void){callback=writer;foreign(callback)}`,
		`declare function foreign(value:unknown):void;function writer(){document.title}export function invoke(...callbacks:(()=>void)[]){callbacks[0]=writer;foreign(callbacks[0])}`,
		`declare function foreign(value:unknown):void;export function invoke(...callbacks:(()=>void)[]){const escape={callbacks};foreign(escape);foreign(callbacks[0])}`,
		`declare function foreign(value:unknown):void;export function invoke(input:{callback:()=>void}){foreign(input.callback)}`,
	} {
		withWriterInputGraph(t, source, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
			r := q.registerWriterInputRequest(call)
			defer r.revoke()
			if _, ok := r.component(q, 0, nil); ok {
				t.Fatal("mutable/projected input was silently covered")
			}
		})
	}
}

//go:embed source_writer_input_graph_fixture.ts
var writerInputOpaqueComposition string

// The three writer implementations and module prefix are copied byte-for-byte
// from the owned opaque-operation source. Only the final invocation driver is
// added. A type-only domain stub does not provide runtime or source-body proof.
func TestWriterInputGraphOpaqueComposition(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{"entry.ts": `export {invoke} from "./component-abi/opaque-operation";`})
	for name, source := range map[string]string{
		"component-abi/opaque-operation.ts": writerInputOpaqueComposition,
		"component/contract-versions.ts":    `export const componentContractVersion=6;`,
		"component/contracts.ts":            `export type ComponentDomainIdentity={readonly executionRoot:string};export type ComponentDomain=ComponentDomainIdentity;`,
	} {
		path := filepath.Join(f.root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		f.files[name] = source
	}
	request := f.request("analyze", "component-abi/opaque-operation.ts")
	// This terminal migration gate must finish through replacement consumers.
	// Known unmigrated recovery is a causal failure, rather than a timeout.
	request.stagedReplacement = true
	response := f.session.Execute(request)
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	seen := make(map[*sourceWriterInputGraph]bool)
	var retired uint64
	for _, project := range f.session.projects {
		if project.callableCache == nil {
			continue
		}
		for _, analysis := range project.callableCache.bySource {
			for _, fact := range analysis.facts {
				g := fact.writerInputs
				if g == nil || seen[g] {
					continue
				}
				seen[g] = true
				retired += g.stats.DiscoveryRetired + g.stats.RecoveryRetired
			}
		}
	}
	if retired == 0 {
		t.Fatal("composition added a graph without retiring original work")
	}
}

// Direct function carriers retain their own current capture. The graph stores
// neither capture map and cannot substitute another factory use's environment.
func TestWriterInputGraphCaptureOwnership(t *testing.T) {
	const source = `declare function foreign(value:unknown):void;function make(box:{value:number}){function writer(){box.value++}return writer}const first={value:1},second={value:2};const a=make(first),b=make(second);export function invoke(callback:()=>void){foreign(callback)}`
	withWriterInputGraph(t, source, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
		var maker, writer, first, second *ast.Node
		var calls []*ast.Node
		walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(n *ast.Node) bool {
			if ast.IsFunctionDeclaration(n) {
				switch callableNameText(n.Name()) {
				case "make":
					maker = n
				case "writer":
					writer = n
				}
			}
			if ast.IsObjectLiteralExpression(n) {
				if first == nil {
					first = n
				} else {
					second = n
				}
			}
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "make" {
				calls = append(calls, n)
			}
			return true
		})
		if maker == nil || writer == nil || first == nil || second == nil || len(calls) != 2 {
			t.Fatal("missing capture endpoints")
		}
		formal := q.owner.checker.GetSymbolAtLocation(enclosingCallableNode(call).Parameters()[0].Name())
		captured := q.owner.checker.GetSymbolAtLocation(maker.Parameters()[0].Name())
		if formal == nil || captured == nil {
			t.Fatal("missing capture symbols")
		}
		r := q.registerWriterInputRequest(call)
		defer r.revoke()
		q.initializing = call
		for i, object := range []*ast.Node{first, second, first} {
			origin := i % 2
			scope := &acquiredCallableScope{bindings: sourceValueBindings{ast.GetSymbolId(captured): {{node: object}}}, creators: map[*ast.Node]sourceValueCreation{maker: {invocation: calls[origin]}}}
			inputs := sourceValueBindings{ast.GetSymbolId(formal): {{node: writer, capture: scope}}}
			part := accessorCandidates{}
			result := q.refusedMemberWriterScopes(writer, call, inputs, &part, r)
			if len(result) != 1 || result[0].bindings[ast.GetSymbolId(captured)][0].node != object || result[0].creators[maker].invocation != calls[origin] {
				t.Fatal("capture transferred between uses")
			}
			result[0].bindings[ast.GetSymbolId(captured)] = nil
			if len(scope.bindings[ast.GetSymbolId(captured)]) != 1 {
				t.Fatal("published scope borrowed a live capture map")
			}
		}
	})
}

func TestWriterInputGraphDormantAndUnknown(t *testing.T) {
	for _, source := range []string{
		`function writer(){document.title}export function invoke(){return Object.freeze({writer})}`,
		`declare function foreign(value:unknown):void;declare const unknown:()=>void;function writer(){document.title}export function invoke(callback:()=>void){foreign(callback)}`,
	} {
		withWriterInputGraph(t, source, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
			r := q.registerWriterInputRequest(call)
			defer r.revoke()
			if ast.IsPropertyAccessExpression(call.Expression()) {
				if !r.excludeDiscovery(q, nil) || g.stats.KnownCallableOccurrences != 0 {
					t.Fatal("stored callback became an invocation")
				}
			} else {
				formal := q.owner.checker.GetSymbolAtLocation(enclosingCallableNode(call).Parameters()[0].Name())
				var writer *ast.Node
				walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(n *ast.Node) bool {
					if ast.IsFunctionDeclaration(n) && callableNameText(n.Name()) == "writer" {
						writer = n
					}
					return true
				})
				if formal == nil || writer == nil {
					t.Fatal("missing mixed alternatives")
				}
				values := sourceValueBindings{ast.GetSymbolId(formal): {{node: writer}, {}}}
				if _, ok := r.component(q, 0, values); ok {
					t.Fatal("known beside unknown was silently closed")
				}
			}
		})
	}
}

// A request is synchronous authority of one exact query, not a reusable tuple
// of source cuts. Copying the query or retaining a revoked request grants none.
func TestWriterInputGraphRequestLifetime(t *testing.T) {
	const source = `export function invoke(){return Symbol.for("key")}`
	withWriterInputGraph(t, source, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
		r := q.registerWriterInputRequest(call)
		defer r.revoke()
		if !r.excludeDiscovery(q, nil) {
			t.Fatal("issuer lost live authority")
		}
		copied := *q
		other := newSourceDependencyQuery(call, q.owner.checker, q.executable, q.effectOwner)
		for _, foreign := range []*sourceValueQuery{&copied, other} {
			if _, ok := r.component(foreign, 0, nil); ok {
				t.Fatal("nonissuer inherited component")
			}
			if r.excludeDiscovery(foreign, nil) {
				t.Fatal("nonissuer inherited discovery")
			}
			foreign.reading, foreign.initializing, foreign.returning = call, call, nil
			if r.atRecovery(foreign) {
				t.Fatal("nonissuer inherited recovery")
			}
		}
		q.reading, q.initializing, q.returning = call, call, nil
		if !r.atRecovery(q) {
			t.Fatal("issuer lost recovery cut")
		}
		r.revoke()
		if _, ok := r.component(q, 0, nil); ok {
			t.Fatal("expired component")
		}
		if r.atRecovery(q) || r.excludeDiscovery(q, nil) || r.issuer != nil {
			t.Fatal("expired authority retained")
		}
	})
}

// No alternatives means unavailable evidence. Only an actual undefined carrier
// or a represented empty rest is a proof of empty callable exposure.
func TestWriterInputGraphEmptyAlternatives(t *testing.T) {
	for _, rest := range []bool{false, true} {
		source := `export function invoke(input:unknown){return Symbol.for(input as string)}`
		if rest {
			source = `declare function foreign(value:unknown):void;export function invoke(...input:unknown[]){foreign(input[0])}`
		}
		withWriterInputGraph(t, source, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
			parameter := enclosingCallableNode(call).Parameters()[0]
			id := ast.GetSymbolId(q.owner.checker.GetSymbolAtLocation(parameter.Name()))
			r := q.registerWriterInputRequest(call)
			defer r.revoke()
			rows := []struct {
				name    string
				terms   []sourceValue
				covered bool
			}{
				{"nil", nil, false}, {"empty", []sourceValue{}, false}, {"unknown", []sourceValue{{}}, false},
			}
			if rest {
				rows = append(rows,
					struct {
						name    string
						terms   []sourceValue
						covered bool
					}{"nil selected group", []sourceValue{{node: parameter.Name(), rest: [][]sourceValue{nil}}}, false},
					struct {
						name    string
						terms   []sourceValue
						covered bool
					}{"empty selected group", []sourceValue{{node: parameter.Name(), rest: [][]sourceValue{{}}}}, false},
					struct {
						name    string
						terms   []sourceValue
						covered bool
					}{"represented empty rest", []sourceValue{{node: parameter.Name(), rest: [][]sourceValue{}}}, true},
					struct {
						name    string
						terms   []sourceValue
						covered bool
					}{"undefined selected group", []sourceValue{{node: parameter.Name(), rest: [][]sourceValue{{{undefined: true}}}}}, true},
				)
			} else {
				rows = append(rows, struct {
					name    string
					terms   []sourceValue
					covered bool
				}{"undefined", []sourceValue{{undefined: true}}, true})
			}
			for _, row := range rows {
				values, ok := r.component(q, 0, sourceValueBindings{id: row.terms})
				if ok != row.covered || len(values) != 0 {
					t.Fatalf("%s rest=%v coverage=%v values=%v", row.name, rest, ok, values)
				}
				if !rest && !row.covered && r.excludeDiscovery(q, sourceValueBindings{id: row.terms}) {
					t.Fatalf("%s closed Symbol.for discovery", row.name)
				}
			}
		})
	}
}

// Exercise the real invocation-input producer rather than constructing all
// substitutions by hand. Missing actuals and empty rest have explicit proof,
// whereas an opaque producer output must retain the original recovery path.
func TestWriterInputGraphProducedInputs(t *testing.T) {
	rows := []struct {
		name, parameter, actual, expression string
		covered                             bool
	}{
		{"missing actual", "input?:unknown", "", "input", true},
		{"opaque actual", "input:unknown", "produce()", "input", false},
		{"empty rest", "...input:unknown[]", "", "input[0]", true},
		{"opaque rest element", "...input:unknown[]", "produce()", "input[0]", false},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			source := `declare function foreign(value:unknown):void;declare function produce():unknown;export function invoke(` + row.parameter + `){foreign(` + row.expression + `)}invoke(` + row.actual + `);`
			withWriterInputGraph(t, source, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
				declaration := enclosingCallableNode(call)
				var actual *ast.Node
				walkNode(ast.GetSourceFileOfNode(call).AsNode(), func(n *ast.Node) bool {
					if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "invoke" {
						actual = n
					}
					return true
				})
				if actual == nil {
					t.Fatal("missing producer invocation")
				}
				part := accessorCandidates{}
				inputs := q.bindInputs(declaration, actual, nil, &part)
				r := q.registerWriterInputRequest(call)
				defer r.revoke()
				values, ok := r.component(q, 0, inputs.bindings)
				if ok != row.covered || len(values) != 0 {
					t.Fatalf("producer coverage=%v want=%v values=%v", ok, row.covered, values)
				}
			})
		})
	}
}

func TestWriterInputGraphExternalProvenance(t *testing.T) {
	for _, source := range []string{
		`const custom={for(value:string){document.title;return value}};export function invoke(){return custom.for("x")}`,
		`export function invoke(Symbol:{for(value:string):unknown}){return Symbol.for("x")}`,
		`declare const typed:SymbolConstructor;export function invoke(){return typed.for("x")}`,
	} {
		withWriterInputGraph(t, source, func(q *sourceValueQuery, call *ast.Node, g *sourceWriterInputGraph) {
			r := q.registerWriterInputRequest(call)
			defer r.revoke()
			if r.excludeDiscovery(q, nil) {
				t.Fatal("authored/shadow/type-only receiver acquired external authority")
			}
		})
	}
}
