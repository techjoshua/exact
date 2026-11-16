package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

func TestOriginalNativePushPrefixAuthority(t *testing.T) {
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		id, entered := work.operationIDs[root.producer]
		if !entered {
			t.Fatal("ENTRY: original Set root absent")
		}
		sub := work.operations[id.index].subscribers[sourceStagedOperationConsumer{root.consumer, root.edge}]
		if sub == nil || sub.blocked || sub.applied != work.operations[id.index].revision {
			t.Fatal("ENTRY: writer has not consumed current prefix")
		}
		var access sourceQualifiedReadWrite
		for _, a := range sub.readWrites {
			if a.mutation == "array-mutation" {
				access = a
			}
		}
		s := work.operationRecipes[access.arrayCall.producer].nativeGet
		if s == nil || !work.arrayPushPrefixCurrent(s) || !work.arrayPushAccessCurrent(access) || !validArrayPushRecipe(work.operationRecipes[s.request.producer]) {
			t.Fatal("ENTRY: authentic issued array mutation absent")
		}
		i := s.effectsSource.arrayIssuer
		if i == nil || !i.issued || i.arrayReceipt != s.effectsSource || i.arrayQuery != nil || i.active || i.self != nil || i.live() {
			t.Fatal("prefix retained/rearmed a Call query or execution loan")
		}
		if s.arrayPush.binding != access.binding || s.arrayPush.receiver != access.reference || s.arrayPush.binding.Initializer() != s.arrayPush.origin || !stagedEmptyArrayDataConstruction(s.arrayPush.origin) || s.arrayPush.cut.use != nil {
			t.Fatal("source prefix lost declaration-relative empty-array identity")
		}
		if s.calleeEntry != nil || work.currentNativeCalleeEffects(s) != nil || work.nativeEffectsSourceCurrent(work.operationRecipes[s.request.producer]) {
			t.Fatal("mutation prefix granted actual callee/current authority")
		}
		for _, role := range []string{"callee-get", "eager-inputs", "algorithm"} {
			r := work.operationRecipes[nativeRootDebtRequest(s, role).producer]
			if !validArrayPushRecipe(r) || r.delta.extracted {
				t.Fatal("prefix completed an independently unpaid native phase", role)
			}
		}
		wrongCut := *s
		wrongCut.arrayPush = cloneArrayPushEffects(s.arrayPush)
		wrongCut.arrayPush.cut.initializing = s.arrayPush.argument
		if !validArrayPushSource(&wrongCut) || work.arrayPushPrefixCurrent(&wrongCut) {
			t.Fatal("otherwise eligible wrong original publisher cut accepted")
		}
		wrongRoot := *s
		wrongRoot.request.edge = nativeRootDebtRequest(s, "algorithm").edge
		if !validArrayPushSource(&wrongRoot) || work.arrayPushPrefixCurrent(&wrongRoot) {
			t.Fatal("otherwise eligible foreign original root receipt accepted")
		}
		copied := *s
		r := *s.effectsSource
		issuer := *i
		r.arrayIssuer, copied.effectsSource = &issuer, &r
		if !validArrayPushSource(&copied) || work.arrayPushPrefixCurrent(&copied) {
			t.Fatal("copied issuer/receipt granted original publication authority")
		}
		for _, mode := range []string{"mutation kind", "Call source omission"} {
			bad := cloneQualifiedReadWrites([]sourceQualifiedReadWrite{access})
			if mode == "mutation kind" {
				bad[0].mutation = "field-write"
			} else {
				bad[0].arrayCall = sourceStagedOperationRequest{}
			}
			before := len(sub.readWrites)
			if work.applySetReadWrites(sourceStagedOperationUse{request: root}, bad) || len(sub.readWrites) != before {
				t.Fatal("real writer accepted invalid native payload", mode)
			}
		}
	})
}

// Detached source equality/fingerprints do not transport the original graph's
// publisher or consumed payload. Both real Programs independently establish entry.
func TestOriginalNativePushCloneAndLifetime(t *testing.T) {
	var expired func() bool
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		factIndex, recipeIndex, atomIndex := -1, -1, -1
		var source *sourceStagedNativeGetSource
		for fi := range facts {
			for ri, recipe := range facts[fi].staged.operationRecipes {
				if recipe.key != root.producer {
					continue
				}
				for ai, access := range recipe.delta.readWrites {
					if access.mutation == "array-mutation" {
						factIndex, recipeIndex, atomIndex = fi, ri, ai
						source = work.operationRecipes[access.arrayCall.producer].nativeGet
					}
				}
			}
		}
		if source == nil || !work.arrayPushPrefixCurrent(source) {
			t.Fatal("ENTRY: original produced native mutation absent")
		}
		original := callableAnalysis{facts: facts}
		fingerprint := callableAnalysisFingerprint(original)
		clone := func() callableAnalysis {
			out := callableAnalysis{facts: make([]callableFacts, len(facts))}
			for i := range facts {
				out.facts[i] = cloneProjectCallableFact(facts[i])
			}
			return out
		}
		detached := clone()
		if callableAnalysisFingerprint(detached) != fingerprint {
			t.Fatal("equal detached mutation changed semantic fingerprint")
		}
		fresh := registerCallableEffectWork(detached.facts)
		found := false
		for _, recipe := range fresh.operationRecipes {
			if recipe.key != source.request.producer {
				continue
			}
			found = true
			if !sameNativeGetSource(recipe.nativeGet, source) || !validArrayPushRecipe(recipe) || recipe.nativeGet.effectsSource.arrayIssuer != nil || recipe.nativeGet.arrayPush == source.arrayPush || work.arrayPushPrefixCurrent(recipe.nativeGet) || fresh.arrayPushPrefixCurrent(recipe.nativeGet) {
				t.Fatal("detached description retained issuer or shared mutable relation")
			}
		}
		if !found || len(fresh.operationIDs) != 0 {
			t.Fatal("clone lost source description or manufactured enrolled graph")
		}
		for _, field := range []string{"mutation", "argument relation"} {
			changed := clone()
			if field == "mutation" {
				changed.facts[factIndex].staged.operationRecipes[recipeIndex].delta.readWrites[atomIndex].mutation = "other"
			} else {
				for fi := range changed.facts {
					for ri := range changed.facts[fi].staged.operationRecipes {
						s := changed.facts[fi].staged.operationRecipes[ri].nativeGet
						if s != nil && s.arrayPush != nil {
							s.arrayPush.argument = root.use.AsBinaryExpression().Right
						}
					}
				}
			}
			if callableAnalysisFingerprint(changed) == fingerprint || callableAnalysisFingerprint(original) != fingerprint {
				t.Fatal("native semantic content omitted or original storage changed", field)
			}
		}
		withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(otherOwner *executableBodyOwner, otherFile *ast.SourceFile, otherFacts []callableFacts, other *callableEffectWork) {
			otherRoot := originalSetEffectsRoot(t, otherFile, other)
			id, entered := other.operationIDs[otherRoot.producer]
			if !entered {
				t.Fatal("ENTRY: second Program original Set absent")
			}
			sub := other.operations[id.index].subscribers[sourceStagedOperationConsumer{otherRoot.consumer, otherRoot.edge}]
			if sub == nil || sub.blocked || sub.applied != other.operations[id.index].revision {
				t.Fatal("ENTRY: second Program writer prefix absent")
			}
			var next *sourceStagedNativeGetSource
			for _, a := range sub.readWrites {
				if a.mutation == "array-mutation" {
					next = other.operationRecipes[a.arrayCall.producer].nativeGet
				}
			}
			if next == nil || !other.arrayPushPrefixCurrent(next) {
				t.Fatal("ENTRY: second Program authentic native source absent")
			}
			if work.arrayPushPrefixCurrent(next) || other.arrayPushPrefixCurrent(source) {
				t.Fatal("cross Program/work/generation source receipt accepted")
			}
		})
		expired = func() bool { return work.arrayPushPrefixCurrent(source) }
	})
	if expired == nil || expired() {
		t.Fatal("expired Program retained native prefix authority")
	}
}
