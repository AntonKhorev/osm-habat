/**
 * Fetches latest versions of elements.
 * If latest version is deleted, the element is skipped.
 * If asked for a way, fetches all its nodes too to satisfy josm.
 */
export async function fetchTopVersions(multifetch,store,eTypeIds) {
	await downloadNecessaryElements(multifetch,store,eTypeIds)
	const elementsToWrite=getElementsToWrite(store,eTypeIds)
	return listElements(store,elementsToWrite)
}

/**
 * Fetches latest visible versions of elements.
 * If latest version is deleted, tries previous one, then one before it etc.
 * If asked for a way, fetches all its nodes too to satisfy josm.
 */
export async function fetchTopVisibleVersions(multifetch,store,eTypeIds) {
	await downloadNecessaryElements(multifetch,store,eTypeIds,true)
	const elementsToWrite=getElementsToWrite(store,eTypeIds,true)
	return listElements(store,elementsToWrite)
}

async function downloadNecessaryElements(multifetch,store,eTypeIds,undeleteMode=false) {
	const triedTopFetch=initElementSet()
	const triedVersionFetch=initElementSet()
	for (let iter=0;iter<100;iter++) {
		const topFetchSet=initElementSet()
		const versionFetchSet=initElementSet()
		const updateElement=(etype,eid,minTopTimestamp)=>{
			const estore=store[etype][eid]
			if (!estore || !estore.top || estore.top.timestamp<minTopTimestamp) {
				if (triedTopFetch[etype][eid]) return
				topFetchSet[etype][eid]=true
				return
			}
			if (!undeleteMode) {
				return estore[estore.top.version]
			}
			const startVersion=(triedVersionFetch[etype][eid]
				? triedVersionFetch[etype][eid]
				: estore.top.version
			)
			for (let ev=startVersion;ev>0;ev--) {
				if (!estore[ev]) {
					if (!triedVersionFetch[etype][eid] || triedVersionFetch[etype][eid]>ev) {
						versionFetchSet[etype][eid]=ev
					}
					return
				}
				if (estore[ev].visible) return estore[ev]
			}
		}
		for (const [etype,eid] of eTypeIds) {
			const edata=updateElement(etype,eid)
			if (!edata) continue
			if (edata.visible && etype=='way') {
				for (const nodeId of edata.nds) updateElement('node',nodeId,edata.timestamp)
			}
			// maybe TODO download relation members, maybe download only multipolygons
			//     if top version of relation was deleted, need to find top undeleted versions of members
		}
		const runFetch=async(fetchSet,triedFetch,makeFetchListEntry)=>{
			const fetchList=[]
			for (const [etype,eidsSet] of Object.entries(fetchSet)) {
				for (const [eidk,ev] of Object.entries(eidsSet)) {
					const eid=Number(eidk)
					triedFetch[etype][eid]=ev
					fetchList.push(makeFetchListEntry(etype,eid,ev))
				}
			}
			await multifetch(store,fetchList)
			return fetchList.length==0
		}
		const isEmptyTopSet=await runFetch(topFetchSet,triedTopFetch,(etype,eid)=>[etype,eid])
		const isEmptyVersionSet=await runFetch(versionFetchSet,triedVersionFetch,(etype,eid,ev)=>[etype,eid,ev])
		if (isEmptyTopSet && isEmptyVersionSet) break
	}
}

function getElementsToWrite(store,eTypeIds,undeleteMode=false) {
	const elementsToWrite=initElementSet()
	const registerElement=(etype,eid,goDownVersions,haveToBeVisible)=>{
		const estore=store[etype][eid]
		if (!estore || !estore.top) throw new Error(`failed to fetch top version of ${etype} #${eid}`)
		for (let ev=estore.top.version;ev>0;ev--) {
			const edata=estore[ev]
			if (edata.visible) {
				elementsToWrite[etype][eid]=ev
				return edata
			}
			if (!goDownVersions) break
		}
		if (haveToBeVisible) throw new Error(`got required ${etype} #${eid} without visible version`)
	}
	for (const [etype,eid] of eTypeIds) {
		const edata=registerElement(etype,eid,undeleteMode,undeleteMode)
		if (!edata) continue
		if (etype=='way') {
			for (const nodeId of edata.nds) registerElement('node',nodeId,undeleteMode,true)
		}
	}
	return elementsToWrite
}

function listElements(store,elementSet) {
	const result=[]
	for (const etype of ['node','way','relation']) {
		const eIdVs=Object.entries(elementSet[etype]).map(([eid,ev])=>[Number(eid),ev])
		eIdVs.sort(([eid1],[eid2])=>eid1-eid2)
		for (const [eid,ev2] of eIdVs) {
			const ev=store[etype][eid].top.version
			result.push(ev==ev2
				? [etype,eid,ev]
				: [etype,eid,ev,ev2]
			)
		}
	}
	return result
}

function initElementSet() {
	return {node:{},way:{},relation:{}}
}
