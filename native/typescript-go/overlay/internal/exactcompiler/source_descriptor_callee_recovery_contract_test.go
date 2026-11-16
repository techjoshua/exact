package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// Both owners enter at the original read with no normal/source input frame.
// This protects raw argument/capture scope recovery. Concrete default binding
// belongs to the separate real-collector behavior control below.
func TestDescriptorCalleeRecoveryPreservesRawArgumentScopes(t *testing.T) {
	for _, mixed := range []bool{false, true} {
		t.Run(fmt.Sprint("mixed=", mixed), func(t *testing.T) {
			before := descriptorCalleeRawSnapshot(t, false, mixed)
			after := descriptorCalleeRawSnapshot(t, true, mixed)
			if !reflect.DeepEqual(before, after) {
				t.Fatalf("callee-only recovery changed raw argument scopes/debts\nbefore=%#v\nafter=%#v", before, after)
			}
		})
	}
}

type descriptorCalleeRecoveryState struct {
	Scopes, Effects                                                              []string
	Environment, Context                                                         string
	Opaque, ValueIncomplete, ReceiverIncomplete, FieldIncomplete, ThenIncomplete bool
	Fields, Calls, Owned, Gets, Claims, Outcomes, Normal, Native                 int
}

func descriptorCalleeRecoveryNode(n *ast.Node) string {
	if n == nil {
		return "nil"
	}
	return fmt.Sprintf("%v@%d:%d", n.Kind, n.Pos(), n.End())
}

func descriptorCalleeRawSnapshot(t *testing.T, optimized, mixed bool) descriptorCalleeRecoveryState {
	t.Helper()
	source := `export{};const defaultInput={value:'captured'};const box={value:''};function writer(value=defaultInput.value){box.value=value;throw new Error('dormant writer')}export function probe(){Object.getOwnPropertyDescriptor(writer,'name');return box.value}`
	if mixed {
		source = "declare const choice:boolean;declare const external:Function;" + strings.Replace(source, "Object.getOwnPropertyDescriptor(writer,", "Object.getOwnPropertyDescriptor(choice?writer:external,", 1)
	}
	var snapshot descriptorCalleeRecoveryState
	withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
		cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
		collection := beginProjectCallableCollection(cache, cache.owner)
		defer collection.close()
		collection.collect()
		if result := collection.resolve(file); len(result.pending) != 0 {
			t.Fatalf("original collector pending; raw recovery UNREACHED: %#v", result.pending)
		}
		var reader, writer, call, read, left *ast.Node
		labels := make(map[ast.SymbolId]string)
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsIdentifier(n) {
				if s := initial.checker.GetSymbolAtLocation(n); s != nil {
					labels[ast.GetSymbolId(s)] = s.Name + "@" + descriptorCalleeRecoveryNode(s.ValueDeclaration)
				}
			}
			if ast.IsFunctionDeclaration(n) && n.Name() != nil {
				if n.Name().Text() == "probe" {
					reader = n
				}
				if n.Name().Text() == "writer" {
					writer = n
				}
			}
			if ast.IsCallExpression(n) && descriptorRetrievalIntent(n) {
				call = n
			}
			if ast.IsPropertyAccessExpression(n) && n.Name().Text() == "value" && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "box" {
				if enclosingCallableNode(n) == reader {
					read = n
				}
				if enclosingCallableNode(n) == writer {
					left = n
				}
			}
			return true
		})
		if reader == nil || writer == nil || call == nil || read == nil || left == nil {
			t.Fatal("original recovery associations absent")
		}
		q := newSourceDependencyQuery(read, collection.owner.checker, collection.owner, reader)
		if q.inputs != nil || q.stagedMember != nil || q.stagedNativeGet != nil {
			t.Fatal("raw source entry acquired a borrowed input/member/native frame")
		}
		part := accessorCandidates{}
		var scopes []acquiredCallableScope
		if optimized {
			cut := q.memberWriterReadCut(nil, nil, &part)
			for _, row := range q.memberWriterInputs(left, nil, &part, cut) {
				if row.call != nil {
					t.Fatal("descriptor retrieval invoked its function argument")
				}
				scopes = append(scopes, row.scope)
			}
			current := false
			for _, recipe := range collection.work.operationRecipes {
				if recipe.descriptorSource != nil && recipe.descriptorSource.original.use == call && collection.work.descriptorCalleeSourceCurrent(recipe) {
					current = true
				}
			}
			if !current {
				t.Fatal("genuine current raw descriptor source UNREACHED")
			}
		} else {
			scopes = q.refusedMemberWriterScopes(writer, call, nil, &part)
		}
		if len(scopes) == 0 {
			t.Fatal("authored argument writer scope UNREACHED")
		}
		for _, scope := range scopes {
			var terms []string
			for symbol, values := range scope.bindings {
				label := labels[symbol]
				if label == "" {
					t.Fatal("unmapped source binding")
				}
				for _, v := range values {
					terms = append(terms, fmt.Sprintf("%s=%s/%v/normal=%v/capture=%v/initializer=%v", label, descriptorCalleeRecoveryNode(v.node), v.path, v.normal != nil, v.capture != nil, v.initializerUse != nil))
				}
			}
			for body, c := range scope.creators {
				terms = append(terms, "creator:"+descriptorCalleeRecoveryNode(body)+":"+descriptorCalleeRecoveryNode(c.invocation)+":"+descriptorCalleeRecoveryNode(c.returning))
			}
			sort.Strings(terms)
			snapshot.Scopes = append(snapshot.Scopes, strings.Join(terms, "|"))
		}
		sort.Strings(snapshot.Scopes)
		for _, e := range part.effects {
			snapshot.Effects = append(snapshot.Effects, descriptorCalleeRecoveryNode(e.operation)+":"+descriptorCalleeRecoveryNode(e.declaration)+fmt.Sprint(":receiver=", e.receivers != nil))
		}
		sort.Strings(snapshot.Effects)
		snapshot.Environment = fmt.Sprintf("%#v", displayEnvironmentSources(part.environmentEffects))
		snapshot.Context = fmt.Sprintf("%#v", part.contextEffects)
		snapshot.Opaque, snapshot.ValueIncomplete, snapshot.ReceiverIncomplete, snapshot.FieldIncomplete, snapshot.ThenIncomplete = part.opaque, part.valueIncomplete, part.receiverIncomplete, part.fieldReceiverIncomplete, part.thenIncomplete
		snapshot.Fields, snapshot.Calls, snapshot.Owned, snapshot.Gets, snapshot.Claims, snapshot.Outcomes, snapshot.Normal, snapshot.Native = len(part.fieldFallbacks), len(part.callFallbacks), len(part.owned), len(part.ownedGets), len(part.ownedClaims), len(part.callOutcomes), len(part.normalCalls), len(part.nativeCalls)
		if snapshot.Normal != 0 || snapshot.Native != 0 {
			t.Fatal("source recovery acquired normal invocation authority")
		}
	})
	return snapshot
}

// The public collector supplies real default/capture relationships separately
// from the raw no-input recovery interval. No source-return frame is repurposed
// as raw publisher evidence, and the function-valued target remains dormant.
func TestDescriptorCalleeRecoveryDefaultBehavior(t *testing.T) {
	for _, row := range []struct {
		name, source string
		browser      bool
	}{
		{"default-and-capture", `export{};const input={get value(){return document.title}};const box={value:''};function writer(value=input.value){box.value=value}function wrap(value=input.value){Object.getOwnPropertyDescriptor(writer,'name');return value}export function probe(){return wrap()}`, true},
		{"dormant-default-and-body", `export{};const input={get value(){return document.title}};const box={value:''};function writer(value=input.value){box.value=value;document.title}export function probe(){Object.getOwnPropertyDescriptor(writer,'name');return box.value}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			descriptorContractCollection(t, row.source, func(_ *projectCallableCollection, result callableAnalysis) {
				descriptorContractBrowser(t, result, row.browser)
			})
		})
	}
}
