// scoped operations - receive changesets iterator

import * as e from './escape.js'
import * as osm from './osm.js'
import * as osmLinks from './osm-links.mjs'
import * as filter from './boca-filter.mjs'
import {createParentQuery} from './boca-parent.mjs'
import elementWriter from './boca-element.mjs'

export function analyzeCounts(response,project,changesets) {
	response.write(`<h2>Changeset element counts</h2>\n`)
	response.write(`<table>\n`)
	response.write(`<tr><th rowspan=2>changeset<th colspan=3>nodes<th colspan=3>ways<th colspan=3>rels\n`)
	response.write(`<tr><th>C<th>M<th>D<th>C<th>M<th>D<th>C<th>M<th>D\n`)
	const cc=()=>({create:0,modify:0,delete:0})
	const globalChanges={node:{},way:{},relation:{}}
	for (const [changesetId,changesetChanges] of changesets) {
		const count={node:cc(),way:cc(),relation:cc()}
		for (const [changeType,elementType,elementId] of changesetChanges) {
			count[elementType][changeType]++
			if (globalChanges[elementType][elementId]=='create' && changeType=='modify') {
				// keep 'create'
			} else if (globalChanges[elementType][elementId]=='create' && changeType=='delete') {
				delete globalChanges[elementType][elementId]
			} else {
				globalChanges[elementType][elementId]=changeType
			}
		}
		response.write(`<tr><td>`+osmLinks.changeset(changesetId).at(changesetId))
		for (const elementType of ['node','way','relation']) {
			const c=count[elementType]
			response.write(e.h`<td>${c.create}<td>${c.modify}<td>${c.delete}`)
		}
		response.write(`\n`)
	}
	response.write(e.h`<tr><td>total`)
	for (const elementType of ['node','way','relation']) {
		const c=cc()
		for (const changeType of Object.values(globalChanges[elementType])) {
			c[changeType]++
		}
		response.write(e.h`<td>${c.create}<td>${c.modify}<td>${c.delete}`)
	}
	response.write(`\n`)
	response.write(`</table>\n`)
	response.write(
		`<details>\n`+
		`<summary>Uses change types declared in changeset - some limitations apply</summary>\n`+
		`<ul>\n`+
		`<li>modifications can be trivial\n`+
		`<li>deletes followed by undeletes are modifications\n`+
		`<li>does not take intermittent changes from other changesets into account\n`+
		`</ul>\n`+
		`</details>\n`
	)
}

export function analyzeDeletes(response,project,changesets) {
	response.write(`<h2>Deletion version distribution</h2>\n`)
	const deletedVersions={node:{},way:{},relation:{}}
	for (const [changeType,elementType,elementId,elementVersion] of project.getChangesFromChangesets(changesets)) {
		if (changeType=='delete') {
			deletedVersions[elementType][elementId]=elementVersion-1
		} else {
			delete deletedVersions[elementType][elementId]
		}
	}
	for (const elementType of ['node','way','relation']) {
		response.write(e.h`<h3>for ${elementType} elements</h2>\n`)
		const versions=Object.values(deletedVersions[elementType])
		let maxVersion=0 // Math.max(...versions) - can't use it on large arrays
		for (const v of versions) if (maxVersion<v) maxVersion=v
		if (maxVersion<=0) {
			response.write(`<p>no deletions\n`)
			continue
		}
		response.write(`<table>\n`)
		response.write(`<tr><th>V<th>#<th>cum%\n`)
		const totalCount=versions.length
		let cumulativeCount=0
		for (let v=1;v<=maxVersion;v++) {
			const href=e.u`elements?vs.visible=0&vs.type=${elementType}&vp.version=${v}`
			const count=versions.filter(x=>x==v).length
			cumulativeCount+=count
			response.write(e.h`<tr><td>${v}<td>${count}<td>${(cumulativeCount/totalCount*100).toFixed(2)}%<td><a href=${href}>show</a>\n`)
		}
		response.write(`</table>\n`)
	}
	response.write(`<h2>Deletion first vesion user count</h2>\n`)
	for (const elementType of ['node','way','relation']) {
		response.write(e.h`<h3>for ${elementType} elements</h2>\n`)
		const uidCounts={}
		let unknownUidCount=0
		const deletedElementIds=Object.keys(deletedVersions[elementType])
		const totalCount=deletedElementIds.length
		let hasDeletions=false
		for (const elementId of deletedElementIds) {
			hasDeletions=true
			if (project.store[elementType][elementId]===undefined || project.store[elementType][elementId][1]===undefined) {
				unknownUidCount++
				continue
			}
			const uid=project.store[elementType][elementId][1].uid
			if (uidCounts[uid]===undefined) uidCounts[uid]=0
			uidCounts[uid]++
		}
		if (!hasDeletions) {
			response.write(`<p>no deletions\n`)
			continue
		}
		response.write(`<table>\n`)
		response.write(`<tr><th>user<th>#<th>%\n`)
		const pc=count=>e.h`<td>${count}<td>${(count/totalCount*100).toFixed(2)}%`
		for (const [uid,count] of Object.entries(uidCounts)) {
			const href=e.u`elements?vs.visible=0&vs.type=${elementType}&v1.uid=${uid}`
			response.write(e.h`<tr><td>`+project.getUserLink(uid)+pc(count)+`<td><a href=${href}>show</a>\n`)
		}
		if (unknownUidCount>0) {
			response.write(e.h`<tr><td>unknown`+pc(unknownUidCount)+`\n`)
		}
		response.write(`</table>\n`)
		if (unknownUidCount>0) {
			response.write(`<form method=post action=fetch-first>\n`)
			response.write(e.h`<input type=hidden name=vs.type value=${elementType}>\n`)
			response.write(`<input type=hidden name=vs.visible value=0>\n`)
			response.write(`<button>Fetch a batch of first versions from OSM</button>\n`)
			response.write(`</form>\n`)
		}
	}
}

export function analyzeFormulas(response,project,changesets) {
	response.write(`<h2>Change formulas</h2>\n`)
	const elementChanges={node:{},way:{},relation:{}}
	const elementVersions={node:{},way:{},relation:{}}
	for (const [changeType,elementType,elementId,elementVersion] of project.getChangesFromChangesets(changesets)) {
		const C=changeType[0].toUpperCase()
		if (elementChanges[elementType][elementId]===undefined) {
			elementChanges[elementType][elementId]=C
		} else {
			if (elementVersions[elementType][elementId]+1!=elementVersion) elementChanges[elementType][elementId]+='-'
			elementChanges[elementType][elementId]+=C
		}
		elementVersions[elementType][elementId]=elementVersion
	}
	response.write(`<table>\n`)
	response.write(`<tr><th>change<th>nodes<th>ways<th>relations\n`)
	const changeFormulasTable={}
	const nwr=['node','way','relation']
	for (let i=0;i<nwr.length;i++) {
		for (const changeFormula of Object.values(elementChanges[nwr[i]])) {
			if (changeFormulasTable[changeFormula]===undefined) changeFormulasTable[changeFormula]=[0,0,0]
			changeFormulasTable[changeFormula][i]++
		}
	}
	for (const [changeFormula,row] of Object.entries(changeFormulasTable)) {
		response.write(e.h`<tr><td>${changeFormula}<td>${row[0]}<td>${row[1]}<td>${row[2]}\n`)
	}
	response.write(`</table>\n`)
}

export function analyzeKeys(response,project,changesets) {
	const knownKeyCount={}
	const knownKeyChangesets={}
	const knownTagCount={}
	const unknownKeyCount={}
	const unknownKeyChangesets={}
	const unknownTagCount={}
	const hitKey=(a,k)=>{
		a[k]=(a[k]||0)+1
	}
	const hitKeyChangeset=(a,k,cid)=>{
		if (a[k]===undefined) a[k]=new Set()
		a[k].add(cid)
	}
	const hitTag=(a,k,v)=>{
		if (a[k]===undefined) a[k]={}
		a[k][v]=(a[k][v]||0)+1
	}
	for (const [changeType,elementType,elementId,elementVersion] of project.getChangesFromChangesets(changesets)) {
		const elementStore=project.store[elementType][elementId]
		for (const [k,v] of Object.entries(elementStore[elementVersion].tags)) {
			if (changeType=='create' || (
				changeType=='modify' &&
				elementStore[elementVersion-1]!==undefined &&
				elementStore[elementVersion-1].tags[k]!=v
			)) {
				hitKey(knownKeyCount,k)
				hitKeyChangeset(knownKeyChangesets,k,elementStore[elementVersion].changeset)
				hitTag(knownTagCount,k,v)
			} else if (
				changeType=='modify' &&
				elementStore[elementVersion-1]===undefined
			) {
				hitKey(unknownKeyCount,k)
				hitKeyChangeset(unknownKeyChangesets,k,elementStore[elementVersion].changeset)
				hitTag(unknownTagCount,k,v)
			}
		}
	}
	writeKeyTable('Known key edits',knownKeyCount,knownKeyChangesets,knownTagCount)
	writeKeyTable('Possible key edits',unknownKeyCount,unknownKeyChangesets,unknownTagCount)

	function writeKeyTable(title,keyCount,keyChangesets,tagCount) {
		const maxValues=5
		const maxChangesets=5
		response.write(e.h`<h2>${title}</h2>\n`)
		response.write(`<table>\n`)
		response.write(`<tr><th>count<th>key<th>values<th>changesets\n`)
		for (const [key,count] of Object.entries(keyCount).sort((a,b)=>(b[1]-a[1]))) {
			response.write(e.h`<tr><td>${count}<td>`+osmLinks.key(key).at(key)+`<td>`)
			const values=Object.entries(tagCount[key]).sort((a,b)=>(b[1]-a[1]))
			for (const [i,[v,c]] of values.entries()) {
				if (i>0) response.write(`, `)
				if (i>=maxValues) {
					response.write(e.h`<em>${values.length-maxValues} more values<em>`)
					break
				}
				response.write(osmLinks.tag(key,v).at(v)+e.h`×${c}`)
			}
			response.write(`<td>`)
			let i=0
			let cs=keyChangesets[key]
			for (const cid of cs) {
				if (i==0 || i==cs.size-1 || cs.size<=maxChangesets) {
					response.write(' '+osmLinks.changeset(cid).at(cid))
				} else if (i==1) {
					response.write(e.h` ...${cs.size-2} more changesets...`)
				}
				i++
			}
			response.write(`\n`)
		}
		response.write(`</table>\n`)
	}
}

export function analyzeChangesPerChangesetPerElement(response,project,changesets) { // TODO handle incomplete data - w/o prev versions
	const makeElementHeaderHtml=(type,id)=>osmLinks.element(type,id).at(`${type} #${id}`)
	const makeElementTableHtml=(type,id,ver)=>id?osmLinks.elementVersion(type,id,ver).at(`${type[0]}${id}v${ver}`):''
	response.write(`<h2>Changes per changeset per element</h2>\n`)
	for (const [cid,changes] of changesets) {
		response.write(`<h3>`+osmLinks.changeset(cid).at(`Changeset #${cid}`)+`</h3>\n`)
		const parentQuery=createParentQuery(project,changes)
		for (const [,etype,eid,ev] of changes) {
			let changeType
			let pid,pv
			const currentElement=project.store[etype][eid][ev]
			const previousElement=project.store[etype][eid][ev-1]
			if (!previousElement?.visible && currentElement.visible) {
				if (ev==1) {
					changeType='create'
				} else {
					changeType='undelete'
					pid=eid; pv=ev-1
				}
				if (etype=='way') {
					const pq=parentQuery(eid)
					if (pq) {
						[pid,pv]=pq
						changeType='split-'+changeType
					}
				}
			} else if (previousElement?.visible && currentElement.visible) {
				changeType='modify'
				pid=eid; pv=ev-1
			} else if (previousElement?.visible && !currentElement.visible) {
				changeType='delete'
				pid=eid; pv=ev-1
			} else if (!previousElement?.visible && !currentElement.visible) {
				changeType='degenerate-delete'
				pid=eid; pv=ev-1
			}
			const parentElement=project.store[etype][pid]?.[pv]
			if (
				(!parentElement || Object.keys(parentElement.tags).length==0) &&
				Object.keys(currentElement.tags).length==0
			) {
				response.write(e.h`<h4>${changeType} untagged `+makeElementHeaderHtml(etype,eid)+`</h4>\n`)
				continue
			}
			response.write(e.h`<h4>${changeType} `+makeElementHeaderHtml(etype,eid)+`</h4>\n`)
			response.write(`<table>\n`)
			response.write(`<tr><th>tags<th>previous<th>current\n`)
			response.write(`<tr><td><td>${makeElementTableHtml(etype,pid,pv)}<td>${makeElementTableHtml(etype,eid,ev)}\n`)
			for (const k of Object.keys({...parentElement?.tags,...currentElement.tags})) {
				const v1=parentElement?.tags[k]
				const v2=currentElement.tags[k]
				let change
				if (v1==undefined && v2!=undefined) change='create'
				if (v1!=undefined && v2==undefined) change='delete'
				if (v1!=undefined && v2!=undefined && v1!=v2) change='modify'
				response.write(e.h`<tr class=${change} data-key=${k}><td>${k}<td>${v1}<td>${v2}\n`)
			}
			response.write(`</table>\n`)
		}
	}
}

export function analyzeChangesPerElement(response,project,changesets,filters,order) {
	response.write(`<h2>Changes per element</h2>\n`)
	for (const [etype,eid,evs,,parent] of filter.filterElements(project,changesets,filters,order,5)) {
		response.write(`<div class=reloadable>\n`)
		elementWriter(response,project,etype,eid,evs,parent)
		response.write(`</div>\n`)
	}
}

export function viewElements(response,project,changesets,filters,order) {
	response.write(`<h2>Filtered elements list</h2>\n`)
	let first=true
	for (const [elementType,elementId,elementVersions] of filter.filterElements(project,changesets,filters,order,3)) {
		if (first) {
			first=false
			response.write(`<table>\n`)
			response.write(
				`<tr><th>element<th>osm<th><abbr title='overpass turbo before change'>ov-</abbr><th><abbr title='osm deep history'>odh</abbr>`+
				`<th>known major tags<th>last state\n`
			)
		}
		response.write(`<tr>`)
		response.write(e.h`<td>${elementType[0]}${elementId}`)
		response.write(e.h`<td><a href=${'https://www.openstreetmap.org/'+elementType+'/'+elementId}>osm</a>`)
		const elementStore=project.store[elementType][elementId]
		const elementVersion=elementVersions[elementVersions.length-1]
		const elementTimestamp=elementStore[elementVersion].timestamp
		response.write('<td>'+osmLinks.elementTimestamp(elementType,elementId,elementTimestamp).overpassTurboBefore.at('ov-'))
		response.write('<td>'+osmLinks.element(elementType,elementId).deepHistory.at('odh'))
		const majorTags={}
		for (const [ver,data] of Object.entries(elementStore)) {
			if (!Number(ver)) continue
			for (const k of ['boundary','building','highway','landuse','natural','power']) {
				if (k in data.tags) majorTags[k]=data.tags[k]
			}
		}
		response.write(e.h`<td>${Object.entries(majorTags).map(([k,v])=>k+'='+v).join(' ')}`)
		const latestVersion=osm.topVersion(elementStore)
		response.write('<td>'+(elementStore[latestVersion].visible?'visible':'deleted'))
		if (!elementStore[latestVersion].visible && elementType=='way') {
			const href=`/undelete/w${elementId}.osm`
			response.write(e.h`<td><a href=${href}>undelete.osm</a>`)
		}
		response.write(`\n`)
	}
	if (first) {
		response.write(`<p>none found\n`)
	} else {
		response.write(`</table>\n`)
		response.write(`<form method=post action=fetch-latest>\n`)
		//for (const [k,v] of Object.entries(query)) {
		//	response.write(e.h`<input type=hidden name=${k} value=${v}>\n`)
		//}
		response.write(e.h`<input type=hidden name=filters value=${filter.makeQueryText(filters,order)}>\n`)
		response.write(`<button>Fetch a batch of latest versions from OSM</button>\n`)
		response.write(`</form>`)
	}
}

export async function fetchFirstVersions(response,project,changesets,filters) {
	const multifetchList=[]
	for (const [etype,eid] of filter.filterElements(project,changesets,filters,null,2)) {
		if (project.store[etype][eid]?.[1]) continue
		multifetchList.push([etype,eid,1])
		if (multifetchList.length>=10000) break
	}
	await osm.multifetchToStore(project.store,multifetchList)
}

export async function fetchPreviousVersions(response,project,changesets,filters) {
	const multifetchList=[]
	for (const [etype,eid,,ePreviousVersions] of filter.filterElements(project,changesets,filters,null,4)) {
		for (const ev of ePreviousVersions) {
			if (project.store[etype][eid]?.[ev]) continue
			multifetchList.push([etype,eid,ev])
		}
		if (multifetchList.length>=10000) break
	}
	await osm.multifetchToStore(project.store,multifetchList)
}

export async function fetchLatestVersions(response,project,changesets,filters) {
	const preMultifetchList=[]
	for (const [etype,eid] of filter.filterElements(project,changesets,filters,null,2)) {
		preMultifetchList.push([
			etype,eid,
			project.store[etype][eid].top?.timestamp??0
		])
	}
	preMultifetchList.sort(([,,t1],[,,t2])=>t1-t2)
	const multifetchList=[]
	for (const [etype,eid] of preMultifetchList) {
		multifetchList.push([etype,eid])
		if (multifetchList.length>=10000) break
	}
	await osm.multifetchToStore(project.store,multifetchList)
}
