package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

func TestStagedNativeInputCompositionSources(t *testing.T) {
	const source = `export function invoke(prototype:object){return Object.freeze(Object.create(prototype))}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/input-composition.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	facts := stagedDeclarationFacts(session)
	var owner *executableBodyOwner
	for _, project := range session.projects {
		if project.callableCache != nil {
			owner = project.callableCache.owner
		}
	}
	if owner == nil {
		t.Fatal("source owner missing")
	}
	var parent *ast.Node
	for _, fact := range facts {
		if fact.summary.Name == "invoke" {
			parent = fact.node.Body().AsBlock().Statements.Nodes[0].AsReturnStatement().Expression
		}
	}
	work := callableEffectWork{extracting: -1}
	work.prepareOperationUses(facts, owner)
	parentKey := sourceStagedOperationKey{declaration: enclosingCallableNode(parent), operation: parent, kind: relativeDemandEffects}
	root := work.operationRecipes[parentKey].nativeGet
	if root == nil {
		t.Fatal("actual composition source missing")
	}
	algorithm := work.operationRecipes[nativeRootDebtRequest(root, "algorithm").producer]
	eager := work.operationRecipes[nativeRootDebtRequest(root, "eager-inputs").producer]
	if !validStagedNativeInputSource(algorithm.nativeGet) || !sameOperationRequest(algorithm.nativeGet.inputSource, eager.nativeGet.inputSource) || len(algorithm.delta.required) != 1 || len(eager.delta.required) != 1 {
		t.Fatal("algorithm and eager inputs did not retain original child request")
	}
	child := algorithm.nativeGet.inputSource
	if child.producer.operation == parent || child.cut == root.request.cut || child.cut.operation != child.producer.operation {
		t.Fatal("child acquisition cut was moved to parent")
	}
	childID := work.operationIDs[child.producer]
	parentID := work.operationIDs[parentKey]
	if childID.index == 0 || !work.closedOperationDependencies()[childID.index] || !work.closedOperationDependencies()[parentID.index] {
		t.Fatal("actual graph did not close child and parent")
	}
	for _, state := range work.operations {
		if len(state.delta.exposures)+len(state.delta.invoked)+len(state.delta.relative) != 0 {
			t.Fatal("composition published output or invocation authority")
		}
	}
	// Metadata cannot retarget a different child/cut. Selection/authority itself
	// is checked by the live producer, not by this transport validation.
	for _, mode := range []string{"cut", "operation", "consumer", "inputs"} {
		copied := *algorithm.nativeGet
		switch mode {
		case "cut":
			copied.inputSource.cut = root.request.cut
		case "operation":
			copied.inputSource.producer.operation = parent
		case "consumer":
			copied.inputSource.consumer = nil
		case "inputs":
			copied.inputSource.inputs = &sourceRelativeInputEdge{}
		}
		if validStagedNativeInputSource(&copied) {
			t.Fatalf("malformed %s source association accepted", mode)
		}
	}
	for i := range facts {
		facts[i] = cloneProjectCallableFact(facts[i])
	}
	fresh := callableEffectWork{extracting: -1}
	fresh.prepareOperationUses(facts, owner)
	freshID := fresh.operationIDs[parentKey]
	if freshID.index == 0 || !fresh.closedOperationDependencies()[freshID.index] {
		t.Fatal("composition did not reconstruct child dependencies in fresh graph")
	}
	fresh.operationGeneration = &projectGeneration{}
	if fresh.closedOperationDependencies()[freshID.index] {
		t.Fatal("expired child/callee receipts retained parent closure")
	}
}

// A possible selected freeze alternative does not classify an unavailable
// input Call result as ordinary. Unsettled compiler work remains pending.
func TestStagedNativeInputCompositionUnrepresentedTarget(t *testing.T) {
	withSourceCalleeWriteQuery(t, `declare function foreign():object;export function invoke(){return Object.freeze(foreign())}`, func(query *sourceValueQuery, call *ast.Node) {
		for parent := call.Parent; parent != nil && !ast.IsFunctionLike(parent); parent = parent.Parent {
			if ast.IsCallExpression(parent) {
				call = parent
			}
		}
		query = newSourceDependencyQuery(call, query.owner.checker, query.executable, enclosingCallableNode(call))
		facts := installationSourceFacts(query)
		declaration := enclosingCallableNode(call)
		request := sourceStagedNativeRequest{algorithmKind: stagedNativeInputIntent(call.Expression()), call: call, get: call.Expression(), request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, use: call, edge: "unrepresented-target", cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
		work := callableEffectWork{extracting: -1}
		revoke, installed := query.beginStagedNativeGetSource(&work, facts, request, func(sourceStagedNativeSelection, func(sourceStagedNativeDescriptorPlan) bool) {})
		if !installed {
			t.Fatal("source get refused")
		}
		defer revoke()
		query.receiverCandidates(call, nil)
		work.prepareOperationUses(facts, query.executable)
		root := work.operationRecipes[request.request.producer].nativeGet
		if root == nil {
			t.Fatal("conditional selected freeze branch missing")
		}
		for _, role := range []string{"algorithm", "eager-inputs"} {
			id := work.operationIDs[nativeRootDebtRequest(root, role).producer]
			if id.index == 0 || work.operations[id.index].delta.extracted {
				t.Fatalf("%s closed from unavailable input category", role)
			}
		}
		if work.closedOperationDependencies()[work.operationIDs[root.request.producer].index] {
			t.Fatal("unknown replaced required target work")
		}
	})
}

// Late selected source delivery extends the existing required graph after the
// direct collector has yielded. The original parent Get is never reacquired.
func TestStagedNativeInputCompositionLateSource(t *testing.T) {
	withSourceCalleeWriteQuery(t, `export function invoke(prototype:object){return Object.freeze(Object.create(prototype))}`, func(query *sourceValueQuery, call *ast.Node) {
		for parent := call.Parent; parent != nil && !ast.IsFunctionLike(parent); parent = parent.Parent {
			if ast.IsCallExpression(parent) {
				call = parent
			}
		}
		declaration := enclosingCallableNode(call)
		owner := query.executable
		facts := installationSourceFacts(query)
		work := callableEffectWork{extracting: -1}
		issue := func(operation *ast.Node) sourceStagedOperationRequest {
			sourceQuery := newSourceDependencyQuery(operation, owner.checker, owner, declaration)
			request := sourceStagedNativeRequest{algorithmKind: stagedNativeInputIntent(operation.Expression()), call: operation, get: operation.Expression(), request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: operation, kind: relativeDemandEffects}, consumer: declaration, use: operation, edge: sourceText(ast.GetSourceFileOfNode(operation), operation), cut: sourceRelativeCut{operation: operation, use: operation, reading: operation}}}
			revoke, installed := sourceQuery.beginStagedNativeGetSource(&work, facts, request, func(sourceStagedNativeSelection, func(sourceStagedNativeDescriptorPlan) bool) {})
			if !installed {
				t.Fatal("source producer refused")
			}
			sourceQuery.receiverCandidates(operation, nil)
			revoke()
			return request.request
		}
		parentRequest := issue(call)
		work.prepareOperationUses(facts, owner)
		parentID := work.operationIDs[parentRequest.producer]
		parentSource := work.operationRecipes[nativeRootDebtRequest(work.operationRecipes[parentRequest.producer].nativeGet, "algorithm").producer].nativeGet
		if work.closedOperationDependencies()[parentID.index] {
			t.Fatal("parent closed before input producer arrived")
		}
		calleeID := work.operationIDs[nativeRootDebtRequest(parentSource, "callee-get").producer]
		receipt := work.operations[calleeID.index].nativeCallee
		child := restrictedInvocationArguments(call.AsCallExpression())[0]
		issue(child)
		work.prepareOperationUses(facts, owner)
		if !work.connectNativeInputSource(facts, parentSource, child) {
			t.Fatal("late source relationship not admitted")
		}
		work.prepareOperationUses(facts, owner)
		if !work.closedOperationDependencies()[parentID.index] || receipt == nil || work.operations[calleeID.index].nativeCallee != receipt {
			t.Fatal("late source did not settle original parent without Get replay")
		}
		revision := work.operations[work.operationIDs[nativeRootDebtRequest(parentSource, "algorithm").producer].index].revision
		queued := len(work.extractionQueue)
		states := len(work.operations)
		if !work.connectNativeInputSource(facts, parentSource, child) {
			t.Fatal("identical source delivery not reusable")
		}
		work.prepareOperationUses(facts, owner)
		if work.operations[work.operationIDs[nativeRootDebtRequest(parentSource, "algorithm").producer].index].revision != revision || len(work.extractionQueue) != queued || len(work.operations) != states {
			t.Fatal("identical source delivery grew graph work")
		}
	})
}

// Eligibility cannot leave a pending prefix behind when an operation's actual
// creation/profile is unmigrated. In particular create's prototype relation is
// narrower than freeze's lexical literal creation Effects.
func TestStagedNativeInputUnsupportedProfilesRemainLegacy(t *testing.T) {
	for _, source := range []string{
		`export function invoke(domain:object){return Object.create({domain})}`,
		`export function invoke(domain:object){return Object.freeze(domain)}`,
		`export function invoke(domain:object){return Object.create(Object.create(domain))}`,
		`export function invoke(){return Object.freeze(Promise.resolve({}))}`,
	} {
		session := NewSession()
		response := session.Execute(Request{Kind: "analyze", ID: "/virtual/input-profile.ts", Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatal(response.Error, response.Diagnostics)
		}
		retained := false
		for _, fact := range stagedDeclarationFacts(session) {
			if fact.summary.Name != "invoke" {
				continue
			}
			call := fact.node.Body().AsBlock().Statements.Nodes[0].AsReturnStatement().Expression
			_, retained = fact.staged.legacy[call]
			if fact.staged.operationsPending {
				t.Fatal("unsupported profile left partial migrated debt")
			}
		}
		if !retained {
			t.Fatal("unsupported profile lost original recovery")
		}
	}
}

// A conditional native child is not a complete result-category proof. The
// ordinary collector excludes this facade domain, and the original Get cannot
// issue its narrow native-only ticket for authored/unknown callable siblings.
func TestStagedNativeInputCompositionMixedProxyResultsRemainUncovered(t *testing.T) {
	for _, source := range []string{
		`declare const choose:boolean;const owner={create:Object.create};if(choose){owner.create=function replacement(_prototype:object|null){window.name;return new Proxy({},{ownKeys(){document.title;return []}})}}export function invoke(prototype:object){return Object.freeze(owner.create(prototype))}`,
		`declare const choose:boolean;declare const foreignCreate:typeof Object.create;const owner={create:choose?Object.create:foreignCreate};export function invoke(prototype:object){return Object.freeze(owner.create(prototype))}`,
	} {
		withSourceCalleeWriteQuery(t, source, func(query *sourceValueQuery, call *ast.Node) {
			for parent := call.Parent; parent != nil && !ast.IsFunctionLike(parent); parent = parent.Parent {
				if ast.IsCallExpression(parent) {
					call = parent
				}
			}
			declaration := enclosingCallableNode(call)
			facts := installationSourceFacts(query)
			caller := &facts[installationFactIndex(t, facts, declaration)]
			if stagedNativeInputEligible(call, caller, query.executable) {
				t.Fatal("mixed child result entered ordinary-target composition domain")
			}
			child := restrictedInvocationArguments(call.AsCallExpression())[0]
			childQuery := newSourceDependencyQuery(child, query.owner.checker, query.executable, declaration)
			work := callableEffectWork{extracting: -1}
			request := sourceStagedNativeRequest{algorithmKind: sourceNativeObjectCreate, call: child, get: child.Expression(), request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: child, kind: relativeDemandEffects}, consumer: declaration, use: child, edge: "mixed-child", cut: sourceRelativeCut{operation: child, use: child, reading: child}}}
			revoke, installed := childQuery.beginStagedNativeGetSource(&work, facts, request, func(sourceStagedNativeSelection, func(sourceStagedNativeDescriptorPlan) bool) {})
			if !installed {
				t.Fatal("original Get observer refused")
			}
			acquired := childQuery.receiverCandidates(child, nil)
			revoke()
			for _, selected := range acquired.values {
				if selected.native != nil && selected.native.kind == sourceNativeObjectCreate && stagedNativeCalleeEffectsRepresented(selected, &acquired) {
					t.Fatal("mixed callable alternatives received a native-only callee ticket")
				}
			}
			work.prepareOperationUses(facts, query.executable)
			for _, state := range work.operations {
				if state.nativeCallee != nil {
					t.Fatal("authored/unknown child selection became complete native result authority")
				}
			}
		})
	}
}
