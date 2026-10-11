package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

type policySourceResult struct {
	policy    DataPolicy
	qualified bool
	subject   *PolicySubject
}

// Foreign source results preserve inferred policy which an ordinary checker return type cannot express.
// Cache declaration facts only within this analysis and checker generation. Recursive source queries
// use a visiting set, while declarations and aliases retain their native symbol identity.
func sourceCallableResultPolicy(declaration *ast.Node, c *checker.Checker, analysis *policyAnalysis) (DataPolicy, bool) {
	if declaration == nil || !ast.IsFunctionLike(declaration) || declaration.Body() == nil {
		return DataPolicy{}, false
	}
	if analysis.sourceResults == nil {
		analysis.sourceResults = make(map[*ast.Node]policySourceResult)
	}
	if analysis.sourceTypes == nil {
		analysis.sourceTypes = make(map[checker.TypeId]bool)
	}
	if cached, exists := analysis.sourceResults[declaration]; exists {
		return cached.policy, cached.qualified
	}
	subjects := policySubjects{symbols: make(map[ast.SymbolId]PolicySubject), calls: make(map[string]PolicySubject)}
	for id, subject := range analysis.subjects.symbols {
		subjects.symbols[id] = subject
	}
	visiting := make(map[*ast.Node]bool)
	var resolve func(*ast.Node) []PolicySubject
	var seed func(*ast.Node)
	seed = func(root *ast.Node) {
		walkNode(root, func(node *ast.Node) bool {
			if node.Parent != nil && ast.IsPartOfTypeNode(node) {
				return false
			}
			if ast.IsCallExpression(node) && isImportedSecretConsume(node.AsCallExpression().Expression, c) {
				return false
			}
			if target := policyInvocationTarget(node); target != nil {
				if signature := c.GetResolvedSignature(node); signature != nil {
					callee := signature.Declaration()
					if callee != nil && ast.IsFunctionLike(callee) && callee.Body() != nil {
						resolve(callee)
					}
				}
			}
			if !ast.IsIdentifier(node) && !ast.IsPropertyAccessExpression(node) && !ast.IsElementAccessExpression(node) {
				return true
			}
			if ast.IsDeclarationName(node) || isStaticPropertyName(node) {
				return true
			}
			for _, symbol := range policyMemberSymbols(node, c) {
				id := ast.GetSymbolId(symbol)
				if _, exists := subjects.symbols[id]; exists {
					continue
				}
				for _, owner := range symbol.Declarations {
					source := ast.GetSourceFileOfNode(owner)
					if source == nil {
						continue
					}
					if ast.IsGetAccessorDeclaration(owner) {
						resolve(owner)
					}
					if _, exists := subjects.symbols[id]; exists {
						break
					}
					policy, qualified := cachedPolicyFromCheckerType(c.GetTypeAtLocation(node), c, analysis.sourceTypes)
					annotations := policyNodeAnnotations(owner, source)
					origin := "import"
					if annotations.policy != nil {
						// Native secrecy remains authoritative over a sharing or placement annotation.
						if !qualified || !policy.Secret {
							policy = *annotations.policy
						}
						qualified = true
						origin = "annotation"
					}
					if qualified {
						subject := policySubject(owner, policyDeclarationKind(owner), ast.SymbolName(symbol), policy, origin)
						subject.ID = policyLocationID(source, "policy:source-input", owner.Pos(), subject.Name)
						subjects.symbols[id] = subject
					} else if ast.IsVariableDeclaration(owner) && owner.Initializer() != nil && !visiting[owner] {
						visiting[owner] = true
						seed(owner.Initializer())
						inputs := policyInputsForNode(owner.Initializer(), c, subjects)
						if len(inputs) != 0 {
							combined, _ := combineSubjectPolicies(inputs)
							subject := policySubject(owner, "declaration", ast.SymbolName(symbol), combined, "inference")
							subject.ID = policyLocationID(source, "policy:source-input", owner.Pos(), subject.Name)
							subjects.symbols[id] = subject
						}
						delete(visiting, owner)
					}
				}
			}
			return true
		})
	}
	resolve = func(callable *ast.Node) []PolicySubject {
		if cached, exists := analysis.sourceResults[callable]; exists {
			if cached.subject != nil {
				if name := callablePolicyNameNode(callable); name != nil {
					if symbol := c.GetSymbolAtLocation(name); symbol != nil {
						subjects.symbols[ast.GetSymbolId(c.GetTargetSymbol(symbol))] = *cached.subject
					}
				}
				return []PolicySubject{*cached.subject}
			}
			return nil
		}
		if visiting[callable] {
			return nil
		}
		visiting[callable] = true
		defer delete(visiting, callable)
		// Seed only returned expressions and their controlling statements. Unrelated body work
		// affects execution placement, rather than the policy of an otherwise public result.
		body := callable.Body()
		if ast.IsArrowFunction(callable) && !ast.IsBlock(body) {
			seed(body)
		} else {
			walkNode(body, func(node *ast.Node) bool {
				if node != body && ast.IsFunctionLike(node) {
					return false
				}
				if ast.IsReturnStatement(node) {
					seed(node.AsReturnStatement().Expression)
					for parent := node.Parent; parent != nil && parent != callable; parent = parent.Parent {
						if ast.IsIfStatement(parent) {
							seed(parent.AsIfStatement().Expression)
						}
						if ast.IsWhileStatement(parent) {
							seed(parent.AsWhileStatement().Expression)
						}
						if ast.IsDoStatement(parent) {
							seed(parent.AsDoStatement().Expression)
						}
						if ast.IsForStatement(parent) {
							seed(parent.AsForStatement().Condition)
						}
						if ast.IsForInStatement(parent) || ast.IsForOfStatement(parent) {
							seed(parent.AsForInOrOfStatement().Expression)
						}
						if ast.IsSwitchStatement(parent) {
							seed(parent.AsSwitchStatement().Expression)
						}
					}
					return false
				}
				return true
			})
		}
		inputs := callableReturnPolicyInputs(callable, c, subjects)
		if len(inputs) == 0 {
			analysis.sourceResults[callable] = policySourceResult{}
			return nil
		}
		name := callablePolicyNameNode(callable)
		if name != nil {
			if symbol := c.GetSymbolAtLocation(name); symbol != nil {
				combined, _ := combineSubjectPolicies(inputs)
				kind := "return"
				if ast.IsGetAccessorDeclaration(callable) {
					kind = "field"
				}
				subject := policySubject(callable, kind, ast.SymbolName(symbol), combined, "inference")
				subject.ID = policyLocationID(ast.GetSourceFileOfNode(callable), "policy:source-result", callable.Pos(), subject.Name)
				subjects.symbols[ast.GetSymbolId(c.GetTargetSymbol(symbol))] = subject
				analysis.sourceResults[callable] = policySourceResult{policy: combined, qualified: true, subject: &subject}
			}
		}
		return inputs
	}
	inputs := resolve(declaration)
	result := policySourceResult{qualified: len(inputs) != 0}
	if result.qualified {
		result.policy, _ = combineSubjectPolicies(inputs)
	}
	if _, exists := analysis.sourceResults[declaration]; !exists {
		analysis.sourceResults[declaration] = result
	}
	return result.policy, result.qualified
}
