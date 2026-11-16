package exactcompiler

import "testing"

// Mutations here are detached negative-control descriptions. No graph state,
// event, APPLIED receipt or currentness is manufactured to exercise the path.
func TestNativeFieldCoveragePopulationLifetime(t *testing.T) {
	withNativeFieldPopulationCollection(t, func(work *callableEffectWork) {
		reached := false
		for _, recipe := range work.operationRecipes {
			if recipe.memberSource == nil {
				continue
			}
			s := recipe.memberSource.originalGetMutation
			if s == nil || s.nativeField == nil || len(s.upstreamBodies) == 0 {
				continue
			}
			c := work.operationRecipes[s.coverage.producer].memberSource.coverage
			if !originalGetMutationCoveragePartitionComplete(c) || !sameOriginalGetMutationCoveragePartition(s, c) {
				t.Fatal("original complete partition UNREACHED")
			}
			d := c.fieldBodies[0]
			if !validStagedMemberFieldBody(d, s.request, s.queryCut, s.generation) {
				t.Fatal("original producer provenance UNREACHED")
			}
			refuse := func(label string, wrong sourceStagedMemberFieldBody) {
				t.Helper()
				if validStagedMemberFieldBody(wrong, s.request, s.queryCut, s.generation) {
					t.Fatal(label, "accepted")
				}
			}
			wrong := d
			wrong.generation = &projectGeneration{}
			refuse("foreign generation", wrong)
			wrong = d
			wrong.cut.use = d.operation
			refuse("semantic cut", wrong)
			wrong = d
			wrong.physicalCut.operation = d.operation
			refuse("physical cut", wrong)
			wrong = d
			wrong.relation.body = d.operation
			refuse("body owner", wrong)
			wrong = d
			wrong.parent = sourceStagedOperationRequest{}
			refuse("phase owner", wrong)
			copy := *c
			copy.fieldBodies = nil
			if sameOriginalGetMutationCoveragePartition(s, &copy) {
				t.Fatal("missing classification accepted")
			}
			copy = *c
			copy.fieldBodies = cloneStagedMemberFieldBodies(c.fieldBodies)
			copy.fieldBodies[0].installation = nil
			if originalGetMutationCoveragePartitionComplete(&copy) {
				t.Fatal("unqualified discovery became complete")
			}
			copy = *c
			copy.extracted = false
			if originalGetMutationCoveragePartitionComplete(&copy) {
				t.Fatal("unextracted all-MAY inventory became complete")
			}
			cloned := cloneOriginalGetMutationSource(s)
			if !sameOriginalGetMutationSource(s, cloned) || !operationContainsRequest(originalGetMutationRequirements(cloned), d.request) {
				t.Fatal("clone lost description or upstream debt")
			}
			cloned.upstreamBodies[0].installation = nil
			if s.upstreamBodies[0].installation == nil {
				t.Fatal("clone aliased classification")
			}
			fresh := callableEffectWork{}
			if fresh.originalGetMutationCurrent(recipe) {
				t.Fatal("fresh work inherited SOURCE authority")
			}
			// Prefix rejection uses the real extracted coverage, never forced state X.
			added := *c
			added.fieldBodies = cloneStagedMemberFieldBodies(c.fieldBodies)
			extra := d
			extra.operation = d.region
			added.fieldBodies = append(added.fieldBodies, extra)
			if stagedMemberCoverageBodyRefinement(c, &added) {
				t.Fatal("sealed classification prefix grew")
			}
			reached = true
		}
		if !reached {
			t.Fatal("real producer partition lifetime controls UNREACHED")
		}
	})
}
