package exactcompiler

import "testing"

// Detached capture contents remain independent of their producer maps and each
// materialization. An actual empty binding is different from a missing binding.
func TestPropertyPrefixCaptureDetachment(t *testing.T) {
	q := &sourceValueQuery{owner: newSourceValueOwner(nil), remaining: -1}
	result := accessorCandidates{}
	scope := acquiredCallableScope{bindings: sourceValueBindings{
		1: {{undefined: true}},
		2: {},
	}}
	detached, ok := q.detachPropertyObserved(sourceObservedValue{value: sourceValue{undefined: true}, scope: scope}, &result, nil)
	if !ok {
		t.Fatal("finite captured value refused")
	}
	scope.bindings[1][0].undefined = false
	delete(scope.bindings, 2)
	first, ok := q.materializePropertyValue(detached, &result, nil)
	if !ok || !first.scope.bindings[1][0].undefined {
		t.Fatal("detached capture changed with its producer")
	}
	if values, present := first.scope.bindings[2]; !present || len(values) != 0 {
		t.Fatal("empty original binding lost")
	}
	first.scope.bindings[1][0].undefined = false
	second, ok := q.materializePropertyValue(detached, &result, nil)
	if !ok || !second.scope.bindings[1][0].undefined {
		t.Fatal("materialization mutated immutable history")
	}
}

// A scope/value that still needs original acquisition or invocation authority
// must refuse detachment, rather than keep its frame or fabricate a scope.
func TestPropertyPrefixRejectsLiveValues(t *testing.T) {
	for _, test := range []struct {
		name  string
		value sourceValue
	}{
		{"acquired", sourceValue{acquired: &sourceObservedValue{}}},
		{"normal", sourceValue{normal: &sourceNormalValue{}}},
		{"adapter", sourceValue{adapter: &sourceOrdinaryAdapter{}}},
		{"rest", sourceValue{rest: [][]sourceValue{}}},
		{"facade", sourceValue{native: &sourceNativeValue{async: &sourceInvocationResult{}}}},
	} {
		t.Run(test.name, func(t *testing.T) {
			q := &sourceValueQuery{owner: newSourceValueOwner(nil)}
			if _, ok := q.detachPropertyValue(test.value, &accessorCandidates{}, nil); ok {
				t.Fatal("live acquisition authority entered immutable history")
			}
		})
	}
}
