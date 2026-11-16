package exactcompiler

import (
	"fmt"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Cost cutovers must never change the finite requirement law. These detached
// request identities test algebra only; they do not manufacture SOURCE/current
// or invocation authority. Genuine collector lifetime controls remain separate.
func TestOriginalGetMutationRequirementCutoverEquivalence(t *testing.T) {
	for _, count := range []int{63, 64, 65, 66, 129} {
		t.Run(fmt.Sprintf("requirements-%d", count), func(t *testing.T) {
			request := func(label string) sourceStagedOperationRequest {
				return sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: new(ast.Node), operation: new(ast.Node), kind: relativeDemandEffects}, edge: label}
			}
			s := &sourceOriginalGetMutationSource{request: request("reader"), coverage: request("coverage"), pending: true}
			for i := 0; i < count-2; i++ {
				s.providers = append(s.providers, sourceOriginalGetMutationProvider{candidate: request(fmt.Sprintf("pending-%d", i))})
			}
			want := originalGetMutationRequirementsReference(s)
			got := originalGetMutationRequirements(s)
			if len(got) != count || !operationPrefix(got, want, sameOperationRequest) {
				t.Fatal("ordered requirement construction changed")
			}
			variants := [][]sourceStagedOperationRequest{nil, got, got[:len(got)-1]}
			reverse := append([]sourceStagedOperationRequest(nil), got...)
			for l, r := 0, len(reverse)-1; l < r; l, r = l+1, r-1 {
				reverse[l], reverse[r] = reverse[r], reverse[l]
			}
			variants = append(variants, reverse)
			for _, foreign := range []sourceStagedOperationRequest{got[0], request("foreign")} {
				wrong := append([]sourceStagedOperationRequest(nil), got...)
				wrong[len(wrong)-1] = foreign
				variants = append(variants, wrong)
			}
			for _, required := range variants {
				if validOriginalGetMutationRequirements(s, required) != validOriginalGetMutationRequirementsReference(s, required) {
					t.Fatal("membership/uniqueness decision changed at cost cutover")
				}
			}
			// A repeated terminal coverage must reject even a unique same-length
			// replacement vector on either side of the cost cutoff.
			s.coverage = s.request
			duplicateCoverage := originalGetMutationRequirements(s)
			uniqueForeign := append([]sourceStagedOperationRequest(nil), duplicateCoverage...)
			uniqueForeign[len(uniqueForeign)-1] = request("unique-foreign")
			for _, required := range [][]sourceStagedOperationRequest{duplicateCoverage, uniqueForeign} {
				if validOriginalGetMutationRequirements(s, required) || validOriginalGetMutationRequirementsReference(s, required) {
					t.Fatal("terminal coverage multiplicity weakened")
				}
			}
		})
	}
}
