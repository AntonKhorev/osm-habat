// scoped operations - receive changesets iterator

import * as e from './escape.js'
import * as osm from './osm.js'
import ParentChecker from './boca-parent.mjs'

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
		response.write(e.h`<tr><td><a href=${'https://www.openstreetmap.org/changeset/'+changesetId}>${changesetId}</a>`)
		for (const elementType of ['node','way','relation']) {
			c=count[elementType]
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
			const encodedKey=encodeURIComponent(key)
			response.write(e.h`<tr><td>${count}<td><a href=${'https://wiki.openstreetmap.org/wiki/Key:'+encodedKey}>${key}</a><td>`)
			const values=Object.entries(tagCount[key]).sort((a,b)=>(b[1]-a[1]))
			for (const [i,[v,c]] of values.entries()) {
				if (i>0) response.write(`, `)
				if (i>=maxValues) {
					response.write(e.h`<em>${values.length-maxValues} more values<em>`)
					break
				}
				const encodedTag=encodeURIComponent(key+'='+v)
				response.write(e.h`<a href=${'https://wiki.openstreetmap.org/wiki/Tag:'+encodedTag}>${v}</a>×${c}`)
			}
			response.write(`<td>`)
			let i=0
			let cs=keyChangesets[key]
			for (const cid of cs) {
				if (i==0 || i==cs.size-1 || cs.size<=maxChangesets) {
					response.write(e.h` <a href=${'https://www.openstreetmap.org/changeset/'+cid}>${cid}</a>`)
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
	const makeElementHeaderHtml=(type,id)=>e.h`<a href=${'https://www.openstreetmap.org/'+type+'/'+id}>${type} #${id}</a>`
	const makeElementTableHtml=(type,id,ver)=>id?e.h`<a href=${'https://api.openstreetmap.org/api/0.6/'+type+'/'+id+'/'+ver+'.json'}>${type[0]}${id}v${ver}</a>`:''
	response.write(`<h2>Changes per changeset per element</h2>\n`)
	for (const [cid,changes] of changesets) {
		response.write(`<h3><a href=${'https://www.openstreetmap.org/changeset/'+cid}>Changeset #${cid}</a></h3>\n`)
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

export function analyzeChangesPerElement(response,project,changesets,order) { // TODO handle incomplete data - w/o prev versions
	const makeElementHeaderHtml=(type,id)=>e.h`<a href=${'https://www.openstreetmap.org/'+type+'/'+id}>${type} #${id}</a>`
	const makeElementTableHtml=(type,id,ver)=>id?e.h`<a href=${'https://api.openstreetmap.org/api/0.6/'+type+'/'+id+'/'+ver+'.json'}>${type[0]}${id}v${ver}</a>`:''
	const makeTimestampHtml=(timestamp)=>{
		if (timestamp==null) return 'unknown'
		const pad=n=>n.toString().padStart(2,'0')
		const format=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
		return e.h`<time>${format(new Date(timestamp))}</time>`
	}
	const getChangeType=(v1,v2)=>{
		let change
		if (v1==null && v2!=null) change='create'
		if (v1!=null && v2==null) change='delete'
		if (v1!=null && v2!=null && v1!=v2) change='modify'
		return change
	}
	const makeChangeCell=(pdata,v1,v2,writer=v=>e.h`${v}`)=>{
		if (!pdata) return [writer(v2)]
		return [writer(v2),getChangeType(v1,v2)]
	}
	const makeRcLink=(request,title,data={})=>{
		let dataAttrs=``
		for (const [k,v] of Object.entries(data)) {
			dataAttrs+=e.h`data-${k}=${v} `
		}
		return `<a class=rc `+dataAttrs+e.h`href=${'http://127.0.0.1:8111/'+request}>${title}</a>`
	}
	response.write(`<h2>Changes per element</h2>\n`)
	response.write(`<ul>\n`)
	response.write(`<li><a href=cpe>default order</a>\n`)
	response.write(`<li><a href=cpe?order=name>order by name</a>\n`)
	response.write(`</ul>\n`)
	const elementVersions={node:new Map(),way:new Map(),relation:new Map()}
	const wayParents={}
	for (const [cid,changes] of changesets) {
		const parentQuery=createParentQuery(project,changes)
		for (const [,etype,eid,ev] of changes) {
			if (!elementVersions[etype].has(eid)) elementVersions[etype].set(eid,[])
			elementVersions[etype].get(eid).push(ev)
			if (etype=='way' && ev==1) {
				wayParents[eid]=parentQuery(eid)
			}
		}
	}
	const writeElement=(etype,eid)=>{
		const targetVersions=new Set(elementVersions[etype].get(eid))
		const minVersion=elementVersions[etype].get(eid)[0]-1
		const maxVersion=osm.topVersion(project.store[etype][eid])
		const iterate=(fn)=>{
			let pid,pv,pdata,cid,cv,cdata
			for (let ev=minVersion;ev<=maxVersion;ev++,[pid,pv,pdata]=[cid,cv,cdata]) {
				cid=eid
				cv=ev
				cdata=project.store[etype][eid][ev]
				if (ev==0) {
					if (etype=='way' && wayParents[eid]) {
						[cid,cv]=wayParents[eid]
						cdata=project.store[etype][cid][cv]
					} else {
						continue
					}
				}
				if (!cdata) continue // not fetched, pretend that this version doesn't exist
				fn(cid,cv,cdata,pid,pv,pdata)
			}
		}
		const iterateWritingTds=(fn)=>iterate((cid,cv,cdata,pid,pv,pdata)=>{
			const tdClasses=[]
			if (cid==eid && targetVersions.has(cv)) {
				tdClasses.push('target')
			}
			let output=fn(cid,cv,cdata,pid,pv,pdata)
			if (Array.isArray(output)) {
				let tdClass
				[output,tdClass]=output
				tdClasses.push(tdClass)
			}
			response.write(e.h`<td class=${tdClasses.join(' ')}>`+output)
		})
		let isUntagged=true
		let isV1only=true
		let isV1V2only=true
		let isOwnV1=targetVersions.has(1)
		let isVtopDeleted=true
		let isOwnVtop=true
		iterate((cid,cv,cdata)=>{
			isUntagged = isUntagged && (Object.keys(cdata.tags).length==0)
			isV1only = isV1only && (cid==eid && cv==1)
			isV1V2only = isV1V2only && (cid==eid && (cv==1 || cv==2))
			isVtopDeleted = !cdata.visible
			isOwnVtop = (cid==eid && targetVersions.has(cv))
		})
		const isNotInteresting=(etype=='node' && isUntagged && isOwnV1 && (
			isV1only || isVtopDeleted || isOwnVtop
		))
		response.write(e.h`<details class=element open=${!isNotInteresting}><summary>\n`)
		response.write(e.h`<h3 id=${etype[0]+eid}>`+makeElementHeaderHtml(etype,eid)+`</h3>\n`)
		const ohHref=e.u`https://www.openstreetmap.org/${etype}/${eid}/history`
		const dhHref=e.u`https://osmlab.github.io/osm-deep-history/#/${etype}/${eid}`
		const ddHref=e.u`http://osm.mapki.com/history/${etype}.php?id=${eid}`
		response.write(e.h`: <a href=${ohHref}>history</a>, <a href=${dhHref}>deep history</a>, <a href=${ddHref}>deep diff</a>\n`)
		{
			const collapsedVersions=[]
			iterate((cid,cv,cdata,pid,pv,pdata)=>{
				const cTargeted=(cid==eid && targetVersions.has(cv))
				if (collapsedVersions.length==0) { // first iteration
					if (cTargeted) {
						collapsedVersions.push([false,pid,pv,pdata])
					} else {
						collapsedVersions.push([false,cid,cv,cdata])
						return
					}
				}
				const [pTargeted]=collapsedVersions[collapsedVersions.length-1]
				if (pTargeted==cTargeted) collapsedVersions.pop()
				collapsedVersions.push([cTargeted,cid,cv,cdata])
			})
			const iterateOverCollapsed=(fn)=>{
				for (let i=1;i<collapsedVersions.length;i++) {
					fn(...collapsedVersions[i],...collapsedVersions[i-1])
				}
			}
			const props=[]
			iterateOverCollapsed((
				cTargeted,cid,cv,cdata,
				pTargeted,pid,pv,pdata
			)=>{
				const typeKeys=new Set([ // https://wiki.openstreetmap.org/wiki/Map_features#Primary_features
					'aerialway','aeroway','amenity','barrier','boundary','building',
					'craft','emergency','entrance','geological','healthcare',
					'highway','historic','landuse','leisure','man_made','military',
					'natural','office','place','power','public_transport',
					'railway','route','shop','telecom','tourism','waterway'
					// 'sport'
					// 'water' - only with natural=water
				])
				const getTypes=(tags)=>{
					const makeKvLink=(k,v)=>{
						const keyHref=`https://wiki.openstreetmap.org/wiki/Key:${k}`
						const tagHref=`https://wiki.openstreetmap.org/wiki/Tag:${k}=${v}`
						return e.h`<code><a href=${keyHref}>${k}</a>=<a href=${tagHref}>${v}</a></code>`
					}
					const makeVLink=(k,v)=>{
						const tagHref=`https://wiki.openstreetmap.org/wiki/Tag:${k}=${v}`
						return e.h`<a href=${tagHref}>${v}</a>`
					}
					const types=[]
					for (const [k,v] of Object.entries(tags)) {
						if (!typeKeys.has(k)) continue
						if (k=='amenity') {
							types.push(makeVLink(k,v))
						} else {
							types.push(makeKvLink(k,v))
						}
					}
					return types
				}
				const pVisible=pdata?pdata.visible:pv>0
				if (cdata.visible && !pVisible) {
					const types=getTypes(cdata.tags)
					if (types.length==0) {
						types.push((Object.keys(cdata.tags).length==0?'untagged ':'tagged ')+etype)
					}
					if (cdata.tags.name!=null) {
						types.push(`"${cdata.tags.name}"`)
					}
					const type=types.join(' ')
					props.push(cTargeted?`created ${type}`:`(later recreated as ${type})`)
				} else if (cdata.visible && pVisible) {
					// let changed='modified'
					let changed=''
					const mods=[]
					if (etype=='node') {
						const isMoved=(cdata.lat!=pdata.lat || cdata.lon!=pdata.lon)
						if (isMoved) mods.push('moved')
					} else if (etype=='way') {
						let isNodesChanged=false
						if (cdata.nds.length!=pdata.nds?.length) {
							isNodesChanged=true
						} else {
							for (let i=0;i<cdata.nds.length;i++) {
								if (cdata.nds[i]!=pdata.nds[i]) {
									isNodesChanged=true
									break
								}
							}
						}
						if (isNodesChanged) mods.push('nodes changed')
					} else if (etype=='relation') {
						let isMembersChanged=false
						if (cdata.members.length!=pdata.members?.length) {
							isMembersChanged=true
						} else {
							for (let i=0;i<cdata.members.length;i++) {
								const [c1,c2,c3]=cdata.members[i]
								const [p1,p2,p3]=pdata.members[i]
								if (c1!=p1 || c2!=p2 || c3!=p3) {
									isMembersChanged=true
									break
								}
							}
						}
						if (isMembersChanged) mods.push('members changed')
					}
					let nameChange,typeChange,tagChange
					const mergeChange=(c1,c2)=>{
						if (!c1) return c2
						if (!c2) return c1
						if (c1==c2) return c1
						return 'modify'
					}
					for (const k of Object.keys({...cdata.tags,...pdata.tags})) {
						const change=getChangeType(pdata.tags[k],cdata.tags[k])
						if (k=='name') {
							nameChange=mergeChange(nameChange,change)
						} else if (typeKeys.has(k)) {
							typeChange=mergeChange(typeChange,change)
						} else {
							tagChange=mergeChange(tagChange,change)
						}
					}
					if (nameChange=='create') mods.push(`named "${cdata.tags.name}"`)
					if (nameChange=='modify') mods.push(`renamed to "${cdata.tags.name}"`)
					if (nameChange=='delete') mods.push(`unnamed`)
					if (typeChange=='create') mods.push(`type added as ${getTypes(cdata.tags)}`)
					if (typeChange=='modify') mods.push(`type changed to ${getTypes(cdata.tags)}`)
					if (typeChange=='delete') mods.push(`type removed`)
					let t='tags'
					if (nameChange || typeChange) t='other tags'
					if (tagChange=='create') mods.push(`${t} added`)
					if (tagChange=='modify') mods.push(`${t} changed`)
					if (tagChange=='delete') mods.push(`${t} removed`)
					for (let i=0;i<mods.length;i++) {
						if (i==0) {
							changed=mods[i]
						} else if (i==mods.length-1) {
							changed+=' and '+mods[i]
						} else {
							changed+=', '+mods[i]
						}
					}
					if (changed=='') changed='modified'
					props.push(cTargeted?changed:`(later ${changed})`)
				} else if (!cdata.visible && pVisible) {
					props.push(cTargeted?'deleted':'(later deleted)')
				}
			})

			/*
			let pTargeted=false
			let collapsedData
			iterate((cid,cv,cdata,pid,pv,pdata)=>{
				const cTargeted=(cid==eid && targetVersions.has(cv))
				if (!pdata) { // first iteration
					if (cTargeted) {
						if (cv==1) {
							collapsedData={
								visible:false,
								tags:{},
							}
						} else {
							collapsedData={
								visible:true, // assume that it's not an undelete
							}
						}
					} else {
						collapsedData=cdata
						return
					}
				}
				if (pTagreted!=cTargeted) {
					trigger(collapsedData,pData)
					collapsedData=pData
				}
				pTargeted=cTargeted
			})
			*/
/*
			if (isNotInteresting) {
				if (isUntagged) props.push('untagged')
				if (isV1only || isOwnV1) props.push(`${isOwnV1?'own ':''}v1${isV1only?' only':''}`)
				if (!isV1only && isV1V2only) props.push('v1 & v2 only')
				if (!isV1only && (isVtopDeleted || isOwnVtop)) props.push(`${isOwnVtop?'own ':''}vtop${isVtopDeleted?' deleted':''}`)
			}
			const topData=project.store[etype][eid][maxVersion]
			const typeAndName=[]
			const makeKvLink=(k,v)=>{
				const keyHref=`https://wiki.openstreetmap.org/wiki/Key:highway`
				const tagHref=`https://wiki.openstreetmap.org/wiki/Tag:highway=${v}`
				return e.h`<code><a href=${keyHref}>${k}</a>=<a href=${tagHref}>${v}</a></code>`
			}
			const pushKvLink=(k)=>{
				if (topData.tags[k]==null) return
				typeAndName.push(makeKvLink(k,topData.tags[k]))
			}
			if (topData.tags.amenity!=null) {
				const tagHref=`https://wiki.openstreetmap.org/wiki/Tag:amenity=${topData.tags.amenity}`
				typeAndName.push(e.h`<a href=${tagHref}>${topData.tags.amenity}</a>`)
			}
			pushKvLink('highway')
			pushKvLink('railway')
			pushKvLink('landuse')
			if (topData.tags.name!=null) {
				typeAndName.push(e.h`"${topData.tags.name}"`)
			}
			if (typeAndName.length>0) {
				typeAndName.unshift(isOwnV1?'created':'modified')
				props.push(typeAndName.join(' '))
			}
*/
			if (props.length>0) response.write(': '+props.join('; ')+'\n')
		}
		response.write(`</summary>\n`)
		response.write(`<form method=post>\n`)
		response.write(e.h`<input type=hidden name=type value=${etype}>\n`)
		response.write(e.h`<input type=hidden name=id value=${eid}>\n`)
		response.write(`<table>`)
		response.write(`\n<tr><th>element`)
		iterateWritingTds((cid,cv,cdata)=>makeElementTableHtml(etype,cid,cv))
		response.write(`<td><button formaction=fetch-history>Update history</button>`)
		response.write(`\n<tr><th>changeset`)
		iterateWritingTds((cid,cv,cdata)=>e.h`<a href=${'https://www.openstreetmap.org/changeset/'+cdata.changeset}>${cdata.changeset}</a>`)
		response.write(`<th>last updated on`)
		response.write(`\n<tr><th>timestamp`)
		iterateWritingTds((cid,cv,cdata)=>makeTimestampHtml(cdata.timestamp))
		response.write(`<td>`+makeTimestampHtml(project.store[etype][eid].top?.timestamp))
		response.write(`\n<tr><th>visible`)
		iterateWritingTds((cid,cv,cdata,pid,pv,pdata)=>makeChangeCell(pdata,pdata?.visible,cdata.visible,v=>(v?'yes':'no')))
		if (etype=='way') {
			const makeNodeCell=(pdata,pnid,cnid)=>makeChangeCell(pdata,pnid,cnid,nid=>{
				if (nid) {
					const nHref=e.u`https://www.openstreetmap.org/node/${nid}`
					return e.h`<a href=${nHref}>${nid}</a>`
				} else {
					return ''
				}
			})
			response.write(`\n<tr><th>first node`)
			iterateWritingTds((cid,cv,cdata,pid,pv,pdata)=>makeNodeCell(pdata,pdata?.nds[0],cdata.nds[0]))
			response.write(`\n<tr><th>last node`)
			iterateWritingTds((cid,cv,cdata,pid,pv,pdata)=>makeNodeCell(pdata,pdata?.nds[pdata?.nds.length-1],cdata.nds[cdata.nds.length-1]))
		}
		response.write(`\n<tr><th>tags`)
		const allTags={}
		iterateWritingTds((cid,cv,cdata)=>{
			Object.assign(allTags,cdata.tags)
			return ''
		})
		for (const k in allTags) {
			let isChanged=false
			let previousValue
			let changedVersion
			response.write(e.h`\n<tr><td>${k}`)
			iterateWritingTds((cid,cv,cdata,pid,pv,pdata)=>{
				const [output,change]=makeChangeCell(pdata,pdata?.tags[k],cdata.tags[k])
				if (change && !isChanged) {
					isChanged=true
					previousValue=pdata.tags[k]??''
					changedVersion=cv
				}
				return [output,change]
			})
			if (isChanged && project.store[etype][eid].top) {
				response.write(`<td>`+makeRcLink(
					e.u`load_object?objects=${etype[0]+eid}&addtags=${k}=${previousValue}`,
					`[undo]`,
					{version:changedVersion}
				))
			} else if (isChanged) {
				response.write(`<td>update to enable undo`)
			}
		}
		response.write(`\n<tr><th>redacted`)
		iterateWritingTds((cid,cv,cdata,pid,pv,pdata)=>{
			if (project.redacted[etype][cid]?.[cv]!=null) {
				return e.h`${project.redacted[etype][cid][cv]}`
			} else if (cid==eid) {
				return e.h`<input type=checkbox name=version value=${cv}>`
			} else {
				return ''
			}
		})
		response.write(`<td><button formaction=make-redactions>Make redactions file</button>`)
		response.write(`\n</table>\n`)
		response.write(`</form>\n`)
		response.write(`</details>\n`)
	}
	for (const etype of ['node','way','relation']) {
		if (order=='name') {
			const eids=[]
			for (const [eid,evs] of elementVersions[etype]) {
				const eLastVersion=evs[evs.length-1]
				const ename=project.store[etype][eid][eLastVersion].tags.name
				eids.push([eid,ename])
			}
			eids.sort(([eid1,ename1],[eid2,ename2])=>(ename1??'').localeCompare(ename2??''))
			for (const [eid] of eids) writeElement(etype,eid)
		} else {
			for (const eid of elementVersions[etype].keys()) writeElement(etype,eid)
		}
	}
}

export function viewElements(response,project,changesets,filters) {
	response.write(`<h2>Filtered elements list</h2>\n`)
	response.write(`<table>\n`)
	response.write(`<tr><th>enabled filter<th>value\n`)
	for (const [k,v] of Object.entries(filters)) {
		response.write(e.h`<tr><td>${k}<td>${v}\n`)
	}
	response.write(`</table>\n`)
	let first=true
	for (const [elementType,elementId,elementVersions] of filterElements(project,changesets,filters)) {
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
		const timestampString=new Date(elementStore[elementVersion].timestamp-1000).toISOString()
		const query=`[date:"${timestampString}"];\n${elementType}(${elementId});\nout meta geom;`
		response.write(e.h`<td><a href=${'https://overpass-turbo.eu/map.html?Q='+encodeURIComponent(query)}>ov-</a>`)
		response.write(e.h`<td><a href=${'https://osmlab.github.io/osm-deep-history/#/'+elementType+'/'+elementId}>odh</a>`)
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
		for (const [k,v] of Object.entries(filters)) {
			response.write(e.h`<input type=hidden name=${k} value=${v}>\n`)
		}
		response.write(`<button>Fetch a batch of latest versions from OSM</button>\n`)
		response.write(`</form>`)
	}
}

export async function fetchFirstVersions (response,project,changesets,filters) {
	const multifetchList=[]
	for (const [etype,eid] of filterElements(project,changesets,filters)) {
		if (project.store[etype][eid]?.[1]) continue
		multifetchList.push([etype,eid,1])
		if (multifetchList.length>=10000) break
	}
	await osm.multifetchToStore(project.store,multifetchList)
}

export async function fetchPreviousVersions(response,project,changesets,filters) {
	const multifetchList=[]
	for (const [etype,eid,,ePreviousVersions] of filterElements(project,changesets,filters)) {
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
	for (const [etype,eid] of filterElements(project,changesets,filters)) {
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

/*
	v1.*=*    v1 must satifsy
	vt.*=*    currently known top version must satisfy
	vs.*=*    any of selected versions must satisfy
	vp.*=*    any of previous versions must satisfy
	          previous versions = all not selected versions that precede selected versions
*/
function *filterElements(project,changesets,filters) {
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
	const vpEntries={node:{},way:{},relation:{}} // previous versions even if they are not in the store
	const vsEntries={node:{},way:{},relation:{}} // current versions - expected to be in the store
	const addEntry=(vEntries,etype,eid,ev)=>{ // insertions are done in ascending order
		if (!vEntries[etype][eid]) vEntries[etype][eid]=new Set()
		vEntries[etype][eid].add(ev)
	}
	for (const [,etype,eid,ev] of project.getChangesFromChangesets(changesets)) {
		if (ev>1 && !vsEntries[etype][eid]?.has(ev-1)) addEntry(vpEntries,etype,eid,ev-1)
		addEntry(vsEntries,etype,eid,ev)
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
	for (const [etype,eids] of Object.entries(vsEntries)) {
		for (const eid of Object.keys(eids)) {
			if (verFilters.v1 && !passFilters(verFilters.v1,etype,eid,1)) continue
			if (verFilters.vt && !passFilters(verFilters.vt,etype,eid,osm.topVersion(project.store[etype][eid]))) continue
			if (verFilters.vp && !passAnyVersion(verFilters.vp,etype,eid,vpEntries[etype][eid])) continue
			if (verFilters.vs && !passAnyVersion(verFilters.vs,etype,eid,vsEntries[etype][eid])) continue
			yield [etype,eid,
				[...vsEntries[etype][eid]??[]],
				[...vpEntries[etype][eid]??[]]
			]
		}
	}
}

function createParentQuery(project,changes) {
	const previousWayVersion={}
	const parentChecker=new ParentChecker()
	for (const [,etype,eid,ev] of changes) {
		if (etype!='way') continue
		const currentWay=project.store[etype][eid][ev]
		const previousWay=project.store[etype][eid][ev-1]
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
