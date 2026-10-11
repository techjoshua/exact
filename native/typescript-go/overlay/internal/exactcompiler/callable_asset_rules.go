package exactcompiler

import "slices"

// sameCallableAssetRules compares request-owned declarations without formatting or
// allocating a cache key. Rule order remains significant because matching is ordered.
func sameCallableAssetRules(left, right []AssetRule) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		a, b := &left[index], &right[index]
		if a.Kind != b.Kind || a.ImportMode != b.ImportMode || a.EvaluationTarget != b.EvaluationTarget || a.DeliveryTarget != b.DeliveryTarget ||
			!slices.Equal(a.Extensions, b.Extensions) || !slices.Equal(a.Queries, b.Queries) {
			return false
		}
	}
	return true
}

// snapshotCallableAssetRules isolates cache ownership from subsequent request
// mutation. Only replacement generations allocate declaration and selector slices.
func snapshotCallableAssetRules(rules []AssetRule) []AssetRule {
	owned := slices.Clone(rules)
	for index := range owned {
		owned[index].Extensions = slices.Clone(owned[index].Extensions)
		owned[index].Queries = slices.Clone(owned[index].Queries)
	}
	return owned
}
