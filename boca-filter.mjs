import * as osm from './osm.js'
import {createParentQuery} from './boca-parent.mjs'
import EndpointSorter from './boca-endpoint-sorter.mjs'

export default class Filter {
	constructor(query) {
		this.conditions={}
		this.order=[]
		const handleFilterEntry=(ver,key,op,val)=>{
			if (!this.conditions[ver]) this.conditions[ver]={}
			let v
			if (key=='redacted' || key=='tagged' || key=='visible') { // boolean
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
				this.conditions[ver][key]=[op,v]
			}
		}
		const handleTagEntry=(ver,key,op,val)=>{
			if (!this.conditions[ver]) this.conditions[ver]={}
			if (!this.conditions[ver].tag) this.conditions[ver].tag={}
			if (op=='=' || op=='==') {
				this.conditions[ver].tag[key]=val
			} else if (val==null) {
				this.conditions[ver].tag[key]=[op]
			} else {
				this.conditions[ver].tag[key]=[op,val]
			}
		}
		const parseOrder=(orderString)=>orderString.trim().split(/\s*[,;]\s*/).map(statement=>{
			const tagMatch=statement.match(/^\[\s*(\S+)\s*\]$/)
			if (tagMatch) {
				const [,tagKey]=tagMatch
				return ['tag',tagKey]
			} else {
				return [statement]
			}
		})
		this.text=''
		const addTextLine=(line)=>{
			if (this.text.length>0) this.text+='\n' // more convenient not to have trailing eol when urlencoding
			this.text+=line
		}
		if (query.filter!=null) for (const line of query.filter.split(/\r\n|\r|\n/)) {
			addTextLine(line)
			const trline=line.trim()
			let match
			if (match=trline.match(/^(v[1pst])\.([a-zA-Z]+)\s*(==|=|!=|>=|>|<=|<)\s*(.*)$/)) {
				const [,ver,key,op,val]=match
				handleFilterEntry(ver,key,op,val)
			} else if (match=trline.match(/^(v[1pst])\[(.*)\]$/)) {
				const [,ver,tagStatement]=match
				const trTagStatement=tagStatement.trim()
				if (match=trTagStatement.match(/^(!?)\s*([^=><!]+)$/)) {
					const [,not,key]=match
					handleTagEntry(ver,key,not?'!=*':'=*')
				} else if (match=trTagStatement.match(/^([^=><!]+?)\s*(==|=|!=|>=|>|<=|<)\s*(.*)$/)) {
					const [,key,op,val]=match
					handleTagEntry(ver,key,op,val)
				}
			} else if (match=trline.match(/^order\s*=(.*)$/)) {
				const [,val]=match
				this.order=parseOrder(val)
			}
		}
		const additionalLines=[]
		for (const [verKey,val] of Object.entries(query)) {
			let match
			if (match=verKey.match(/^(v[1pst])\.([a-zA-Z]+)$/)) {
				additionalLines.push(`${verKey}=${val}`)
				const [,ver,key]=match
				handleFilterEntry(ver,key,'=',val)
			}
		}
		additionalLines.sort()
		for (const line of additionalLines) {
			addTextLine(line)
		}
		if (query.order!=null) {
			addTextLine(`order=${query.order}`)
			this.order=parseOrder(query.order)
		}
	}

	/**
	 * Will cause filter to skip ordering step when doing filterElements()
	 * May be useful for performance reasons when element order is not important.
	 */
	dropOrder() {
		this.order=[]
		return this
	}

	/**
	 * Returns generator of entries:
	 *     [etype,eid,selectedVersions,previousVersions,parent],
	 *      1     2   3                4                5 = detailLevel
	 * parent = [pid,pv] or undefined
	 *
	 * @param {number} maxSeparatorLevel - Output sorting separators up to this level.
	 */
	*filterElements(project,changesets,detailLevel=4,maxSeparatorLevel=0) {
		for (const entry of this.filterElementsWithSeparators(project,changesets,detailLevel)) {
			const [etype,elevel]=entry
			if (etype!='separator' || elevel<=maxSeparatorLevel) yield entry
		}
	}

	/**
	 * Returns generator of entries:
	 *     [etype,eid,selectedVersions,previousVersions,parent],
	 *     with possible etype=='separator'
	 */
	*filterElementsWithSeparators(project,changesets,detailLevel=4) {
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
			if (detailLevel>=5) parentQuery=createParentQuery(project.store,changes)
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
			const [operator,value]=expected
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
			} else if (operator=='=*') {
				return actual!=null
			} else if (operator=='!=*') {
				return actual==null
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
			if (filters.tagged!=null) {
				if (!element || !compare(Object.keys(element.tags).length>0,filters.tagged)) return false
			}
			if (filters.tag!=null) {
				if (!element) return false
				for (const [k,vo] of Object.entries(filters.tag)) {
					if (!compare(element.tags[k],vo)) return false
				}
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
		const iterateFiltered=function*(conditions){
			for (const [ekey,etype,eid] of iterateKeys(vsEntries)) {
				if (conditions.v1 && !passOneVersion(conditions.v1,etype,eid,1)) continue
				if (conditions.vt && !passOneVersion(conditions.vt,etype,eid,osm.topVersion(project.store[etype][eid]))) continue
				if (conditions.vp && !passAnyVersion(conditions.vp,etype,eid,vpEntries.get(ekey))) continue
				if (conditions.vs && !passAnyVersion(conditions.vs,etype,eid,vsEntries.get(ekey))) continue
				const result=[etype,eid]
				if (detailLevel>=3) result.push([...vsEntries.get(ekey)??[]])
				if (detailLevel>=4) result.push([...vpEntries.get(ekey)??[]])
				if (detailLevel>=5) result.push(etype=='way'?wayParents[eid]:undefined)
				yield result
			}
		}
		function *tagSorter(input,separator,tagKey) {
			const resultsWithSortValues=[]
			for (const result of input) {
				const [etype,eid]=result
				const ekey=etype[0]+eid
				let sortValue
				for (const ev of vsEntries.get(ekey)??[]) { // first look for last name in selected versions
					sortValue=project.store[etype][eid][ev].tags[tagKey]
				}
				if (sortValue==null) { // then look for last name in previous versions
					for (const ev of vpEntries.get(ekey)??[]) {
						sortValue=project.store[etype][eid][ev]?.tags[tagKey] ?? sortValue
					}
				}
				if (sortValue==null && etype=='way' && wayParents[eid]) { // then check parent name if it was computed
					const [pid,pv]=wayParents[eid]
					sortValue=project.store.way[pid][pv].tags[tagKey] ?? sortValue
				}
				resultsWithSortValues.push([result,sortValue])
			}
			const cmp=(sortValue1,sortValue2)=>(sortValue1??'').localeCompare(sortValue2??'')
			resultsWithSortValues.sort(
				([result1,sortValue1],[result2,sortValue2])=>cmp(sortValue1,sortValue2)
			)
			let first=true
			let prevSortValue
			for (const [result,sortValue] of resultsWithSortValues) {
				if (first) {
					first=false
				} else {
					if (cmp(prevSortValue,sortValue)) yield separator
				}
				yield result
				prevSortValue=sortValue
			}
		}
		function *endsSorter(input,separator) {
			const sorter=new EndpointSorter()
			for (const entry of input) {
				const [etype,eid,evs]=entry
				if (etype=='way') {
					let ev
					if (evs) {
						ev=evs[evs.length-1]
					} else {
						const ekey=etype[0]+eid
						for (ev of vsEntries.get(ekey));
					}
					const nds=project.store.way[eid][ev].nds
					sorter.add(entry,nds[0],nds[nds.length-1])
				} else {
					sorter.add(entry)
				}
			}
			yield *sorter // TODO separators between clusters
		}
		function *sortSeparately(input,separatorLevel,sorterFn,sorterArg) {
			const separator=['separator',separatorLevel]
			let buffer=[]
			for (const entry of input) {
				const [etype]=entry
				if (etype!='separator') {
					buffer.push(entry)
					continue
				}
				yield* sorterFn(buffer,separator,sorterArg)
				yield entry
				buffer=[]
			}
			yield* sorterFn(buffer,separator,sorterArg)
		}
		let result=iterateFiltered(this.conditions)
		for (let i=0;i<this.order.length;i++) {
			const [orderType,orderArg]=this.order[i]
			for (const [sorterType,sorterFn] of [
				['tag',tagSorter],
				['ends',endsSorter],
			]) {
				if (orderType==sorterType) {
					result=sortSeparately(result,i+1,sorterFn,orderArg)
				}
			}
		}
		yield* result
	}

	static syntaxDescription=`<ul>
<li>Each line is either a ${term('filter statement')} or an ${term('order statement')}
<li>There can be any number of ${term('filter statement')}
<li>There can be zero or one ${term('order statement')}
</ul>
<dl>
<dt>${term('filter statement')}
<dd>One of:
<dd>${term('version descriptor')}<kbd>.</kbd>${term('filter key')} ${term('comparison operator')} ${term('filter value')}
<dd>${term('version descriptor')}<kbd>[</kbd>${term('tag key')}<kbd>]</kbd>
<dd>${term('version descriptor')}<kbd>[!</kbd>${term('tag key')}<kbd>]</kbd>
<dd>${term('version descriptor')}<kbd>[</kbd>${term('tag key')} ${term('comparison operator')} ${term('tag value')}<kbd>]</kbd>
<dt>${term('version descriptor')}
<dd>Indicates which element versions must satisfy filter conditions. Have to be one of the following values:
	<dl>
	<dt><kbd>v1</kbd> <dd>first version
	<dt><kbd>vt</kbd> <dd>currently known top version
	<dt><kbd>vs</kbd> <dd>any<sup>[1]</sup> of selected versions
	<dt><kbd>vp</kbd> <dd>any<sup>[1]</sup> of previous versions<sup>[2]</sup>
	<dt><sup>[1]</sup> <dd>unless it's an <strong>aggregate filter</strong>
	<dt><sup>[2]</sup> <dd>previous versions are all not selected versions that precede selected versions; they could be not fetched yet
	</dl>
<dt>${term('filter key')}
<dd>Indicates a type of condition to be satisfied by filtered elements. Have to be one of the following values:
	<dl>
	<dt><kbd>type</kbd> <dd>the element version is of a given type;
		since the element type can't change it's better to use this filter with <kbd>vs</kbd>
	<dt><kbd>version</kbd> <dd>the element version number is equal to a given value
	<dt><kbd>uid</kbd> <dd>the element version was created by a user with a given id
	<dt><kbd>redacted</kbd> <dd><strong>boolean value:</strong> the element version was recorded as redacted;
		this requires putting a redaction file into <code>redactions</code> directory inside a project directory
	<dt><kbd>tagged</kbd> <dd><strong>boolean value:</strong> the element version has tags
	<dt><kbd>visible</kbd> <dd><strong>boolean value:</strong> the element visibility (the state of being not deleted) matches a given value;
		values <kbd>0</kbd>, <kbd>no</kbd> and <kbd>false</kbd> correspond to invisibility, other values correspond to visibility
	<dt><kbd>count</kbd> <dd><strong>aggregate filter</strong>: the number of versions corresponding to this <em>version descriptor</em> is equal to a given value
	</dl>
<dt>${term('comparison operator')}
<dd>One of: <kbd>= == != > >= < <=</kbd>
<dt>${term('order statement')}
<dd><kbd>order = </kbd>${term('list of order keys')}
<dt>${term('list of order keys')}
<dd>Comma-separated list of one or more ${term('order key')}.
	Each corresponding sorting is applied to the list of elements that passed through filters.
	Sortings are applied sequentially, dividing the result in groups (not yet implemented for topological sort).
	Next sorting is applied to each of the groups separately, possibly producing more groups.
<dt>${term('order key')}
<dd>One of:
	<dl>
	<dt><kbd>[</kbd>${term('tag key')}<kbd>]</kbd> <dd><a href=https://en.wikipedia.org/wiki/Sorting_algorithm#Stability>stable</a> sort by the specified tag
	<dt><kbd>ends</kbd> <dd>topological order by trying to output chains of ways that share end nodes; forms a <a href=https://en.wikipedia.org/wiki/Graph_(discrete_mathematics)>graph</a> taking only end nodes into account, outputs a <a href=https://en.wikipedia.org/wiki/Component_(graph_theory)>connected component</a> starting from a <a href=https://en.wikipedia.org/wiki/Leaf_vertex>leaf</a> with a lowest id
	</dl>
</dl>
<p>Examples:</p>
<dl class=examples>
<dt>Elements edited more than once in selected csets
<dd><pre><code>vs.count > 1</code></pre>
<dt>Highways with name added in selected csets
<dd><pre><code>vs[highway]
vp[!name]
vs[name]</code></pre>
<dt>Sort way segments by name and shared endpoints, useful for highways
<dd><pre><code>order = [name], ends</code></pre>
</dl>
`
}

function term(t) {
	return `<em>&lt;${t}&gt;</em>`
}
