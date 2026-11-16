package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

func TestStagedMemberPrivateAllocationWriterConnection(t *testing.T) {
	rows := []struct {
		name, source          string
		publishOther, exclude bool
		missingOwner          bool
	}{
		{"independent", stagedAssignmentStandardReceiverSource, true, true, false},
		{"true alias own writer", strings.Replace(stagedAssignmentStandardReceiverSource, "map.get=factory();return map.get({})", "const alias=map;alias.get=factory();return map.get({})", 1), true, true, false},
		{"unknown constructor", "declare const UnknownMap:typeof WeakMap;" + strings.Replace(stagedAssignmentStandardReceiverSource, "installOnly(){const map=new WeakMap", "installOnly(){const map=new UnknownMap", 1), true, false, false},
		{"demanded target", stagedAssignmentStandardReceiverSource, false, true, false},
		{"unavailable target owner", stagedAssignmentStandardReceiverSource, false, false, true},
		{"escaped current", strings.Replace(stagedAssignmentStandardReceiverSource, "return map.get({})", "map.get({});return map", 1), true, false, false},
		{"written target", strings.Replace(stagedAssignmentStandardReceiverSource, "installOnly(){const map=", "installOnly(){let map=", 1), true, false, false},
		{"formal target", strings.Replace(stagedAssignmentStandardReceiverSource, "installOnly(){const map=new WeakMap<object,object>();", "installOnly(map:WeakMap<object,object>){", 1), true, false, false},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			withStagedReturnProgram(t, row.source, func(owner *executableBodyOwner, creating *ast.Node) {
				file := ast.GetSourceFileOfNode(creating)
				facts := stagedReturnSourceFacts(file)
				restore := registerPendingMemberFacts(owner, facts)
				defer restore()
				work := registerCallableEffectWork(facts)
				var sites []*ast.Node
				var read, otherWrite, ownWrite *ast.Node
				walkNode(file.AsNode(), func(node *ast.Node) bool {
					if ast.IsNewExpression(node) {
						sites = append(sites, node)
					}
					region := enclosingCallableNode(node)
					if region != nil && region.Name() != nil {
						if plainStagedAssignment(node) {
							if region.Name().Text() == "invoke" {
								ownWrite = node
							} else if region.Name().Text() == "installOnly" {
								otherWrite = node
							}
						}
						if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && region.Name().Text() == "invoke" {
							read = node
						}
					}
					return true
				})
				if row.missingOwner {
					publisher := owner.pendingMemberPublishers[enclosingCallableNode(otherWrite)]
					publisher.live = false
					defer func() { publisher.live = true }()
				}
				for i, site := range sites {
					if i != 0 && !row.publishOther {
						continue
					}
					visitImplicitAccessors(site, owner.checker, nil, owner, enclosingCallableNode(site), nil, func(accessorCandidates) {})
				}
				request, ok := work.prepareConstructedResultSource(facts, work.memberNodes[enclosingCallableNode(read)], read, owner)
				root := work.operationRecipes[request.producer]
				if !ok || len(root.constructedGroup) != 1 {
					t.Fatal("actual original allocation/use source missing")
				}
				for _, role := range []string{"own-writers", "eager-inputs"} {
					request := constructedMemberRequest(&root.constructedGroup[0], role)
					pending := work.operationRecipes[request.producer]
					if !sameAdoptionSourceRequest(pending, request) {
						t.Fatalf("original %s factory request was refused", role)
					}
					observed := work.memberCoverageObserved
					work.memberCoverageObserved = nil
					borrowed := work.passiveConstructedSourceSupported(pending)
					work.memberCoverageObserved = observed
					if borrowed {
						t.Fatal("unobserved Get admitted a pending constructed role")
					}
					if pending.delta.extracted || len(work.operationIDs) != 0 {
						t.Fatal("pending source admission completed or activated a role")
					}
				}
				work.stageAssignment(facts, work.memberNodes[enclosingCallableNode(ownWrite)], ownWrite, owner)
				seen, excluded, own := false, false, false
				for _, recipe := range work.operationRecipes {
					source := recipe.memberSource
					if source == nil || source.coverage == nil || source.coverage.origin != sites[0] {
						continue
					}
					c := source.coverage
					if work.memberCoverageObserved[recipe.key] != work.operationGeneration {
						continue
					}
					seen = true
					otherRequired := false
					for _, required := range c.required {
						child := work.operationRecipes[required.producer].memberSource
						if child == nil {
							continue
						}
						otherRequired = otherRequired || child.candidate.operation == otherWrite
						own = own || child.candidate.operation == ownWrite
					}
					excluded = excluded || !otherRequired
				}
				if !seen || excluded != row.exclude || !own {
					t.Fatalf("original C exclusion missing: observed=%t excluded=%t own=%t", seen, excluded, own)
				}
				described := false
				for _, recipe := range work.operationRecipes {
					if s := recipe.memberSource; s != nil && s.writeEffects && s.candidate.operation == otherWrite {
						described = true
					}
				}
				if !described {
					t.Fatal("excluded writer description was discarded")
				}
				fresh := registerCallableEffectWork(facts)
				fresh.operationGeneration = work.operationGeneration
				for key, recipe := range fresh.operationRecipes {
					if recipe.memberSource != nil && recipe.memberSource.coverage != nil && recipe.memberSource.coverage.origin == sites[0] && fresh.passiveMemberSourceReady(recipe) {
						t.Fatalf("fresh graph borrowed cached source proof: %+v", key.selector)
					}
				}

			})
		})
	}
}

// The same positive source-use relation must reach the original writer branch
// before invocation input recovery, without activating the inventoried writer.
func TestStagedMemberPrivateWriterBeforeInputs(t *testing.T) {
	withStagedReturnProgram(t, stagedAssignmentStandardReceiverSource, func(owner *executableBodyOwner, creating *ast.Node) {
		file := ast.GetSourceFileOfNode(creating)
		facts := stagedReturnSourceFacts(file)
		restore := registerPendingMemberFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		var read, own, other *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			region := enclosingCallableNode(node)
			if region == nil || region.Name() == nil {
				return true
			}
			if plainStagedAssignment(node) {
				if region.Name().Text() == "invoke" {
					own = node
				} else if region.Name().Text() == "installOnly" {
					other = node
				}
			}
			if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && region.Name().Text() == "invoke" {
				read = node
			}
			return true
		})
		caller := work.memberNodes[enclosingCallableNode(read)]
		request, prepared := work.prepareConstructedResultSource(facts, caller, read, owner)
		root := work.operationRecipes[request.producer]
		if !prepared || len(root.constructedGroup) != 1 {
			t.Fatal("original source owner unavailable")
		}
		source := root.constructedGroup[0]
		q := newSourceDependencyQuery(read, owner.checker, owner, facts[caller].node)
		q.initializing, q.protectedMember = read, read.Expression()
		writerRevoke, installed := q.beginStagedWriterSource(func(sourceStagedWriterRead) bool {
			return work.publishStagedWriterRead(facts, q, constructedMemberRequest(&source, "own-writers"))
		})
		if !installed {
			t.Fatal("original writer loan unavailable")
		}
		defer writerRevoke()
		revoke, installed := work.beginStagedMemberWork(q, facts, request)
		if !installed {
			t.Fatal("original member loan unavailable")
		}
		defer revoke()
		b := q.stagedMember
		original := b.excludePrivateWriter
		excluded := false
		b.excludePrivateWriter = func(write, origin *ast.Node) bool {
			accepted := original(write, origin)
			if !accepted {
				return false
			}
			if write != other || write == own || !q.liveStagedMemberSource(b, b.get, b.read) {
				t.Fatal("excluded a current or unissued writer")
			}
			copied := *q
			assignment := sourceValueAssignment{left: write.AsBinaryExpression().Left, right: write.AsBinaryExpression().Right}
			if copied.excludeStagedPrivateWriter(b.get, b.read, assignment, origin) {
				t.Fatal("copied query borrowed the exclusion")
			}
			initializing := q.initializing
			q.initializing = write
			borrowed := original(write, origin)
			q.initializing = initializing
			if borrowed {
				t.Fatal("wrong physical cut borrowed the exclusion")
			}
			excluded = true
			return true
		}
		result := accessorCandidates{}
		q.standardConstructionMember(sourceConstructedMemberDemand{source: source.construction.site, projection: []string{"get"}, mode: accessorAcquire}, nil, &result, func(*ast.Node, []string, bool) {}, func([]sourceValue, []string, bool) {})
		if !excluded || len(facts[caller].summary.Calls) != 0 || len(facts[caller].staged.calls) != 0 {
			t.Fatal("early positive source relation absent or activated a body")
		}
		revoke()
		if original(other, source.construction.site) {
			t.Fatal("expired borrower retained proof authority")
		}
	})
}
