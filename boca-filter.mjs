import * as osm from './osm.js'
import {createParentQuery} from './boca-parent.mjs'

/*
	returns generator of entries:
	[etype,eid,selectedVersions,previousVersions,parent],
	 1     2   3                4                5 = detailLevel
	parent = [pid,pv] or undefined
*/
export function *filterElements(project,changesets,filters,order,detailLevel=4) {
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
			if (filters.v1 && !passFilters(filters.v1,etype,eid,1)) continue
			if (filters.vt && !passFilters(filters.vt,etype,eid,osm.topVersion(project.store[etype][eid]))) continue
			if (filters.vp && !passAnyVersion(filters.vp,etype,eid,vpEntries.get(ekey))) continue
			if (filters.vs && !passAnyVersion(filters.vs,etype,eid,vsEntries.get(ekey))) continue
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
			let eSortName
			for (const ev of vsEntries.get(ekey)??[]) { // first look for last name in selected versions
				const ename=project.store[etype][eid][ev].tags.name
				if (ename!=null) eSortName=ename
			}
			if (eSortName==null) { // then look for last name in previous versions
				for (const ev of vpEntries.get(ekey)??[]) {
					const ename=project.store[etype][eid][ev]?.tags.name
					if (ename!=null) eSortName=ename
				}
			}
			if (eSortName==null && etype=='way' && wayParents[eid]) { // then check parent name if it was computed
				const [pid,pv]=wayParents[eid]
				const pname=project.store.way[pid][pv].tags.name
				if (pname!=null) eSortName=pname
			}
			resultsWithNames.push([result,eSortName])
		}
		resultsWithNames.sort(([result1,ename1],[result2,ename2])=>(ename1??'').localeCompare(ename2??''))
		for (const [result] of resultsWithNames) {
			yield result
		}
	} else {
		yield* iterateFiltered()
	}
}
export { filterElements as default }

export function parseQuery(query) {
	const filters={}
	for (const [filterVerKey,filterValue] of Object.entries(query)) {
		let match
		if (match=filterVerKey.match(/^(v[1pst])\.([a-zA-Z]+)$/)) {
			const [,filterVer,filterKey]=match
			if (!filters[filterVer]) filters[filterVer]={}
			if (filterKey=='visible' || filterKey=='redacted') { // boolean
				const yn=!(filterValue==0 || filterValue=='no' || filterValue=='false')
				filters[filterVer][filterKey]=yn
			} else if (filterKey=='version' || filterKey=='uid') { // number
				filters[filterVer][filterKey]=Number(filterValue)
			} else { // string
				filters[filterVer][filterKey]=filterValue
			}
		}
	}
	return [filters,query.order]
}

export function makeQueryText(filters,order) {
	/*
	for (const [ver,verFilters] of Object.entries(filters)) {
		for (const [key,value] of Object.entries(verFilters)) {
			response.write(e.h`${ver}.${key}=${value}\n`)
		}
	}
	*/
}

export function makeQueryPairs(filters,order) {
}

export const syntaxDescription=`<ul>
<li>Each line is either a <em>filter statement</em> or an <em>order statement</em>
<li>There can be any number of <em>filter statements</em>
<li>There can be zero or one <em>order statement</em>
</ul>
<dl>
<dt>filter statement
<dd><em>version descriptor</em><kbd>.</kbd><em>filter key</em><kbd>=</kbd><em>filter value</em>
<dt>version descriptor
<dd>Indicates which element versions must satisfy filter conditions. Have to be one of the following values:
	<dl>
	<dt><kbd>v1</kbd> <dd>first version
	<dt><kbd>vt</kbd> <dd>currently known top version
	<dt><kbd>vs</kbd> <dd>any of selected versions
	<dt><kbd>vp</kbd> <dd>any of previous versions; previous versions are all not selected versions that precede selected versions
	</dl>
<dt>filter key
<dd>Indicates a type of condition to be satisfied by filtered elements. Have to be one of the following values:
	<dl>
	<dt><kbd>type</kbd> <dd>the element version is of a given type;
		since the element type can't change it's better to use this filter with <kbd>vs</kbd>
	<dt><kbd>version</kbd> <dd>the element version number is equal to a given value
	<dt><kbd>visible</kbd> <dd>the element visibility (the state of being not deleted) matches a given value;
		values <kbd>0</kbd>, <kbd>no</kbd> and <kbd>false</kbd> correspond to invisibility, other values correspond to visibility
	<dt><kbd>uid</kbd> <dd>the element version was created by a user with a given id
	<dt><kbd>redacted</kbd> <dd>the element version was recorded as redacted;
		this requires putting a redaction file into <code>redactions</code> directory inside a project directory
	</dl>
<dt>order statement
<dd>Currently only <kbd>order=name</kbd> is supported to sort elements by the value of name tag.
</dl>
`
// TODO examples
