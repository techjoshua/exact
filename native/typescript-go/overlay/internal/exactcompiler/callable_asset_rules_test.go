package exactcompiler

import (
	"fmt"
	"testing"
)

func TestCallableAssetRuleSnapshot(t *testing.T) {
	request := []AssetRule{{Extensions: []string{".css"}, Queries: []string{"raw"}, Kind: "style", ImportMode: "side-effect", EvaluationTarget: "both", DeliveryTarget: "embedded"}}
	owned := snapshotCallableAssetRules(request)
	if !sameCallableAssetRules(owned, request) || !sameCallableAssetRules(nil, []AssetRule{}) {
		t.Fatal("equal declaration values must reuse the callable cache")
	}
	if sameCallableAssetRules(owned, nil) {
		t.Fatal("removing declarations must invalidate the callable cache")
	}
	for _, change := range []func(*AssetRule){
		func(rule *AssetRule) { rule.Kind = "other" },
		func(rule *AssetRule) { rule.ImportMode = "value" },
		func(rule *AssetRule) { rule.EvaluationTarget = "server" },
		func(rule *AssetRule) { rule.DeliveryTarget = "external" },
		func(rule *AssetRule) { rule.Extensions[0] = ".resource" },
		func(rule *AssetRule) { rule.Queries[0] = "url" },
	} {
		changed := snapshotCallableAssetRules(request)
		change(&changed[0])
		if sameCallableAssetRules(owned, changed) {
			t.Fatal("changed declaration retained the previous generation")
		}
	}
	request[0].Extensions[0] = ".resource"
	request[0].Queries[0] = "url"
	if owned[0].Extensions[0] != ".css" || owned[0].Queries[0] != "raw" || sameCallableAssetRules(owned, request) {
		t.Fatal("request mutation crossed the cache snapshot ownership boundary")
	}
	ordered := []AssetRule{{Kind: "first"}, {Kind: "second"}}
	if sameCallableAssetRules(ordered, []AssetRule{ordered[1], ordered[0]}) {
		t.Fatal("rule precedence changed without cache invalidation")
	}
}

func BenchmarkCallableAssetRules(b *testing.B) {
	rules := []AssetRule{{Extensions: []string{".css", ".svg"}, Queries: []string{"raw"}, Kind: "style", EvaluationTarget: "both", DeliveryTarget: "embedded"}}
	owned := snapshotCallableAssetRules(rules)
	b.Run("formatted-key", func(b *testing.B) {
		key := fmt.Sprintf("%#v", rules)
		b.ReportAllocs()
		for b.Loop() {
			if fmt.Sprintf("%#v", rules) != key {
				b.Fatal("stable declaration changed")
			}
		}
	})
	b.Run("owned-values", func(b *testing.B) {
		b.ReportAllocs()
		for b.Loop() {
			if !sameCallableAssetRules(owned, rules) {
				b.Fatal("stable declaration changed")
			}
		}
	})
}
