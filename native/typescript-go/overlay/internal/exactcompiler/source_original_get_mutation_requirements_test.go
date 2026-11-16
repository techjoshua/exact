package exactcompiler

import (
	"fmt"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These detached tokens test only the finite requirement algebra. They are not
// valid SOURCE recipes, creating edges, invocation receipts or graph state.
// Actual publication/current/APPLIED lifetime stays in unchanged collector tests.
func originalGetMutationRequirementsReference(s *sourceOriginalGetMutationSource) []sourceStagedOperationRequest {
	// Record requests describe the lexical Get; its real Effects role owns debt.
	required := []sourceStagedOperationRequest{originalGetMutationReader(s)}
	if s.intrinsicField != nil {
		for _, child := range originalIntrinsicFieldMutationRequirements(s) {
			required = appendEntryLawRequirement(required, child)
		}
	}
	for _, provider := range s.providers {
		required = appendEntryLawRequirement(required, provider.candidate)
		if provider.reader.producer.operation != nil {
			required = appendEntryLawRequirement(required, provider.reader)
			if provider.data.producer.operation != nil {
				required = appendEntryLawRequirement(required, provider.data)
			}
		}
	}
	for _, upstream := range s.upstreamBodies {
		required = appendEntryLawRequirement(required, upstream.request)
	}
	if s.record != nil {
		required = appendEntryLawRequirement(required, descriptorRecordGetEffectsRequest(s.request))
		required = appendEntryLawRequirement(required, s.record.view.delivery)
	}
	if s.nativeTarget != nil {
		root := &sourceStagedNativeGetSource{request: s.nativeTarget.root, get: s.nativeTarget.root.producer.operation.Expression()}
		required = appendEntryLawRequirement(required, nativeRootDebtRequest(root, "callee-get"))
	}
	if s.coverage.producer.operation != nil {
		required = append(required, s.coverage)
	}
	return required
}

func validOriginalGetMutationRequirementsReference(s *sourceOriginalGetMutationSource, required []sourceStagedOperationRequest) bool {
	allowed := originalGetMutationRequirementsReference(s)
	if len(required) != len(allowed) {
		return false
	}
	for index, request := range required {
		if !operationContainsRequest(allowed, request) || operationContainsRequest(required[:index], request) {
			return false
		}
	}
	return true
}

func TestOriginalGetMutationRequirementSetEquivalence(t *testing.T) {
	request := func(label string) sourceStagedOperationRequest {
		return sourceStagedOperationRequest{
			producer: sourceStagedOperationKey{declaration: new(ast.Node), operation: new(ast.Node), kind: relativeDemandEffects, selector: sourceStagedOperationSelector{field: label}},
			consumer: new(ast.Node), edge: label, use: new(ast.Node),
			cut: sourceRelativeCut{operation: new(ast.Node), reading: new(ast.Node)},
		}
	}
	reader, candidate, providerReader, data := request("reader"), request("candidate"), request("provider-reader"), request("data")
	upstream, coverage := request("upstream"), request("coverage")
	mixed := sourceOriginalGetMutationSource{request: reader, coverage: coverage, pending: true,
		providers: []sourceOriginalGetMutationProvider{
			{kind: originalGetMutationProviderUnsupported, candidate: candidate, data: data},
			{kind: originalGetMutationProviderReflective, candidate: candidate, reader: providerReader, data: data},
			{kind: originalGetMutationProviderReflective, candidate: upstream, reader: providerReader},
		},
		upstreamBodies: []sourceStagedMemberFieldBody{{request: upstream}, {request: candidate}},
	}
	many := sourceOriginalGetMutationSource{request: reader, coverage: coverage}
	for i := 0; i < 64; i++ {
		r := request(fmt.Sprintf("provider-%d", i))
		for repeat := 0; repeat < 4; repeat++ {
			many.providers = append(many.providers, sourceOriginalGetMutationProvider{candidate: r, reader: providerReader, data: data})
		}
	}
	duplicateCoverage := sourceOriginalGetMutationSource{request: reader, coverage: reader}
	cases := []struct {
		name   string
		source sourceOriginalGetMutationSource
	}{
		{"reader-only", sourceOriginalGetMutationSource{request: reader}},
		{"reader-coverage", sourceOriginalGetMutationSource{request: reader, coverage: coverage}},
		{"pending-known-and-unsupported", mixed},
		{"duplicate-heavy", many},
		{"terminal-coverage-multiplicity", duplicateCoverage},
		{"record-reader-delivery", sourceOriginalGetMutationSource{request: reader, record: &sourceDescriptorRecordGet{view: sourceNativeDescriptorView{delivery: upstream}}, coverage: coverage}},
		{"field-reader", sourceOriginalGetMutationSource{request: reader, nativeField: &sourceOriginalGetNativeField{field: providerReader}, providers: mixed.providers, coverage: coverage}},
		// An invalid detached installation contributes no authenticated installation
		// requirements, but the original list helper still retains its phase role.
		{"intrinsic-phase-shape", sourceOriginalGetMutationSource{request: reader, intrinsicField: &sourceOriginalIntrinsicFieldMutation{header: &sourceOriginalGetNativeField{field: providerReader}, phaseSource: upstream}, coverage: coverage}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &tc.source
			want := originalGetMutationRequirementsReference(s)
			got := originalGetMutationRequirements(s)
			if len(got) != len(want) || !operationPrefix(got, want, sameOperationRequest) {
				t.Fatal("ordered requirements or terminal multiplicity changed")
			}
			variants := [][]sourceStagedOperationRequest{nil, got}
			reversed := append([]sourceStagedOperationRequest(nil), got...)
			for l, r := 0, len(reversed)-1; l < r; l, r = l+1, r-1 {
				reversed[l], reversed[r] = reversed[r], reversed[l]
			}
			variants = append(variants, reversed, append(append([]sourceStagedOperationRequest(nil), got...), request("foreign")))
			if len(got) != 0 {
				variants = append(variants, got[:len(got)-1], append(append([]sourceStagedOperationRequest(nil), got...), got[0]))
				foreign := append([]sourceStagedOperationRequest(nil), got...)
				foreign[0] = request("replacement")
				variants = append(variants, foreign)
			}
			if len(got) > 1 {
				duplicate := append([]sourceStagedOperationRequest(nil), got...)
				duplicate[1] = duplicate[0]
				variants = append(variants, duplicate)
			}
			for _, required := range variants {
				if validOriginalGetMutationRequirements(s, required) != validOriginalGetMutationRequirementsReference(s, required) {
					t.Fatal("membership/duplicate/cardinality decision changed")
				}
			}
		})
	}
	cloned := cloneOriginalGetMutationSource(&mixed)
	if got, want := originalGetMutationRequirements(cloned), originalGetMutationRequirements(&mixed); len(got) != len(want) || !operationPrefix(got, want, sameOperationRequest) {
		t.Fatal("descriptive clone changed requirement identity/order")
	}
	prior := originalGetMutationRequirements(&mixed)
	next := mixed
	next.providers = append(append([]sourceOriginalGetMutationProvider(nil), mixed.providers...), sourceOriginalGetMutationProvider{candidate: request("new-pending")})
	if validOriginalGetMutationRequirements(&next, prior) || !validOriginalGetMutationRequirements(&mixed, prior) {
		t.Fatal("local validation reused a prior description or mutated old requirements")
	}
	if !validOriginalGetMutationRequirements(&next, originalGetMutationRequirements(&next)) {
		t.Fatal("fresh appended pending requirement lost")
	}
}

func TestOriginalGetMutationRequirementIdentityRefusers(t *testing.T) {
	nodes := make([]*ast.Node, 4)
	for i := range nodes {
		nodes[i] = new(ast.Node)
	}
	r := sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: nodes[0], operation: nodes[1], kind: relativeDemandEffects}, consumer: nodes[2], edge: "reader", use: nodes[3]}
	s := &sourceOriginalGetMutationSource{request: r}
	variants := []func(*sourceStagedOperationRequest){
		func(x *sourceStagedOperationRequest) { x.producer.declaration = new(ast.Node) },
		func(x *sourceStagedOperationRequest) { x.producer.operation = new(ast.Node) },
		func(x *sourceStagedOperationRequest) { x.producer.selector.occurrence = new(ast.Node) },
		func(x *sourceStagedOperationRequest) { x.producer.selector.association = new(ast.Node) },
		func(x *sourceStagedOperationRequest) { x.producer.selector.field = "foreign" },
		func(x *sourceStagedOperationRequest) { x.producer.kind++ },
		func(x *sourceStagedOperationRequest) { x.consumer = new(ast.Node) },
		func(x *sourceStagedOperationRequest) { x.edge += ":foreign" },
		func(x *sourceStagedOperationRequest) { x.use = new(ast.Node) },
		func(x *sourceStagedOperationRequest) { x.cut.operation = new(ast.Node) },
		func(x *sourceStagedOperationRequest) { x.cut.use = new(ast.Node) },
		func(x *sourceStagedOperationRequest) { x.cut.reading = new(ast.Node) },
		func(x *sourceStagedOperationRequest) { x.cut.initializing = new(ast.Node) },
		func(x *sourceStagedOperationRequest) { x.cut.returning = new(ast.Node) },
		func(x *sourceStagedOperationRequest) { x.cut.invoking = new(ast.Node) },
		// Opaque pointer identity only: this zero object is not an issued C.
		func(x *sourceStagedOperationRequest) { x.inputs = new(sourceRelativeInputEdge) },
		func(x *sourceStagedOperationRequest) { x.reading.operation = new(ast.Node) },
	}
	for i, change := range variants {
		wrong := r
		change(&wrong)
		if sameOperationRequest(r, wrong) || r == wrong || validOriginalGetMutationRequirements(s, []sourceStagedOperationRequest{wrong}) {
			t.Fatal("foreign requirement identity admitted", i)
		}
	}
}
