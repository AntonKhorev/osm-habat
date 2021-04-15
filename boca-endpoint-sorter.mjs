export default class EndpointSorter {
	constructor() {
		this.entries=[]
		this.graph=new Map()
	}
	add(entry,node1,node2) {
		this.entries.push([entry,node1])
		if (node1==null || node2==null) return
		const addEdge=(n1,n2)=>{
			if (!this.graph.has(n1)) {
				this.graph.set(n1,[]) // [] should be a sorted array - actually it should be a sorted tree
			}
			this.graph.get(n1).push([n2,entry]) // this should be an insertion into an array sorted by n2
		}
		addEdge(node1,node2)
		addEdge(node2,node1)
	}
	*[Symbol.iterator]() {
		const findStartingNode=(startingNode)=>{ // get either a leaf with a lowest id or, if no eaves exist, any node with a lowest id
			const visitedNodes=new Set()
			const rec=(node)=>{
				if (visitedNodes.has(node)) return []
				visitedNodes.add(node)
				const edges=this.graph.get(node)
				let curNode=node
				let curIsLeaf=edges.length<=1
				for (const [neighborNode] of edges) {
					const [recNode,recIsLeaf]=rec(neighborNode)
					if (recNode==null) continue
					if (curIsLeaf && !recIsLeaf) continue
					if (recIsLeaf && !curIsLeaf) {
						curNode=recNode
						curIsLeaf=recIsLeaf
					} else if (recNode<curNode) {
						curNode=recNode
					}
				}
				return [curNode,curIsLeaf]
			}
			const [node]=rec(startingNode)
			return node
		}
		const visitedEntries=new Set()
		const getComponent=(node)=>{
			const component=[]
			const rec=(node)=>{
				const edges=this.graph.get(node)
				edges.sort(([n1],[n2])=>n1-n2) // should have been sorted, but since it wasn't, sort it now
				for (const [neighborNode,entry] of edges) {
					if (visitedEntries.has(entry)) continue
					visitedEntries.add(entry)
					component.push(entry) // TODO yield it
					rec(neighborNode)
				}
			}
			rec(node)
			return component
		}
		for (const [entry,node] of this.entries) {
			if (visitedEntries.has(entry)) continue
			if (!this.graph.has(node)) {
				visitedEntries.add(entry)
				yield entry
				continue
			}
			yield* getComponent(findStartingNode(node))
		}
	}
}
