// fetches for josm consumption
// josm needs all nodes of every way

export async function fetchTopVersions(multifetch,store,eTypeIds) {
	await downloadNecessaryElements()
	const elementsToWrite=getElementsToWrite()
	return listElements(elementsToWrite)

	async function downloadNecessaryElements() {
		const triedFetch=initElementSet()
		for (let iter=0;iter<100;iter++) {
			const fetchSet=initElementSet()
			const updateElement=(etype,eid)=>{
				const estore=store[etype][eid]
				if (estore && estore.top) return estore[estore.top.version]
				if (triedFetch[etype][eid]) return
				triedFetch[etype][eid]=true
				fetchSet[etype][eid]=true
			}
			for (const [etype,eid] of eTypeIds) {
				const edata=updateElement(etype,eid)
				if (!edata) continue
				if (edata.visible && etype=='way') {
					for (const nodeId of edata.nds) {
						const nodeStore=store['node'][nodeId]
						if (nodeStore && nodeStore.top && nodeStore.top.timestamp>=edata.timestamp) continue
						if (triedFetch['node'][nodeId]) continue
						triedFetch['node'][nodeId]=true
						fetchSet['node'][nodeId]=true
					}
				}
				// maybe TODO download relation members, maybe download only multipolygons
			}
			const fetchList=[]
			for (const [etype,eidsSet] of Object.entries(fetchSet)) {
				for (const eid of Object.keys(eidsSet).map(Number)) fetchList.push([etype,eid])
			}
			await multifetch(store,fetchList)
			if (fetchList.length==0) break
		}
	}
	function getElementsToWrite() {
		const fetchedAndVisible=initElementSet()
		for (const [etype,eid] of eTypeIds) {
			const estore=store[etype][eid]
			if (!estore || !estore.top) throw new Error(`failed to fetch top version of ${etype} #${eid}`)
			const edata=estore[estore.top.version]
			if (!edata.visible) continue
			fetchedAndVisible[etype][eid]=true
			if (etype=='way') {
				for (const nodeId of edata.nds) {
					const nodeStore=store['node'][nodeId]
					if (!nodeStore || !nodeStore.top) throw new Error(`failed to fetch top version of node #${nodeId} inside way ${etype} #${eid}`)
					const nodeData=nodeStore[nodeStore.top.version]
					if (!nodeData.visible) throw new Error(`got invisible node #${nodeId} inside way ${etype} #${eid}`)
					fetchedAndVisible['node'][nodeId]=true
				}
			}
		}
		return fetchedAndVisible
	}
	function listElements(elementSet) {
		const result=[]
		for (const etype of ['node','way','relation']) {
			const eids=Object.keys(elementSet[etype]).map(Number)
			eids.sort((x,y)=>x-y)
			for (const eid of eids) {
				result.push([etype,eid,store[etype][eid].top.version])
			}
		}
		return result
	}
	function initElementSet() {
		return {node:{},way:{},relation:{}}
	}
}
