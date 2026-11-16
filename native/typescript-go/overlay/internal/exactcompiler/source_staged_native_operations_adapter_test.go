package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These are source selection/plan controls, not central admission or native
// execution evidence. Native acquisition is performed only by its existing owner.
func TestSelectedNativeDescriptorAdapterSourceControls(t *testing.T) {
	for _, row := range []struct {
		name, source        string
		selected            bool
		authoredReplacement bool
	}{
		{"genuine", `export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, true, false},
		{"alias", `const define=Object.defineProperty;export function invoke(){return define({},'run',{value:()=>document.title})}`, true, false},
		{"shadow", `const Object={defineProperty(...args:unknown[]){return args}};export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`, false, false},
		// A wrapper's own replacement is independent of the trusted standard
		// entry. A conditional native MAY branch need not disappear.
		{"override", `const owner={defineProperty:Object.defineProperty};owner.defineProperty=function replacement<T>(target:T,key:PropertyKey,descriptor:PropertyDescriptor):T{document.title;return target};export function invoke(){return owner.defineProperty({},'run',{value:()=>document.title})}`, false, true},
		{"custom object", `const owner={defineProperty(...args:unknown[]){document.title;return args}};export function invoke(){return owner.defineProperty({},'run',{value:()=>document.title})}`, false, false},
		{"getter", `export function invoke(){return Object.defineProperty({},'run',{get value(){window.name;return ()=>document.title}})}`, true, false},
		{"installed getter dormant", `export function invoke(){return Object.defineProperty({},'run',{get:()=>document.title})}`, true, false},
		{"unknown mixed", `declare const dynamic:typeof Object.defineProperty;const define=Math.random()?Object.defineProperty:dynamic;export function invoke(){return define({},'run',{value:()=>document.title})}`, true, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(q *sourceValueQuery, call *ast.Node) {
				view := q.receiverWriteCandidates(call, nil)
				selected, authored := false, false
				for _, value := range view.candidates.values {
					authored = authored || value.native == nil && len(value.path) == 0 && value.node != nil && ast.IsFunctionLike(value.node) && value.node.Body() != nil && callableNameText(value.node.Name()) == "replacement"
					if value.native == nil || value.native.kind != sourceNativeObjectDefineProperty {
						continue
					}
					selected = true
					request := sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: enclosingCallableNode(call), operation: call}, consumer: enclosingCallableNode(call), use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}
					selection := sourceStagedNativeSelection{selected: value, call: call, get: call.Expression(), descriptorGet: restrictedInvocationArguments(call.AsCallExpression())[2], request: request}
					for _, actual := range restrictedInvocationArguments(call.AsCallExpression()) {
						selection.actuals = append(selection.actuals, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actual})
					}
					plan, ok := describeSelectedNativeDescriptor(selection, nil)
					if !ok || len(plan.eager.delta.invoked) != 0 || len(plan.exposure.delta.exposures) != 0 {
						t.Fatalf("unexpected eager/stored prefix: accepted=%t plan=%#v", ok, plan)
					}
					if plan.eager.delta.extracted || plan.exposure.delta.extracted || len(plan.eager.delta.required) != len(reflectiveDescriptorKeys) || len(plan.exposure.delta.required) != 1 {
						t.Fatal("local prefix settled original conversion requirements")
					}
					for index, field := range plan.fields {
						key := field.recipe.key
						if field.request.inputs != nil || field.request.cut != request.cut || field.request.consumer != request.producer.declaration || key.kind != relativeDemandEffects || key.selector.field != reflectiveDescriptorKeys[index] || key.selector.occurrence != selection.descriptorGet || key.operation != call || field.recipe.delta.extracted {
							t.Fatal("field lost its original source requirement or acquired empty coverage")
						}
						if key == plan.eager.key || key == plan.exposure.key {
							t.Fatal("Effects/DirectExposure roles collapsed into recursive keys")
						}
					}
				}
				if row.authoredReplacement {
					if !authored || len(view.dependencies) == 0 {
						t.Fatal("own authored replacement or pending interference lost beside conditional standard selection")
					}
					// Every native plan above stays unextracted with its field
					// requirements intact. Its presence cannot ACK this sibling.
				} else if selected != row.selected {
					t.Fatalf("native acquisition selected=%t want=%t", selected, row.selected)
				}
			})
		})
	}
}

// The input atoms below are deliberately supplied payloads. This test checks
// envelope transport only. It does not stand in for a Has/Get owner or prove that
// source syntax authorizes these atoms, absence or native source admission.
func TestSelectedNativeDescriptorOwnedFieldPayload(t *testing.T) {
	withSourceCalleeWriteQuery(t, `export function invoke(callback:()=>void){return Object.defineProperty({},'run',{value:()=>document.title})}`, func(q *sourceValueQuery, call *ast.Node) {
		view := q.receiverWriteCandidates(call, nil)
		for _, value := range view.candidates.values {
			if value.native == nil || value.native.kind != sourceNativeObjectDefineProperty {
				continue
			}
			declaration := enclosingCallableNode(call)
			cut := sourceRelativeCut{operation: call, use: call, reading: call}
			request := sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call}, consumer: declaration, use: call, cut: cut}
			args := restrictedInvocationArguments(call.AsCallExpression())
			selection := sourceStagedNativeSelection{selected: value, call: call, get: call.Expression(), descriptorGet: args[2], request: request}
			for _, actual := range args {
				selection.actuals = append(selection.actuals, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actual})
			}
			receiver := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: args[2], producer: call, cut: cut}
			stored := sourceStagedOperationAlternative{endpoint: sourceRelativeEndpoint{kind: relativeEndpointResult, producer: call, get: args[2], cut: cut}}
			role := sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: 0}
			basis, supported := describeSelectedNativeDescriptor(selection, nil)
			if !supported {
				t.Fatal("source requirement envelope refused")
			}
			valueRequest := basis.fields[stagedDescriptorFieldIndex("value")].request
			prefix := sourceStagedNativeFieldPrefix{field: "value", request: valueRequest, valueExposure: []sourceStagedOperationAlternative{stored}, delta: sourceStagedOperationDelta{
				invoked:   []sourceStagedOperationInvocation{{declaration: declaration, operation: call, alternative: sourceStagedOperationAlternative{endpoint: receiver}}},
				effects:   []EnvironmentEffectSource{{Environment: "browser", Description: "owned field effect"}},
				relative:  []sourceRelativeInvokedInput{{kind: relativeDemandEffects, role: role, origin: call, cut: cut}},
				residuals: []sourceStagedOperationResidual{{operation: call}},
				required:  []sourceStagedOperationRequest{request},
				extracted: true,
			}}
			plan, ok := describeSelectedNativeDescriptor(selection, []sourceStagedNativeFieldPrefix{prefix})
			if !ok {
				t.Fatal("owned field prefix refused")
			}
			field := plan.fields[stagedDescriptorFieldIndex("value")].recipe.delta
			if len(field.invoked) != 1 || field.invoked[0].alternative.endpoint.expression != receiver.expression || field.invoked[0].alternative.endpoint.cut != cut || len(field.effects) != 1 || len(field.relative) != 1 || len(field.residuals) != 1 || len(field.required) != 1 {
				t.Fatal("owned payload or receiver association was dropped")
			}
			if field.extracted || plan.eager.delta.extracted || plan.exposure.delta.extracted || len(plan.exposure.delta.exposures) != 1 || plan.exposure.delta.exposures[0].endpoint.producer != stored.endpoint.producer || plan.exposure.delta.exposures[0].endpoint.get != stored.endpoint.get || plan.exposure.delta.exposures[0].endpoint.cut != stored.endpoint.cut {
				t.Fatal("stored exposure was invoked or local extraction became disposition authority")
			}
			for _, field := range plan.fields {
				if field.recipe.delta.extracted {
					t.Fatal("an absent/data-only field obtained empty coverage")
				}
			}
			for _, invalid := range [][]sourceStagedNativeFieldPrefix{{prefix, prefix}, {{field: "arbitrary"}}, {{field: "get", request: basis.fields[stagedDescriptorFieldIndex("get")].request, valueExposure: []sourceStagedOperationAlternative{stored}}}} {
				if _, admitted := describeSelectedNativeDescriptor(selection, invalid); admitted {
					t.Fatal("invalid or conflicting field envelope admitted")
				}
			}
			for _, mismatch := range []struct {
				name   string
				change func(*sourceStagedOperationRequest)
			}{
				{"operation", func(r *sourceStagedOperationRequest) { r.producer.operation = args[0] }},
				{"declaration", func(r *sourceStagedOperationRequest) { r.producer.declaration = args[0] }},
				{"selector", func(r *sourceStagedOperationRequest) { r.producer.selector.occurrence = args[0] }},
				{"field", func(r *sourceStagedOperationRequest) { r.producer.selector.field = "get" }},
				{"kind", func(r *sourceStagedOperationRequest) { r.producer.kind = relativeDemandDirectExposure }},
				{"use", func(r *sourceStagedOperationRequest) { r.use = args[0] }},
				{"cut", func(r *sourceStagedOperationRequest) { r.cut.reading = args[0] }},
				{"consumer", func(r *sourceStagedOperationRequest) { r.consumer = args[0] }},
				{"edge", func(r *sourceStagedOperationRequest) { r.edge = "other-consumer" }},
				{"inputs", func(r *sourceStagedOperationRequest) { r.inputs = &sourceRelativeInputEdge{} }},
			} {
				invalid := prefix
				mismatch.change(&invalid.request)
				if _, correlated := describeSelectedNativeDescriptor(selection, []sourceStagedNativeFieldPrefix{invalid}); correlated {
					t.Fatalf("field prefix accepted different %s", mismatch.name)
				}
			}
			var emptyPrefixes []sourceStagedNativeFieldPrefix
			for index, name := range reflectiveDescriptorKeys {
				emptyPrefixes = append(emptyPrefixes, sourceStagedNativeFieldPrefix{field: name, request: basis.fields[index].request, delta: sourceStagedOperationDelta{extracted: true}})
			}
			empty, ok := describeSelectedNativeDescriptor(selection, emptyPrefixes)
			if !ok || len(empty.eager.delta.required) != 6 {
				t.Fatal("empty field envelopes erased independent requirements")
			}
			for _, field := range empty.fields {
				if field.recipe.delta.extracted {
					t.Fatal("empty envelope manufactured absence/data-only disposition")
				}
			}
			selection.request.inputs = &sourceRelativeInputEdge{}
			if _, admitted := describeSelectedNativeDescriptor(selection, nil); admitted {
				t.Fatal("caller input association acquired original-source requirement authority")
			}
			return
		}
		t.Fatal("missing genuine native selection control")
	})
}

// This source-authored control exercises the synchronous handoff through the
// algorithm adapter into its publication callback. Manual publication here is
// not the actual live member-owner route. Empty correlated prefixes are not Has/Get disposition authority.
func TestSelectedNativeDescriptorHandoffGraphCut(t *testing.T) {
	withSourceCalleeWriteQuery(t, `export function invoke(){return Object.defineProperty({},'run',{get value(){window.name;return ()=>document.title}})}`, func(query *sourceValueQuery, call *ast.Node) {
		view := query.receiverWriteCandidates(call, nil)
		var selected sourceValue
		for _, value := range view.candidates.values {
			if value.native != nil && value.native.kind == sourceNativeObjectDefineProperty {
				selected = value
				break
			}
		}
		if selected.native == nil {
			t.Fatal("source callee owner did not retain standard alternative")
		}
		declaration := enclosingCallableNode(call)
		args := restrictedInvocationArguments(call.AsCallExpression())
		graph := sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, edge: "native-algorithm", use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}
		request := sourceStagedNativeRequest{request: graph, call: call, get: call.Expression(), descriptorGet: args[2]}
		vector := sourceStagedNativeInputs{operation: call, use: query.effectUse(), cut: query.relativeInputCut(call), known: true}
		for _, arg := range args {
			vector.actuals = append(vector.actuals, sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: arg, cut: vector.cut})
		}
		if vector.cut == graph.cut || vector.use == graph.use {
			t.Fatal("control failed to distinguish live observation from graph request")
		}
		deliveries := 0
		revoke, ok := beginStagedNativeDescriptorAlgorithm(query, request, func(selection sourceStagedNativeSelection, algorithm sourceStagedOperationRequest, plan sourceStagedNativeDescriptorPlan) {
			deliveries++
			if !sameOperationRequest(selection.request, graph) || len(plan.eager.delta.required) != 6 {
				t.Fatal("handoff lost original graph request or adapter requirements")
			}
			expected := graph
			expected.producer.selector = sourceStagedOperationSelector{occurrence: request.get, field: "algorithm"}
			expected.edge += ":algorithm"
			if !sameOperationRequest(algorithm, expected) || plan.eager.key != expected.producer || !sameOperationRequest(plan.exposure.delta.required[0], expected) {
				t.Fatal("algorithm producer addressed root or another independent debt")
			}
			for _, field := range plan.fields {
				if field.recipe.key.selector.occurrence != request.descriptorGet || field.recipe.key == algorithm.producer || field.recipe.key == graph.producer {
					t.Fatal("descriptor field aliased a callee/root debt")
				}
				if field.request.cut != graph.cut || field.request.use != graph.use || field.request.edge != graph.edge || field.recipe.delta.extracted {
					t.Fatal("field request normalized graph cut to live observation")
				}
			}
			prefix := sourceStagedNativeFieldPrefix{field: "value", request: plan.fields[stagedDescriptorFieldIndex("value")].request}
			if correlated, ok := describeSelectedNativeDescriptor(selection, []sourceStagedNativeFieldPrefix{prefix}); !ok || correlated.fields[stagedDescriptorFieldIndex("value")].recipe.delta.extracted {
				t.Fatal("correlated empty field lost membership or acquired disposition")
			}
			prefix.request.cut = vector.cut
			prefix.request.use = vector.use
			if _, correlated := describeSelectedNativeDescriptor(selection, []sourceStagedNativeFieldPrefix{prefix}); correlated {
				t.Fatal("live observation substituted for issued graph field request")
			}
		})
		if !ok {
			t.Fatal("original synchronous source request refused")
		}
		defer revoke()
		wrongCut := vector
		wrongCut.cut, wrongCut.use = graph.cut, graph.use
		if query.publishStagedNativeSelection(call, selected, wrongCut) || deliveries != 0 {
			t.Fatal("graph request substituted for original live observation")
		}
		if !query.publishStagedNativeSelection(call, selected, vector) || deliveries != 1 {
			t.Fatal("same-cut selected handoff did not reach adapter")
		}
	})
}

// This control enters through the actual member owner rather than manually
// publishing a selected value. Admission connects pending field requirements
// only. A stored callback or conversion getter spelling supplies no field atoms.
// Native execution remains unqualified until this source test is actually run.
func TestSelectedNativeDescriptorSourceEntry(t *testing.T) {
	for _, row := range []struct{ name, source string }{
		{"stored value", `export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`},
		{"conversion getter", `export function invoke(){return Object.defineProperty({},'run',{get value(){window.name;return ()=>document.title}})}`},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				facts := installationSourceFacts(query)
				declaration := enclosingCallableNode(call)
				args := restrictedInvocationArguments(call.AsCallExpression())
				graph := sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, use: call, edge: "descriptor-source-entry", cut: sourceRelativeCut{operation: call, use: call, reading: call}}
				request := sourceStagedNativeRequest{request: graph, call: call, get: call.Expression(), descriptorGet: args[2]}
				work := callableEffectWork{extracting: -1}
				revoke, installed := beginStagedNativeDescriptorSource(query, &work, facts, request)
				if !installed {
					t.Fatal("actual source entry refused")
				}
				defer revoke()
				query.receiverCandidates(call, nil)
				algorithm := graph.producer
				algorithm.selector = sourceStagedOperationSelector{occurrence: request.get, field: "algorithm"}
				recipe, found := work.operationRecipes[algorithm]
				if !found || recipe.nativeGet == nil || recipe.nativeGet.descriptorGet != args[2] || len(recipe.delta.required) != 6 || recipe.delta.extracted {
					t.Fatal("actual member-owner handoff did not attach pending algorithm")
				}
				for index, field := range recipe.delta.required {
					expected := graph
					expected.producer.selector = sourceStagedOperationSelector{occurrence: args[2], field: reflectiveDescriptorKeys[index]}
					id, registered := work.operationIDs[field.producer]
					if !sameOperationRequest(field, expected) || !registered || id.index == 0 {
						t.Fatal("original field requirement not registered at admission")
					}
					state := &work.operations[id.index]
					if state.subscribers[sourceStagedOperationConsumer{field.consumer, field.edge}] == nil || state.revision != 0 || operationDeltaSize(work.operationRecipes[field.producer].delta) != 2 || len(work.operationRecipes[field.producer].delta.required) != 2 {
						t.Fatal("field membership missing or syntax granted source payload")
					}
				}
				work.prepareOperationUses(facts, query.executable)
				algorithmID := work.operationIDs[algorithm]
				local := &work.operations[algorithmID.index]
				if local.revision == 0 || !local.delta.extracted || len(local.delta.required) != 6 {
					t.Fatal("admitted algorithm did not publish its local required prefix")
				}
				rootID := work.operationIDs[graph.producer]
				closed := work.closedOperationDependencies()
				quietClosed := closed[rootID.index] || closed[algorithmID.index]
				if quietClosed {
					root := work.operationRecipes[graph.producer].nativeGet
					if row.name != "stored value" || !closed[rootID.index] || !closed[algorithmID.index] || !work.operations[rootID.index].delta.extracted || root == nil || !sameOperationRequest(root.request, graph) || !sameNativeGetSource(root, recipe.nativeGet) {
						t.Fatal("unrepresented descriptor row or unmatched source closed")
					}
				}
				for _, role := range []string{"callee-get", "eager-inputs"} {
					key := graph.producer
					key.selector = sourceStagedOperationSelector{occurrence: request.get, field: role}
					id, found := work.operationIDs[key]
					if !found {
						t.Fatal("independent native root role missing", role)
					}
					state := &work.operations[id.index]
					if quietClosed && (!state.delta.extracted || !closed[id.index]) {
						t.Fatal("closed quiet row lacks independent root role", role)
					}
					if !state.delta.extracted {
						continue
					}
					ownerRecipe := work.operationRecipes[key]
					source := ownerRecipe.nativeGet
					if state.revision == 0 || source == nil || !sameOperationRequest(source.request, graph) {
						t.Fatal("ready root role lost original source owner", role)
					}
					if role == "callee-get" {
						if ownerRecipe.delta.extracted || state.nativeCallee == nil || state.nativeCallee.generation != query.owner.generation || state.nativeCallee.generation != work.operationGeneration || !validStagedNativeCalleeEffects(*state.nativeCallee, source) {
							t.Fatal("callee readiness lacks graph-local original Get proof")
						}
					} else if source.eager == nil || !validStagedNativeEagerInputs(*source.eager, source) {
						t.Fatal("eager readiness lacks independent creation proof")
					}
				}
				for _, field := range recipe.delta.required {
					id := work.operationIDs[field.producer]
					state := &work.operations[id.index]
					if state.revision == 0 || state.fieldDisposition == nil || row.name != "stored value" && closed[id.index] {
						t.Fatal("original Has/Get disposition missing or unrepresented field closed")
					}
					if quietClosed && (!closed[id.index] || !state.delta.extracted) {
						t.Fatal("closed quiet row lacks all original field closures")
					}
					if closed[id.index] {
						receipt := state.fieldDisposition
						if receipt.kind == stagedFieldDispositionUnknown || receipt.has != sourceEffectsAccounted || receipt.get != sourceEffectsAccounted || len(receipt.invoked) != 0 || receipt.operation != call || receipt.receiver != args[2] || receipt.field != field.producer.selector.field {
							t.Fatal("quiet field closure lacks accounted original Has/Get receipt")
						}
					}
					if state.delta.extracted != (state.fieldDisposition.kind != stagedFieldDispositionUnknown) {
						t.Fatal("local field extraction disagrees with represented Has/Get disposition")
					}
				}
				revoke()
				if query.stagedNativeGet != nil {
					t.Fatal("descriptor source entry retained a live member borrow")
				}
			})
		})
	}
}
