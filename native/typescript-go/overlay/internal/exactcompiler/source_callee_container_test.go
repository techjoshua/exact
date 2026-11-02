package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Container descriptions preserve source contents through a synchronous borrow,
// without publishing normal values or equating source container allocations.
func TestPendingCalleeContainerDescriptions(t *testing.T) {
	const source = `function project(input:object){return Object.freeze(input)}const first={},second={};export const value=project(first);`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/callee-containers.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	for _, project := range session.projects {
		file := project.program.GetSourceFile("/virtual/callee-containers.ts")
		if file == nil {
			continue
		}
		var call, other, body, first, second *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsFunctionDeclaration(n) {
				body = n
			}
			if ast.IsCallExpression(n) {
				if call == nil {
					call = n
				} else {
					other = n
				}
			}
			if ast.IsObjectLiteralExpression(n) {
				if first == nil {
					first = n
				} else {
					second = n
				}
			}
			return true
		})
		if call == nil || other == nil || body == nil || first == nil || second == nil {
			t.Fatal("missing checker-owned source endpoints")
		}
		q := newSourceDependencyQuery(call, project.callableCache.owner.values.checker, project.callableCache.owner, body)
		q.creators = map[*ast.Node]sourceValueCreation{body: {invocation: other}}
		fresh := func() sourceValue {
			return sourceValue{node: first, copied: map[string][]sourceValue{
				"nested": {{node: second, rest: [][]sourceValue{{{node: body, path: []string{"value"}}, {undefined: true}}, nil, make([]sourceValue, 0)}}},
				"empty":  make([]sourceValue, 0), "nil": nil,
			}}
		}
		initial := sourceValueBindings{1: {fresh()}}
		remaining := q.remaining
		beforeCost := q.estimatedCost
		release := q.beginCalleeAcquisition(call, initial)
		if release == nil || !q.pendingCalleeOutput(call, initial) {
			t.Fatal("finite nested containers not described")
		}
		if !q.pendingCalleeOutput(call, sourceValueBindings{1: {fresh()}}) {
			t.Fatal("equal source contents depended on Go allocation identity")
		}
		if q.remaining != remaining || q.estimatedCost <= beforeCost {
			t.Fatal("container work unaccounted or depleted fuel")
		}
		for _, row := range []struct {
			name   string
			change func(*sourceValue)
		}{
			{"absent-map", func(v *sourceValue) { v.copied = nil }},
			{"empty-map", func(v *sourceValue) { v.copied = map[string][]sourceValue{} }},
			{"same-size-key", func(v *sourceValue) { v.copied["other"] = v.copied["empty"]; delete(v.copied, "empty") }},
			{"extra-key", func(v *sourceValue) { v.copied["extra"] = nil }},
			{"nil-alternatives", func(v *sourceValue) { v.copied["empty"] = nil }},
			{"present-empty-alternatives", func(v *sourceValue) { v.copied["nil"] = make([]sourceValue, 0) }},
			{"same-size-slots", func(v *sourceValue) { r := v.copied["nested"][0].rest; r[0], r[1] = r[1], r[0] }},
			{"nil-slot", func(v *sourceValue) { v.copied["nested"][0].rest[2] = nil }},
			{"empty-slot", func(v *sourceValue) { v.copied["nested"][0].rest[1] = make([]sourceValue, 0) }},
			{"same-size-alternatives", func(v *sourceValue) { r := v.copied["nested"][0].rest[0]; r[0], r[1] = r[1], r[0] }},
			{"extra-alternative", func(v *sourceValue) { r := v.copied["nested"][0].rest; r[0] = append(r[0], sourceValue{node: first}) }},
			{"nested-source", func(v *sourceValue) { v.copied["nested"][0].rest[0][0].node = other }},
			{"nested-path", func(v *sourceValue) { v.copied["nested"][0].rest[0][0].path[0] = "other" }},
			{"nested-undefined", func(v *sourceValue) { v.copied["nested"][0].rest[0][1].undefined = false }},
			{"nested-capture", func(v *sourceValue) { v.copied["nested"][0].rest[0][0].capture = &acquiredCallableScope{} }},
			{"nested-native", func(v *sourceValue) { v.copied["nested"][0].rest[0][0].native = &sourceNativeValue{} }},
		} {
			t.Run(row.name, func(t *testing.T) {
				current := fresh()
				row.change(&current)
				if q.pendingCalleeOutput(call, sourceValueBindings{1: {current}}) {
					t.Fatal("different or unsupported container withheld pending output")
				}
			})
		}
		// Mutating the exact originally supplied containers must not mutate the record.
		initial[1][0].copied["nested"][0].rest[0][0].path[0] = "changed"
		if q.pendingCalleeOutput(call, initial) {
			t.Fatal("snapshot aliased deep source path")
		}
		initial[1][0].copied["nested"][0].rest[0][0].path[0] = "value"
		initial[1][0].copied["nil"] = make([]sourceValue, 0)
		if q.pendingCalleeOutput(call, initial) {
			t.Fatal("snapshot aliased copied-map alternatives")
		}
		initial[1][0].copied["nil"] = nil
		initial[1][0].copied["nested"][0].rest[0][1].node = first
		if q.pendingCalleeOutput(call, initial) {
			t.Fatal("snapshot aliased rest alternatives")
		}
		initial[1][0].copied["nested"][0].rest[0][1].node = nil
		if !q.pendingCalleeOutput(call, initial) {
			t.Fatal("restored deep source contents did not match")
		}
		copy := *q
		if copy.pendingCalleeOutput(call, initial) {
			t.Fatal("copied query inherited container borrow")
		}
		prior := q.pendingCallee
		nested := q.beginCalleeAcquisition(other, initial)
		if nested == nil {
			t.Fatal("nested container borrow refused")
		}
		nested()
		if q.pendingCallee != prior {
			t.Fatal("nested container borrow lost prior")
		}
		release()
		if q.pendingCallee != nil || prior.owner != nil || q.pendingCalleeOutput(call, initial) {
			t.Fatal("expired container borrow retained")
		}

		// Empty carrier presence and root vector presence are part of the description.
		for _, value := range []sourceValue{{copied: map[string][]sourceValue{}}, {rest: make([][]sourceValue, 0)}} {
			bindings := sourceValueBindings{1: {value}}
			release := q.beginCalleeAcquisition(call, bindings)
			if release == nil || !q.pendingCalleeOutput(call, bindings) || q.pendingCalleeOutput(call, sourceValueBindings{1: {{}}}) {
				t.Fatal("empty carrier presence lost")
			}
			release()
		}
		release = q.beginCalleeAcquisition(call, sourceValueBindings{1: nil})
		if release == nil || q.pendingCalleeOutput(call, sourceValueBindings{1: make([]sourceValue, 0)}) {
			t.Fatal("root alternatives lost nil presence")
		}
		release()

		// Current cycles cannot match an earlier finite leaf with the same key/slot.
		copied := map[string][]sourceValue{}
		copyCycle := sourceValue{node: first, copied: copied}
		copied["self"] = []sourceValue{copyCycle}
		rest := make([][]sourceValue, 1)
		restCycle := sourceValue{node: first, rest: rest}
		rest[0] = []sourceValue{restCycle}
		for _, row := range []struct {
			name           string
			finite, cyclic sourceValue
		}{
			{"copied", sourceValue{node: first, copied: map[string][]sourceValue{"self": {{node: first}}}}, copyCycle},
			{"rest", sourceValue{node: first, rest: [][]sourceValue{{{node: first}}}}, restCycle},
		} {
			t.Run(row.name+"-cycle", func(t *testing.T) {
				bindings := sourceValueBindings{1: {row.finite}}
				release := q.beginCalleeAcquisition(call, bindings)
				if release == nil {
					t.Fatal("finite leaf refused")
				}
				prior := q.pendingCallee
				if q.pendingCalleeOutput(call, sourceValueBindings{1: {row.cyclic}}) {
					t.Fatal("cyclic current input masqueraded as finite leaf")
				}
				if q.beginCalleeAcquisition(call, sourceValueBindings{1: {row.cyclic}}) != nil || q.pendingCallee != prior {
					t.Fatal("cyclic source description published or damaged prior borrow")
				}
				release()
			})
		}
		unsupported := fresh()
		unsupported.copied["nested"][0].rest[0][0].capture = &acquiredCallableScope{bindings: sourceValueBindings{1: {{normal: &sourceNormalValue{}}}}}
		if q.beginCalleeAcquisition(call, sourceValueBindings{1: {unsupported}}) != nil {
			t.Fatal("normal carrier inside source capture described")
		}
		repeated := sourceValue{node: first, copied: map[string][]sourceValue{"child": {{node: first, copied: map[string][]sourceValue{"leaf": {{node: second}}}}}}}
		if q.beginCalleeAcquisition(call, sourceValueBindings{1: {repeated}}) != nil {
			t.Fatal("repeated ancestor shape became equivalent-context saturation")
		}
		q.dependenciesOnly = false
		beforeCost = q.estimatedCost
		if q.beginCalleeAcquisition(call, initial) != nil || q.pendingCalleeOutput(call, initial) || q.estimatedCost != beforeCost || q.remaining != remaining {
			t.Fatal("normal query acquired or paid for container availability")
		}
	}
}
