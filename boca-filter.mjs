import * as osm from './osm.js'
import {createParentQuery} from './boca-parent.mjs'

/*
	filters:
	v1.*=*    v1 must satifsy
	vt.*=*    currently known top version must satisfy
	vs.*=*    any of selected versions must satisfy
	vp.*=*    any of previous versions must satisfy
	          previous versions = all not selected versions that precede selected versions

	returns generator of entries:
	[etype,eid,selectedVersions,previousVersions,parent],
	 1     2   3                4                5 = detailLevel
	parent = [pid,pv] or undefined
*/
export default function *filterElements(project,changesets,filters,order,detailLevel=4) {
	const verFilters={}
	for (const [filterVerKey,filterValue] of Object.entries(filters)) {
		let match
		if (match=filterVerKey.match(/^(v[1pst])\.([a-zA-Z]+)$/)) {
			const [,filterVer,filterKey]=match
			if (!verFilters[filterVer]) verFilters[filterVer]={}
			if (filterKey=='visible' || filterKey=='redacted') {
				const yn=!(filterValue==0 || filterValue=='no' || filterValue=='false')
				verFilters[filterVer][filterKey]=yn
			} else {
				verFilters[filterVer][filterKey]=filterValue
			}
		}
	}
	// maps with keys like n12345, r987 b/c need to keep order of all elements
	const vpEntries=new Map() // previous versions even if they are not in the store
	const vsEntries=new Map() // current versions - expected to be in the store
	const addEntry=(vEntries,etype,eid,ev)=>{ // insertions are done in ascending order
		const ekey=etype[0]+eid
		if (!vEntries.has(ekey)) vEntries.set(ekey,new Set())
		vEntries.get(ekey).add(ev)
	}
	const hasEntry=(vEntries,etype,eid,ev)=>{
		const ekey=etype[0]+eid
		return vEntries.get(ekey)?.has(ev)
	}
	const iterateKeys=function*(vEntries){
		for (const ekey of vEntries.keys()) {
			const etype={
				n:'node',
				w:'way',
				r:'relation',
			}[ekey[0]]
			const eid=Number(ekey.substring(1))
			yield [ekey,etype,eid]
		}
	}
	const wayParents={}
	for (const [cid,changes] of changesets) {
		let parentQuery
		if (detailLevel>=5) parentQuery=createParentQuery(project,changes)
		for (const [,etype,eid,ev] of changes) {
			if (ev>1 && !hasEntry(vsEntries,etype,eid,ev-1)) addEntry(vpEntries,etype,eid,ev-1)
			addEntry(vsEntries,etype,eid,ev)
			if (detailLevel>=5 && etype=='way' && ev==1) {
				wayParents[eid]=parentQuery(eid)
			}
		}
	}
	const passFilters=(filters,etype,eid,ev)=>{
		const element=project.store[etype][eid][ev]
		if (filters.type!=null &&
		    filters.type!=etype) return false
		if (filters.version!=null &&
		    filters.version!=ev) return false
		if (filters.visible!=null) {
			if (!element || filters.visible!=
			                element.visible) return false
		}
		if (filters.uid!=null) {
			if (!element || filters.uid!=
			                element.uid) return false
		}
		if (filters.redacted!=null) {
			if (filters.redacted!=(project.redacted[etype][eid]?.[ev]!=null)) return false
		}
		return true
	}
	const passAnyVersion=(filters,etype,eid,evSet)=>{
		if (!evSet) return false
		for (const ev of evSet) {
			if (passFilters(filters,etype,eid,ev)) return true
		}
		return false
	}
	const iterateFiltered=function*(){
		for (const [ekey,etype,eid] of iterateKeys(vsEntries)) {
			if (verFilters.v1 && !passFilters(verFilters.v1,etype,eid,1)) continue
			if (verFilters.vt && !passFilters(verFilters.vt,etype,eid,osm.topVersion(project.store[etype][eid]))) continue
			if (verFilters.vp && !passAnyVersion(verFilters.vp,etype,eid,vpEntries.get(ekey))) continue
			if (verFilters.vs && !passAnyVersion(verFilters.vs,etype,eid,vsEntries.get(ekey))) continue
			const result=[etype,eid]
			if (detailLevel>=3) result.push([...vsEntries.get(ekey)??[]])
			if (detailLevel>=4) result.push([...vpEntries.get(ekey)??[]])
			if (detailLevel>=5) result.push(etype=='way'?wayParents[eid]:undefined)
			yield result
		}
	}
	if (order=='name') {
		const resultsWithNames=[]
		for (const result of iterateFiltered()) {
			const [etype,eid]=result
			const ekey=etype[0]+eid
			let eLastDefinedName
			for (const ev of vsEntries.get(ekey)??[]) { // first look for last name in selected versions
				const ename=project.store[etype][eid][ev].tags.name
				if (ename!=null) eLastDefinedName=ename
			}
			if (eLastDefinedName==null) { // then look for last name in previous versions
				for (const ev of vpEntries.get(ekey)??[]) {
					const ename=project.store[etype][eid][ev]?.tags.name
					if (ename!=null) eLastDefinedName=ename
				}
			}
			resultsWithNames.push([result,eLastDefinedName])
		}
		resultsWithNames.sort(([result1,ename1],[result2,ename2])=>(ename1??'').localeCompare(ename2??''))
		for (const [result] of resultsWithNames) {
			yield result
		}
	} else {
		yield* iterateFiltered()
	}
}
