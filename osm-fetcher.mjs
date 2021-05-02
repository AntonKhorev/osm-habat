// fetches for josm consumption
// josm needs all nodes of every way

export async function fetchTopVersions(multifetch,store,eTypeVersions) {
	const fetchList=[]
	for (const [etype,eid] of eTypeVersions) {
		const estore=store[etype][eid]
		if (!estore || !estore.top) {
			fetchList.push([etype,eid])
		}
	}
	await multifetch(store,fetchList)
	const fetchedAndVisible={
		node:[],
		way:[],
		relation:[],
	}
	for (const [etype,eid] of eTypeVersions) {
		const estore=store[etype][eid]
		if (!estore || !estore.top) throw new Error(`failed to fetch top version of ${etype} #${eid}`)
		if (estore[estore.top.version].visible) fetchedAndVisible[etype].push(eid)
	}
	const result=[]
	for (const etype of ['node','way','relation']) {
		fetchedAndVisible[etype].sort((x,y)=>x-y)
		for (const eid of fetchedAndVisible[etype]) {
			result.push([etype,eid,store[etype][eid].top.version])
		}
	}
	return result
}
