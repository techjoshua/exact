package exactcompiler

// callableCycleGroups identifies strongly connected callables before effect propagation.
// A path-expanding edge inside a group must widen instead of enumerating recursive data paths.
func callableCycleGroups(facts []callableFacts) []int {
	indices := make([]int, len(facts))
	low := make([]int, len(facts))
	groups := make([]int, len(facts))
	onStack := make([]bool, len(facts))
	stack := []int{}
	next, group := 0, 0
	for i := range indices {
		indices[i] = -1
	}
	var visit func(int)
	visit = func(index int) {
		indices[index], low[index] = next, next
		next++
		stack = append(stack, index)
		onStack[index] = true
		for _, target := range facts[index].targets {
			if indices[target] == -1 {
				visit(target)
				low[index] = min(low[index], low[target])
			} else if onStack[target] {
				low[index] = min(low[index], indices[target])
			}
		}
		if low[index] != indices[index] {
			return
		}
		for {
			member := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			onStack[member] = false
			groups[member] = group
			if member == index {
				break
			}
		}
		group++
	}
	for index := range facts {
		if indices[index] == -1 {
			visit(index)
		}
	}
	return groups
}
