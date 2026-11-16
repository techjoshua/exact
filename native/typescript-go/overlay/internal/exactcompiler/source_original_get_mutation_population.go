package exactcompiler

// Coverage contains both contributors and original upstream provenance. The
// purpose is attached by the source factory before early publication; final
// all-MAY extraction governs completeness, never a late population removal.
func originalGetMutationCoveragePopulation(c *sourceStagedMemberCoverage) []sourceStagedOperationRequest {
	if c == nil {
		return nil
	}
	var out []sourceStagedOperationRequest
	for _, r := range c.required {
		if !stagedMemberFieldBodyUpstream(c.fieldBodies, r) {
			out = append(out, r)
		}
	}
	return out
}
func originalGetMutationCoveragePartitionComplete(c *sourceStagedMemberCoverage) bool {
	if c == nil {
		return false
	}
	if len(c.fieldBodies) == 0 {
		return true
	}
	if !c.extracted {
		return false
	}
	for _, d := range c.fieldBodies {
		if d.installation == nil || !validStagedMemberFieldBody(d, d.parent, c.cut, c.generation) {
			return false
		}
	}
	return true
}
func sameOriginalGetMutationCoveragePartition(s *sourceOriginalGetMutationSource, c *sourceStagedMemberCoverage) bool {
	if s == nil || c == nil || s.generation != c.generation || s.queryCut != c.cut || !sameStagedMemberFieldBodies(s.upstreamBodies, c.fieldBodies) {
		return false
	}
	population := originalGetMutationCoveragePopulation(c)
	return len(s.population) == len(population) && operationPrefix(s.population, population, sameOperationRequest) && (s.pending || originalGetMutationCoveragePartitionComplete(c))
}
func originalGetMutationUpstreamRequirements(s *sourceOriginalGetMutationSource) []sourceStagedOperationRequest {
	var out []sourceStagedOperationRequest
	for _, d := range s.upstreamBodies {
		out = appendEntryLawRequirement(out, d.request)
	}
	return out
}

// Unqualified factory relations remain potential providers AND discovery debt.
// A later query cannot silently reclassify a published provider prefix.
func stagedMemberFieldBodyUpstream(in []sourceStagedMemberFieldBody, r sourceStagedOperationRequest) bool {
	found := false
	for _, d := range in {
		if sameOperationRequest(d.request, r) {
			if d.installation == nil {
				return false
			}
			found = true
		}
	}
	return found
}
