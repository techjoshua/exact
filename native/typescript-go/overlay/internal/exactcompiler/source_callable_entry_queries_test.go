package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Reentry must retain an unproved operation and the caller's context independently
// of the historical advisory gauge, which can pass below zero.
func TestSourceCallableEntryQueryState(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		request := callableEntryRequest(t, callableEntrySource, target)
		session := NewSession()
		response := session.Execute(request)
		if hasErrorDiagnostic(response.Diagnostics) || callableEntryPage(t, response).Placement != "isomorphic" {
			t.Fatal("positive fixture not qualified")
		}
		checked := false
		for _, project := range session.projects {
			file := project.program.GetSourceFile(request.ID)
			if file == nil || project.callableCache.owner == nil {
				continue
			}
			checked = true
			owner := project.callableCache.owner
			var direct, member, origin *ast.Node
			walkNode(file.AsNode(), func(n *ast.Node) bool {
				if ast.IsFunctionDeclaration(n) && n.Name() != nil && n.Name().Text() == "source" {
					origin = n
				}
				p := enclosingCallableNode(n)
				if p == nil || p.Name() == nil || p.Name().Text() != "Page" {
					return true
				}
				if ast.IsCallExpression(n) && ast.IsIdentifier(n.AsCallExpression().Expression) && n.AsCallExpression().Expression.Text() == "saved" {
					direct = n
				}
				if ast.IsPropertyAccessExpression(n) && n.AsPropertyAccessExpression().Name().Text() == "run" && n.Parent != nil && ast.IsTypeOfExpression(n.Parent) {
					member = n
				}
				return true
			})
			if direct == nil || member == nil || origin == nil {
				t.Fatal("fixture operation absent")
			}
			receiver := member.AsPropertyAccessExpression().Expression
			query := func(fuel int) sourceValueQuery {
				return sourceValueQuery{owner: owner.values, executable: owner, remaining: fuel, active: map[*ast.Node]bool{direct: true, origin: true}, reading: receiver}
			}

			for _, fuel := range []int{0, 1, 4096} {
				q := query(fuel)
				q.reading = direct
				q.initializing = origin
				q.invoking = origin
				q.returning = origin
				q.receiverCandidates(direct, nil)
				if !q.active[direct] || !q.active[origin] || q.initializing != origin || q.reading != direct || q.invoking != origin || q.returning != origin {
					t.Fatal("acquisition lost caller state")
				}
			}
		}
		if !checked {
			t.Fatal("source owner unavailable")
		}
	}
}
