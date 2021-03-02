// works only with ids

class ParentChecker {
	constructor() {
		this.previousWays={}
		this.currentWays={}
		this.graph={}
	}
	addPreviousWay(way,nodes) {
		this.previousWays[way]=this.endNodePair(nodes)
	}
	addCurrentWay(way,nodes) {
		this.currentWays[way]=this.endNodePair(nodes)
		const [n1,n2]=this.endNodePair(nodes)
		if (!this.graph[n1]) this.graph[n1]=[]
		this.graph[n1].push([n2,way,null])
		if (!this.graph[n2]) this.graph[n2]=[]
		this.graph[n2].push([n1,way,null])
	}
	getParentWay(way) { // defined only for new ways
		if (this.previousWays[way]) throw new Error('previously existing way '+way)
		if (!this.currentWays[way]) throw new Error('unregistered way '+way)
		if (!this.parentCandidates) this.computeParentCandidates()
		//if (this.previousWays[way]) return way // since we don't consider way with unmodified ends to be a parent, but it needs to be its own parent
		if (this.parentCandidates[way]?.size==1) {
			const [parentWay]=this.parentCandidates[way]
			return parentWay
		}
	}

	// private:
	endNodePair(nodes) {
		const n1=nodes[0]
		const n2=nodes[nodes.length-1]
		if (n1<n2) { // don't need to sort
			return [n1,n2]
		} else {
			return [n2,n1]
		}
	}
	computeParentCandidates() {
		this.parentCandidates={}
		for (const [previousWay,[pn1,pn2]] of Object.entries(this.previousWays)) {
			if (this.currentWays[previousWay]) {
				const [cn1,cn2]=this.currentWays[previousWay]
				if (pn1==cn1 && pn2==cn2) continue // don't consider way with unmodified ends to be a parent
			}
			const addParentCandidateFor=(way)=>{
				if (!this.parentCandidates[way]) this.parentCandidates[way]=new Set()
				this.parentCandidates[way].add(previousWay)
			}
			const rec=(n1)=>{
				if (n1==pn2) return true
				if (!this.graph[n1]) return false
				let isEndReached=false
				for (const edge of this.graph[n1]) {
					const [n2,way,visitedByWay]=edge
					if (visitedByWay==previousWay) continue
					edge[2]=previousWay
					if (rec(n2)) {
						addParentCandidateFor(way)
						isEndReached=true
					}
				}
				return isEndReached
			}
			rec(pn1)
		}
	}
}

module.exports=ParentChecker
