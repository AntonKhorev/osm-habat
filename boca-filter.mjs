import * as osm from './osm.js'
import {createParentQuery} from './boca-parent.mjs'

export default class Filter {
	constructor(query) {
		this.conditions={}
		this.order=query.order
		const handleFilterEntry=(ver,key,val,op='=')=>{
			if (!this.conditions[ver]) this.conditions[ver]={}
			let v
			if (key=='visible' || key=='redacted') { // boolean
				const yn=!(val==0 || val=='no' || val=='false')
				v=yn
			} else if (key=='version' || key=='uid') { // number
				v=Number(val)
			} else { // string
				v=val
			}
			if (op=='=' || op=='==') {
				this.conditions[ver][key]=v
			} else {
				this.conditions[ver][key]=[v,op]
			}
		}
		for (const [verKey,val] of Object.entries(query)) {
			let match
			if (match=verKey.match(/^(v[1pst])\.([a-zA-Z]+)$/)) {
				const [,ver,key]=match
				handleFilterEntry(ver,key,val)
			}
		}
		if (query.filter!=null) for (const line of query.filter.split(/\r\n|\r|\n/)) {
			let match
			if (match=line.match(/^(v[1pst])\.([a-zA-Z]+)(==|=|!=|>=|>|<=|<)(.*)$/)) {
				const [,ver,key,op,val]=match
				handleFilterEntry(ver,key,val,op)
			} else if (match=line.match(/^order=(.*)$/)) {
				const [,val]=match
				this.order=val
			}
		}
	}
	static syntaxDescription=`<ul>
<li>Each line is either a <em>filter statement</em> or an <em>order statement</em>
<li>There can be any number of <em>filter statements</em>
<li>There can be zero or one <em>order statement</em>
</ul>
<dl>
<dt>filter statement
<dd><em>version descriptor</em><kbd>.</kbd><em>filter key</em><em>comparison operator</em><em>filter value</em>
<dt>version descriptor
<dd>Indicates which element versions must satisfy filter conditions. Have to be one of the following values:
	<dl>
	<dt><kbd>v1</kbd> <dd>first version
	<dt><kbd>vt</kbd> <dd>currently known top version
	<dt><kbd>vs</kbd> <dd>any<sup>[1]</sup> of selected versions
	<dt><kbd>vp</kbd> <dd>any<sup>[1]</sup> of previous versions<sup>[2]</sup>
	<dt><sup>[1]</sup> <dd>unless it's an <strong>aggregate filter</strong>
	<dt><sup>[2]</sup> <dd>previous versions are all not selected versions that precede selected versions; they could be not fetched yet
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
	<dt><kbd>count</kbd> <dd><strong>aggregate filter</strong>: the number of versions corresponding to this <em>version descriptor</em> is equal to a given value
	</dl>
<dt>comparison operator
<dd>One of: <kbd>= == != > >= < <=</kbd>
<dt>order statement
<dd>Currently only <kbd>order=name</kbd> is supported to sort elements by the value of name tag.
</dl>
`
// TODO examples
}

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
	const compare=(actual,expected)=>{
		if (!Array.isArray(expected)) {
			return actual==expected
		}
		const [value,operator]=expected
		if (operator=='!=') {
			return actual!=value
		} else if (operator=='>') {
			return  actual>value
		} else if (operator=='>=') {
			return  actual>=value
		} else if (operator=='<') {
			return  actual<value
		} else if (operator=='<=') {
			return  actual<=value
		}
		throw new Error(`unknown compare operator ${operator}`)
	}
	const passFilters=(filters,etype,eid,ev)=>{
		const element=project.store[etype][eid][ev]
		if (filters.type!=null) {
			if (!compare(etype,filters.type)) return false
		}
		if (filters.version!=null) {
			if (!compare(ev,filters.version)) return false
		}
		if (filters.visible!=null) {
			if (!element || !compare(element.visible,filters.visible)) return false
		}
		if (filters.uid!=null) {
			if (!element || !compare(element.uid,filters.uid)) return false
		}
		if (filters.redacted!=null) {
			if (!compare(
				project.redacted[etype][eid]?.[ev]!=null,
				filters.redacted
			)) return false
		}
		return true
	}
	const passOneVersion=(filters,etype,eid,ev)=>{
		if (filters.count!=null) {
			if (!compare(1,filters.count)) return false
		}
		return passFilters(filters,etype,eid,ev)
	}
	const passAnyVersion=(filters,etype,eid,evSet)=>{
		if (!evSet) {
			evSet=new Set()
		}
		if (filters.count!=null) {
			if (!compare(evSet.size,filters.count)) return false
		}
		for (const ev of evSet) {
			if (passFilters(filters,etype,eid,ev)) return true
		}
		return false
	}
	const iterateFiltered=function*(){
		for (const [ekey,etype,eid] of iterateKeys(vsEntries)) {
			if (filters.v1 && !passOneVersion(filters.v1,etype,eid,1)) continue
			if (filters.vt && !passOneVersion(filters.vt,etype,eid,osm.topVersion(project.store[etype][eid]))) continue
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

export function makeQueryText(filters,order) {
	let text=''
	for (const ver of ['v1','vp','vs','vt']) {
		if (!filters[ver]) continue
		for (const [key,val] of Object.entries(filters[ver])) { // TODO sort
			text+=`${ver}.${key}=${val}\n`
		}
	}
	if (order!=null) text+=`order=${order}\n`
	return text
}
