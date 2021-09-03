// scoped operations - receive changesets iterator

import * as e from './escape.js'
import * as osm from './osm.js'
import * as osmLink from './osm-link.mjs'
import * as bocaFile from './boca-file.mjs'
import {createParentQuery} from './boca-parent.mjs'
import elementWriter from './boca-element.mjs'
import {fetchTopVersions,fetchTopVisibleVersions} from './boca-fetcher.mjs'

export function analyzeCounts(response,project,changesets) {
	response.write(`<h2>Changeset element counts</h2>\n`)
	response.write(`<table>\n`)
	response.write(`<tr><th rowspan=2>changeset<th colspan=3>nodes<th colspan=3>ways<th colspan=3>rels\n`)
	response.write(`<tr><th>C<th>M<th>D<th>C<th>M<th>D<th>C<th>M<th>D\n`)
	const cc=()=>({create:0,modify:0,delete:0})
	const globalChanges={node:{},way:{},relation:{}}
	let nChangesets=0
	for (const [changesetId,changesetChanges] of changesets) {
		nChangesets++
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
		response.write(`<tr><td>`+osmLink.changeset(changesetId).at(changesetId))
		for (const elementType of ['node','way','relation']) {
			const c=count[elementType]
			response.write(e.h`<td>${c.create}<td>${c.modify}<td>${c.delete}`)
		}
		response.write(`\n`)
	}
	response.write(e.h`<tr><td>total in ${nChangesets} csets`)
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
			response.write(e.h`<tr><td>${count}<td>`+osmLink.key(key).at(key)+`<td>`)
			const values=Object.entries(tagCount[key]).sort((a,b)=>(b[1]-a[1]))
			for (const [i,[v,c]] of values.entries()) {
				if (i>0) response.write(`, `)
				if (i>=maxValues) {
					response.write(e.h`<em>${values.length-maxValues} more values<em>`)
					break
				}
				response.write(osmLink.tag(key,v).at(v)+e.h`×${c}`)
			}
			response.write(`<td>`)
			let i=0
			let cs=keyChangesets[key]
			for (const cid of cs) {
				if (i==0 || i==cs.size-1 || cs.size<=maxChangesets) {
					response.write(' '+osmLink.changeset(cid).at(cid))
				} else if (i==1) {
					response.write(e.h` ...${cs.size-2} more changesets...`)
				}
				i++
			}
			const viewHref=e.u`keys?key=${key}`
			response.write(e.h`<td><a href=${viewHref}>view</a>\n`)
		}
		response.write(`</table>\n`)
	}
}

export function analyzeKeysKey(response,project,changesets,key) {
	response.write(e.h`<h2>Changes in key <code>${key}</code></h2>\n`)
	response.write(`<table>\n`)
	response.write(`<tr><th>changeset<th>element<th>old value<th>new value\n`)
	for (const [cid,changes] of changesets) {
		for (const [,etype,eid,ev] of changes) {
			const currentElement=project.store[etype][eid][ev]
			const previousElement=project.store[etype][eid][ev-1]
			const cv=currentElement?.tags[key]
			const pv=previousElement?.tags[key]
			if (cv==pv) continue
			response.write(`<tr>`)
			response.write(`<td>`+osmLink.changeset(cid).at(cid))
			response.write(`<td>`+osmLink.element(etype,eid).at(`${etype} #${eid}`))
			if (ev==1) {
				response.write(`<td><em>new element</em>`)
			} else if (previousElement==null) {
				response.write(`<td><em>unknown</em>`)
			} else {
				response.write(e.h`<td>${pv}`)
			}
			response.write(e.h`<td>${cv}\n`)
		}
	}
	response.write(`</table>\n`)
}

export function analyzeChangesPerChangesetPerElement(response,project,changesets) { // TODO handle incomplete data - w/o prev versions
	const makeElementHeaderHtml=(type,id)=>osmLink.element(type,id).at(`${type} #${id}`)
	const makeElementTableHtml=(type,id,ver)=>id?osmLink.elementVersion(type,id,ver).at(`${type[0]}${id}v${ver}`):''
	response.write(`<h2>Changes per changeset per element</h2>\n`)
	for (const [cid,changes] of changesets) {
		response.write(`<h3>`+osmLink.changeset(cid).at(`Changeset #${cid}`)+`</h3>\n`)
		const parentQuery=createParentQuery(project.store,changes)
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

export function analyzeNonatomicChangesets(response,project,changesets) {
	response.write(`<h2>Nonatomic changesets</h2>\n`)
	response.write(`<p>List of changesets which contain more than one version of an element. This doesn't usually happen because changesets are typically closed right away after a sigle atomic write of all the changes.\n`)
	let firstOverall=true
	for (const [cid,changes] of changesets) {
		let firstInCset=true
		const nElementChanges={node:{},way:{},relation:{}}
		for (const [changeType,etype,eid,ev] of changes) {
			if (!nElementChanges[etype][eid]) nElementChanges[etype][eid]=0
			nElementChanges[etype][eid]++
		}
		let nOtherChanges=0
		const flushOtherChanges=()=>{
			if (nOtherChanges==0) return
			response.write(e.h`<dd>...${nOtherChanges} other changes...\n`)
			nOtherChanges=0
		}
		for (const [changeType,etype,eid,ev] of changes) {
			if (nElementChanges[etype][eid]<=1) {
				nOtherChanges++
				continue
			}
			if (firstOverall) {
				firstOverall=false
				response.write(`<dl>\n`)
			}
			if (firstInCset) {
				firstInCset=false
				response.write(`<dt>`+osmLink.changeset(cid).at(`changeset #${cid}`)+`\n`)
			}
			flushOtherChanges()
			response.write(e.h`<dd>${changeType} `+osmLink.element(etype,eid).at(`${etype} #${eid}`)+e.h` v${ev}\n`)
		}
		if (!firstInCset) flushOtherChanges()
	}
	if (firstOverall) {
		response.write(`<p>No such changesets found.\n`)
	} else {
		response.write(`</dl>\n`)
	}
}

export function analyzeChangesPerElement(response,project,changesets,filter) {
	response.write(`<h2>Changes per element</h2>\n`)
	let first=true
	let etype0,eid0
	let ecount=0
	let separatorCount=0
	const writeNextSeparatorLink=()=>{
		response.write(`<small><a id=separator-next-${separatorCount} href=#separator-prev-${separatorCount+1}>to next separator</a></small>\n`)
	}
	const writePrevSeparatorLink=()=>{
		response.write(`<small><a id=separator-prev-${separatorCount} href=#separator-next-${separatorCount-1}>to previous separator</a></small>\n`)
	}
	response.write(`<div class=separator>\n`)
	writeNextSeparatorLink()
	response.write(`</div>\n`)
	for (const [etype,eid,evs,,parent] of filter.filterElements(project,changesets,5,1)) {
		if (etype=='separator') {
			separatorCount++
			response.write(`<div class=separator>\n`)
			writePrevSeparatorLink()
			response.write(`<hr>\n`)
			writeNextSeparatorLink()
			response.write(`</div>\n`)
			continue
		}
		ecount++
		if (first) {
			first=false
		} else {
			writeConnector(etype0,eid0,etype,eid)
		}
		response.write(`<div class=reloadable>\n`)
		elementWriter(response,project,etype,eid,evs,parent)
		response.write(`</div>\n`)
		etype0=etype
		eid0=eid
	}
	separatorCount++
	response.write(`<div class=separator>\n`)
	writePrevSeparatorLink()
	response.write(`</div>\n`)
	if (first) {
		response.write(`<p>none found\n`)
	} else {
		response.write(`<form method=post action=fetch-previous>\n`)
		response.write(e.h`<input type=hidden name=filter value=${filter.text}>\n`)
		response.write(`<button>Fetch a batch of previous versions from OSM</button>\n`)
		response.write(`</form>\n`)
		response.write(`<form method=post action=fetch-subsequent>\n`)
		response.write(e.h`<input type=hidden name=filter value=${filter.text}>\n`)
		response.write(`<button>Fetch a batch of subsequent versions from OSM that are necessary for reactions</button>\n`)
		response.write(`</form>\n`)
		const latestHref=e.u`top.osm?filter=${filter.text}`
		response.write(e.h`<p>Get <a class=rc href=${latestHref} title='top versions'>josm file with top versions</a>. After that you may want to press the next button if you'e doing editing.\n`)
		response.write(`<form method=post action=assume-loaded>\n`)
		response.write(e.h`<input type=hidden name=filter value=${filter.text}>\n`)
		response.write(`<button>Assume that top versions are loaded into the editor</button>\n`)
		response.write(`</form>\n`)
		const deletedHref=e.u`deleted.osm?filter=${filter.text}`
		response.write(e.h`<p>Get <a class=rc href=${deletedHref} data-upload-policy=false title='versions before deletes'>josm file with latest visible versions of deleted elements</a>. This is only for visualization, don't upload it. The main purpose is to see if some new element appeared in place of a deleted one, and if so, compare their tags manually.\n`)
	}
	return ecount
	function writeConnector(etype1,eid1,etype2,eid2) {
		if (etype1!='way' || etype2!='way') return
		const estore1=project.store[etype1][eid1]
		const estore2=project.store[etype2][eid2]
		const nds1=estore1[osm.topVersion(estore1)].nds
		const nds2=estore2[osm.topVersion(estore2)].nds
		if (nds1.length<2 || nds2.length<2) return
		const [n11,n12]=[nds1[0],nds1[nds1.length-1]]
		const [n21,n22]=[nds2[0],nds2[nds2.length-1]]
		if (n11==n21 || n11==n22) {
			writeWayConnector(n11)
		} else if (n12==n21 || n12==n22) {
			writeWayConnector(n12)
		}
	}
	function writeWayConnector(nodeId) {
		response.write(`<div class=connector><span class=message>Ways connected through ${osmLink.node(nodeId).at('node #'+nodeId)}</span></div>\n`)
	}
}

export function analyzeTagRedos(response,project,changesets,filter,key='name',stubbornness=1) {
	response.write(e.h`<h2><code>${key}</code> tag editwars</h2>\n`)
	response.write(`<form action=tagredos class=real>\n`)
	response.write(e.h`<input type=hidden name=filter value=${filter.text}>\n`)
	response.write(e.h`<label>Key: <input type=text name=key value=${key}></label>\n`)
	response.write(e.h`<label>Stubbornness: <input type=number min=1 name=stubbornness value=${stubbornness}></label>\n`)
	response.write(`<button>Check this tag</button>\n`)
	response.write(`</form>\n`)
	let matchedElements=0
	for (const [etype,eid,evs] of filter.filterElements(project,changesets,3)) {
		const estore=project.store[etype][eid]
		const selectedVersions=new Set(evs)
		const trumpedSet=new Set()
		const uidColumns=new Set()
		let inChanges=0
		let outChanges=0
		let previousValue
		for (const ev of osm.allVersions(estore)) {
			const value=estore[ev].tags[key]??''
			if (previousValue==value) continue
			const uid=estore[ev].uid
			if (!uidColumns.has(uid)) uidColumns.add(uid)
			if (selectedVersions.has(ev)) {
				if (trumpedSet.has(value)) inChanges++
			} else {
				if (trumpedSet.has(value)) outChanges++
			}
			if (previousValue!=null) trumpedSet.add(previousValue)
			previousValue=value
		}
		if (inChanges+outChanges<stubbornness) continue // TODO separate in/out-stubbornness arg - or make a filter
		matchedElements++
		const el=osmLink.element(etype,eid)
		response.write(`<h3>`+el.at(`${etype} #${eid}`)+` `+el.history.at(`[history]`)+` `+el.deepHistory.at(`[deep history]`)+`</h3>\n`)
		response.write(`<table>\n`)
		response.write(`<tr><th rowspan=2>changeset<th rowspan=2>versions<th colspan=${uidColumns.size}>users\n`)
		response.write(`<tr>`)
		for (const uid of uidColumns) {
			response.write(`<td>`+project.getUserLink(uid))
		}
		response.write(`\n`)
		previousValue=null // now null is going to be a deleted state
		let preparedUid,preparedCid,preparedIn
		let preparedVersions=[]
		const writeRow=()=>{
			if (preparedUid==null) return
			response.write(`<tr><td>`+osmLink.changeset(preparedCid).at(preparedCid)+`<td>`+preparedVersions.join(' '))
			for (const uid of uidColumns) {
				response.write(`<td>`)
				if (uid!=preparedUid) continue
				if (preparedIn) response.write(`<strong>`)
				if (previousValue!=null) {
					response.write(e.h`${previousValue}`)
				} else {
					response.write(`<em>deleted</em>`)
				}
				if (preparedIn) response.write(`</strong>`)
			}
			response.write(`\n`)
			preparedUid=preparedCid=preparedIn=undefined
			preparedVersions=[]
		}
		for (const ev of osm.allVersions(estore)) {
			const value=(estore[ev].visible
				? estore[ev].tags[key]??''
				: null
			)
			if (previousValue==value) {
				preparedVersions.push(ev)
				continue
			}
			writeRow()
			preparedUid=estore[ev].uid
			preparedCid=estore[ev].changeset
			preparedIn=selectedVersions.has(ev)
			preparedVersions.push(ev)
			previousValue=value
		}
		writeRow()
		response.write(`</table>\n`)
	}
	response.write(`<p>${matchedElements} elements found\n`)
	response.write(`<form method=post action=fetch-preceding>\n`)
	response.write(e.h`<input type=hidden name=filter value=${filter.text}>\n`)
	response.write(`<button>Fetch a batch of preceding versions from OSM</button>\n`)
	response.write(`</form>\n`)
}

export function viewElements(response,project,changesets,filter) {
	response.write(`<h2>Filtered elements list</h2>\n`)
	let elementCount=0
	for (const [elementType,elementId,elementVersions] of filter.filterElements(project,changesets,3)) {
		if (elementCount==0) {
			response.write(`<table>\n`)
			response.write(
				`<tr><th>element<th>osm<th><abbr title='overpass turbo before change'>ov-</abbr><th><abbr title='osm deep history'>odh</abbr>`+
				`<th>known major tags<th>last state\n`
			)
		}
		elementCount++
		response.write(`<tr>`)
		response.write(e.h`<td>${elementType[0]}${elementId}`)
		response.write(e.h`<td><a href=${'https://www.openstreetmap.org/'+elementType+'/'+elementId}>osm</a>`)
		const elementStore=project.store[elementType][elementId]
		const elementVersion=elementVersions[elementVersions.length-1]
		const elementTimestamp=elementStore[elementVersion].timestamp
		response.write('<td>'+osmLink.elementTimestamp(elementType,elementId,elementTimestamp).overpassTurboBefore.at('ov-'))
		response.write('<td>'+osmLink.element(elementType,elementId).deepHistory.at('odh'))
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
	if (elementCount==0) {
		response.write(`<p>none found\n`)
	} else {
		response.write(`</table>\n`)
		response.write(e.h`<p>found ${elementCount} elements\n`)
		response.write(`<form method=post>\n`)
		response.write(e.h`<input type=hidden name=filter value=${filter.text}>\n`)
		response.write(`<button formaction=fetch-previous>Fetch a batch of previous versions from OSM</button>\n`)
		response.write(`<button formaction=fetch-latest>Fetch a batch of latest versions from OSM</button>\n`)
		response.write(`</form>\n`)
	}
}

export function analyzeChangesetComments(response,changesetStore,changesetIds,order) {
	const orderData=[
		['comment','comment lexicographically',(comment,cids)=>comment],
		['alphabet','comment lexicographically case-insensitive',(comment,cids)=>comment.toLowerCase()],
		['length','comment length',(comment,cids)=>comment.length],
		['number','number of changesets',(comment,cids)=>cids.length],
		['earliest','earliest changeset',(comment,cids)=>cids[0]],
		['latest','latest changeset',(comment,cids)=>cids[cids.legnth-1]],
	]
	response.write(`<h2>Order comments</h2>\n`)
	response.write(`<ul>\n`)
	let orderKeyFn
	for (const [o,oName,oKeyFn] of orderData) {
		const href='comments?order='+o
		let w1='', w2=''
		if (o==order) {
			orderKeyFn=oKeyFn
			w1=`<strong>`
			w2=`</strong>`
		}
		response.write(`<li>${w1}`+e.h`<a href=${href}>by ${oName}</a>`+`${w2}\n`)
	}
	response.write(`</ul>\n`)
	response.write(`<h2>Comments and corresponding changesets</h2>\n`)
	const cidsByComment={}
	for (const cid of changesetIds) {
		const metadata=changesetStore[cid]
		if (!metadata) continue
		const comment=metadata.tags.comment??''
		if (!cidsByComment[comment]) cidsByComment[comment]=[]
		cidsByComment[comment].push(cid)
	}
	response.write(`<dl>\n`)
	const comments=Object.keys(cidsByComment)
	if (orderKeyFn) {
		comments.sort((ca,cb)=>{
			const ka=orderKeyFn(ca,cidsByComment[ca])
			const kb=orderKeyFn(cb,cidsByComment[cb])
			if (ka<kb) return -1
			if (ka>kb) return +1
			return 0
		})
	}
	for (const comment of comments) {
		if (comment=='') {
			response.write(e.h`<dt><em>empty comment</em>\n`)
		} else {
			const translateHref=e.u`https://translate.google.com/?op=translate&sl=auto&tl=en&text=${comment}`
			response.write(e.h`<dt><span class=comment>${comment}</span> <a href=${translateHref}>[translate]</a>\n`)
		}
		response.write(e.h`<dd>`)
		for (const cid of cidsByComment[comment]) response.write(' '+osmLink.changeset(cid).at(cid))
		response.write(e.h`\n`)
	}
	response.write(`</dl>\n`)
}

export async function serveTopVersions(response,project,changesets,filter) {
	let elements
	try {
		elements=await fetchTopVersions(project,
			filter.filterElements(project,changesets,2)
		)
	} catch (ex) {
		response.writeHead(500)
		response.end(`top version fetch error:\n${ex.message}`)
		return
	}
	bocaFile.serveOsmFile(response,project.store,elements)
}

export async function serveTopVisibleVersions(response,project,changesets,filter) {
	let elements
	try {
		elements=await fetchTopVisibleVersions(project,
			filter.filterElements(project,changesets,2)
		)
	} catch (ex) {
		response.writeHead(500)
		response.end(`top visible version fetch error:\n${ex.message}`)
		return
	}
	bocaFile.serveOsmFile(response,project.store,elements)
}

// TODO make fetches report if they hit the limit
//	otherwise don't need response arg

// [.]...!..!..
export async function fetchFirstVersions(response,project,changesets,filter) {
	const multifetchList=[]
	for (const [etype,eid] of filter.filterElements(project,changesets,2)) {
		if (project.store[etype][eid]?.[1]) continue
		multifetchList.push([etype,eid,1])
		if (multifetchList.length>=10000) break
	}
	await osm.multifetchToStore(project.store,multifetchList)
}

// ...[.]!.[.]!..
export async function fetchPreviousVersions(response,project,changesets,filter) {
	const multifetchList=[]
	for (const [etype,eid,,ePreviousVersions] of filter.filterElements(project,changesets,4)) {
		for (const ev of ePreviousVersions) {
			if (project.store[etype][eid]?.[ev]) continue
			multifetchList.push([etype,eid,ev])
		}
		if (multifetchList.length>=10000) break
	}
	await osm.multifetchToStore(project.store,multifetchList)
}

// [....!..]!..
export async function fetchPrecedingVersions(response,project,changesets,filter) {
	const multifetchList=[]
	for (const [etype,eid,evs] of filter.filterElements(project,changesets,3)) {
		const versionCap=evs[evs.length-1]
		for (let ev=1;ev<versionCap;ev++) {
			if (project.store[etype][eid]?.[ev]) continue
			multifetchList.push([etype,eid,ev])
		}
		if (multifetchList.length>=10000) break
	}
	await osm.multifetchToStore(project.store,multifetchList,true)
}

// ....!..!.[.]
export async function fetchLatestVersions(response,project,changesets,filter) {
	const multifetchList=getLatestMultifetchList(project,changesets,filter,2)
	await osm.multifetchToStore(project.store,multifetchList)
}

// ....![..!..]
export async function fetchSubsequentVersions(response,project,changesets,filter) {
	const multifetchList=getLatestMultifetchList(project,changesets,filter,3)
	const actualMultifetchList=multifetchList.map(([etype,eid])=>[etype,eid])
	await osm.multifetchToStore(project.store,actualMultifetchList)
	const gapMultifetchList=[]
	for (const [etype,eid,eSelectedVersion] of multifetchList) {
		const elementStore=project.store[etype][eid]
		const vs1=eSelectedVersion[0]
		const vt=osm.topVersion(elementStore)
		for (let v=vs1;v<=vt;v++) {
			if (!elementStore[v]) gapMultifetchList.push([etype,eid,v])
		}
	}
	await osm.multifetchToStore(project.store,gapMultifetchList)
}

export async function assumeElementsAreLoaded(response,project,changesets,filter) {
	for (const [etype,eid] of filter.filterElements(project,changesets,2)) {
		const estore=project.store[etype][eid]
		if (estore.top && estore[estore.top.version].visible) {
			project.pendingRedactions.loaded[etype][eid]=1
		}
	}
	project.savePendingRedactions()
}

function getLatestMultifetchList(project,changesets,filter,detail) {
	const preMultifetchList=[]
	for (const entry of filter.filterElements(project,changesets,detail)) {
		const [etype,eid]=entry
		preMultifetchList.push([
			project.store[etype][eid].top?.timestamp??0,
			entry
		])
	}
	preMultifetchList.sort(([t1],[t2])=>t1-t2)
	const multifetchList=[]
	for (const [,entry] of preMultifetchList) {
		multifetchList.push(entry)
		if (multifetchList.length>=10000) break
	}
	return multifetchList
}
