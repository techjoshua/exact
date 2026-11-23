package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// sourceHasOwnWalk retains private handler methods for immutable local Proxy bindings
// during one ordinary effect walk. It contributes only possible trap execution.
type sourceHasOwnWalk struct {
	uses                   *sourcePrivateUses
	selected, construction *ast.Node
	checker                *checker.Checker
	regions                map[*ast.Node]*sourceMemberOperationRegion
	dynamic                bool
	traps                  map[*ast.Node]*ast.Node
	reached                func(call, trap *ast.Node)
}

// Each recursive walk owns its selection until its own children finish.
type sourceHasOwnSelection struct {
	operation, operand, key, trap *ast.Node
	keyVisited                    bool
}

func (w *sourceHasOwnWalk) selectOperation(n *ast.Node) sourceHasOwnSelection {
	if w.construction == n {
		w.construction = nil
		args := n.AsNewExpression().Arguments
		decl := n.Parent
		if args != nil && len(args.Nodes) == 2 && (ast.IsObjectLiteralExpression(args.Nodes[0]) || ast.IsArrayLiteralExpression(args.Nodes[0])) && ast.IsObjectLiteralExpression(args.Nodes[1]) && ast.IsVariableDeclaration(decl) && decl.Initializer() == n && ast.IsIdentifier(decl.Name()) && decl.Parent.Flags&ast.NodeFlagsConst != 0 {
			return sourceHasOwnSelection{operation: n, operand: args.Nodes[1]}
		}
	}
	if w.selected == n {
		w.selected = nil
		call := n.AsCallExpression()
		args := call.Arguments

		if args != nil && len(args.Nodes) == 2 && ast.IsIdentifier(args.Nodes[0]) && (ast.IsStringLiteral(args.Nodes[1]) || ast.IsNumericLiteral(args.Nodes[1])) {
			return sourceHasOwnSelection{operation: n, operand: args.Nodes[0], key: args.Nodes[1]}
		}
	}
	return sourceHasOwnSelection{}
}

func (s *sourceHasOwnSelection) receive(child *ast.Node, w *sourceHasOwnWalk) {
	if child == s.key {
		s.keyVisited = true
	}
	if child != s.operand {
		return
	}
	if s.key != nil {
		s.trap = w.traps[s.operation]
		delete(w.traps, s.operation)
		return
	}
	members := child.AsObjectLiteralExpression().Properties.Nodes
	if len(members) == 1 && ast.IsMethodDeclaration(members[0]) && ast.IsIdentifier(members[0].Name()) && members[0].Name().Text() == "getOwnPropertyDescriptor" {
		method := members[0]
		if method.AsMethodDeclaration().AsteriskToken != nil {
			return
		}
		region := w.regions[method]
		// The fresh inline handler is accessible only as the trap receiver.
		// Reject even dormant receiver uses and closures that could capture it.
		if w.dynamic || region == nil || len(region.receivers) != 0 || len(region.lexicalChildren) != 0 || len(region.hazards) != 0 {
			return
		}
		// A super property operation also passes the handler as receiver.
		for _, op := range region.members {
			if (ast.IsElementAccessExpression(op) || ast.IsPropertyAccessExpression(op)) && op.Expression().Kind == ast.KindSuperKeyword {
				return
			}
		}
		for _, param := range method.AsMethodDeclaration().Parameters.Nodes {
			if !ast.IsIdentifier(param.Name()) || param.Initializer() != nil {
				return
			}
		}
		s.trap = method
	}
}

func (s *sourceHasOwnSelection) finish(w *sourceHasOwnWalk) {
	if s.trap == nil {
		return
	}
	if s.key == nil {
		decl := s.operation.Parent
		pop := w.uses
		if pop == nil || !pop.complete || pop.refused || len(pop.unresolved[""]) != 0 || len(pop.unresolved[decl.Name().Text()]) != 0 {
			return
		}
		sym := w.checker.GetSymbolAtLocation(decl.Name())
		if sym == nil || sym.ValueDeclaration != decl {
			return
		}
		uses := pop.uses[ast.GetSymbolId(sym)]
		if len(uses) != 1 {
			return
		}
		use := uses[0].node
		call := use.Parent
		if !ast.IsCallExpression(call) || len(call.AsCallExpression().Arguments.Nodes) != 2 || call.AsCallExpression().Arguments.Nodes[0] != use {
			return
		}
		if w.traps == nil {
			w.traps = make(map[*ast.Node]*ast.Node)
		}
		w.traps[call] = s.trap
	} else if s.keyVisited {
		w.reached(s.operation, s.trap)
	}
}
