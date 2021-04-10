// works only with ids

export class ParentChecker {
	constructor() {
		this.previousWays=new Map()
		this.currentWays=new Map()
		this.graph=new Map()
	}
	addPreviousWay(way,nodes) {
		if (this.previousWays.has(way)) throw new Error('already added previous way '+way)
		this.previousWays.set(way,this.endNodePair(nodes))
	}
	addCurrentWay(way,nodes) {
		if (this.currentWays.has(way)) throw new Error('already added current way '+way)
		this.currentWays.set(way,this.endNodePair(nodes))
		const [n1,n2]=this.endNodePair(nodes)
		if (!this.graph.has(n1)) this.graph.set(n1,[])
		this.graph.get(n1).push([n2,way,null])
		if (!this.graph.has(n2)) this.graph.set(n2,[])
		this.graph.get(n2).push([n1,way,null])
	}
	getParentWay(way) { // defined only for new ways
		if (this.previousWays.has(way)) throw new Error('previously existing way '+way)
		if (!this.currentWays.has(way)) throw new Error('unregistered way '+way)
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
		for (const [previousWay,[pn1,pn2]] of this.previousWays) {
			if (this.currentWays.has(previousWay)) {
				const [cn1,cn2]=this.currentWays.get(previousWay)
				if (pn1==cn1 && pn2==cn2) continue // don't consider way with unmodified ends to be a parent
			}
			const addParentCandidateFor=(way)=>{
				if (!this.parentCandidates[way]) this.parentCandidates[way]=new Set()
				this.parentCandidates[way].add(previousWay)
			}
			const rec=(n1)=>{
				if (n1==pn2) return true
				if (!this.graph.has(n1)) return false
				let isEndReached=false
				for (const edge of this.graph.get(n1)) {
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
export { ParentChecker as default }

export function createParentQuery(store,changes) {
	const previousWayVersion={}
	const parentChecker=new ParentChecker()
	const met={}
	for (const [,etype,eid,ev] of changes) {
		if (etype!='way') continue
		if (met[eid]) return ()=>{} // bail on nonatomic csets
		met[eid]=true
		const currentWay=store[etype][eid][ev]
		const previousWay=store[etype][eid][ev-1]
		if (currentWay.visible) parentChecker.addCurrentWay(eid,currentWay.nds)
		if (previousWay?.visible) {
			previousWayVersion[eid]=ev-1
			parentChecker.addPreviousWay(eid,previousWay.nds)
		}
	}
	return (eid)=>{
		const pid=parentChecker.getParentWay(eid)
		if (pid) return [pid,previousWayVersion[pid]]
	}
}
