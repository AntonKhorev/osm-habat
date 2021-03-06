// scoped operations - receive changesets iterator

const e=require('./escape')
const osm=require('./osm')
const ParentChecker=require('./boca-parent')

exports.analyzeCounts=(response,project,changesets)=>{
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

exports.analyzeDeletes=(response,project,changesets)=>{
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
			const href=`elements?change=delete&type=${elementType}&version=${v+1}`
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
			const href=`elements?change=delete&type=${elementType}&uid1=${uid}`
			response.write(e.h`<tr><td>`+project.getUserLink(uid)+pc(count)+`<td><a href=${href}>show</a>\n`)
		}
		if (unknownUidCount>0) {
			response.write(e.h`<tr><td>unknown`+pc(unknownUidCount)+`\n`)
		}
		response.write(`</table>\n`)
		if (unknownUidCount>0) {
			response.write(`<form method=post action=fetch-first>\n`)
			response.write(e.h`<input type=hidden name=type value=${elementType}>\n`)
			response.write(`<input type=hidden name=change value=delete>\n`)
			response.write(`<button type=submit>Fetch a batch of first versions from OSM</button>\n`)
			response.write(`</form>\n`)
		}
	}
}

exports.analyzeFormulas=(response,project,changesets)=>{
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

exports.analyzeKeys=(response,project,changesets)=>{
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

exports.analyzeChangesPerChangesetPerElement=(response,project,changesets)=>{ // TODO handle incomplete data - w/o prev versions
	const makeElementHeaderHtml=(type,id)=>e.h`<a href=${'https://www.openstreetmap.org/'+type+'/'+id}>${type} #${id}</a>`
	const makeElementTableHtml=(type,id,ver)=>id?e.h`<a href=${'https://api.openstreetmap.org/api/0.6/'+type+'/'+id+'/'+ver+'.json'}>${type[0]}${id}v${ver}</a>`:''
	response.write(`<h2>Changes per changeset per element</h2>\n`)
	for (const [cid,changes] of changesets) {
		response.write(`<h3><a href=${'https://www.openstreetmap.org/changeset/'+cid}>Changeset #${cid}</a></h3>\n`)
		previousWayVersion={}
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
					const splitPid=parentChecker.getParentWay(eid)
					if (splitPid) {
						changeType='split-'+changeType
						pid=splitPid
						pv=previousWayVersion[pid]
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

exports.analyzeChangesPerElement=(response,project,changesets)=>{ // TODO handle incomplete data - w/o prev versions
	const makeElementHeaderHtml=(type,id)=>e.h`<a href=${'https://www.openstreetmap.org/'+type+'/'+id}>${type} #${id}</a>`
	const makeElementTableHtml=(type,id,ver)=>id?e.h`<a href=${'https://api.openstreetmap.org/api/0.6/'+type+'/'+id+'/'+ver+'.json'}>${type[0]}${id}v${ver}</a>`:''
	response.write(`<h2>Changes per changeset per element</h2>\n`)
	const elements={node:{},way:{},relation:{}}
	for (const [cid,changes] of changesets) {
		// TODO parent check
		for (const [,etype,eid,ev] of changes) {
			if (!elements[etype][eid]) elements[etype][eid]=[]
			elements[etype][eid].push(ev)
		}
	}
	for (const etype of ['node','way','relation']) {
		for (const eid in elements[etype]) {
			const targetVersions=new Set(elements[etype][eid])
			const minVersion=elements[etype][eid][0]-1
			const maxVersion=getLatestElementVersion(project.store[etype][eid])
			const iterate=(fn)=>{
				let pv
				let pdata={}
				for (let ev=minVersion;ev<=maxVersion;ev++) {
					if (ev==0) {
						// TODO output parent
						continue
					}
					const edata=project.store[etype][eid][ev]
					if (!edata) continue
					fn(ev,edata,eid,pv,pdata)
					pv=ev
					pdata=edata
				}
			}
			response.write(`<h3>`+makeElementHeaderHtml(etype,eid)+`</h3>\n`)
			const dhHref=e.u`https://osmlab.github.io/osm-deep-history/#/${etype}/${eid}`
			const ddHref=e.u`http://osm.mapki.com/history/${etype}.php?id=${eid}`
			response.write(`<div>external tools: <a href=${dhHref}>deep history</a>, <a href=${ddHref}>deep diff</a></div>\n`)
			response.write(`<table>`)
			response.write(`\n<tr><th>changeset`)
			iterate((ev,edata)=>{
				response.write(`<td>`)
				if (targetVersions.has(ev)) response.write(`<strong>`)
				response.write(e.h`<a>${edata.changeset}</a>`)
				if (targetVersions.has(ev)) response.write(`</strong>`)
			})
			response.write(`\n<tr><th>element`)
			iterate((ev,edata)=>{
				response.write(`<td>`+makeElementTableHtml(etype,eid,ev))
			})
			response.write(`\n<tr><th>visible`)
			iterate((ev,edata,pid,pv,pdata)=>{
				let change
				if (edata.visible!=!!pdata.visible) change='modify'
				response.write(e.h`<td class=${change}>${(edata.visible?'yes':'no')}`)
			})
			const allTags={}
			iterate((ev,edata)=>Object.assign(allTags,edata.tags))
			response.write(`\n<tr><th>tags`)
			for (const k in allTags) {
				response.write(e.h`\n<tr><td>${k}`)
				iterate((ev,edata,pid,pv,pdata)=>{
					let v1=pdata.tags?.[k]
					let v2=edata.tags[k]
					let change
					if (v1==undefined && v2!=undefined) change='create'
					if (v1!=undefined && v2==undefined) change='delete'
					if (v1!=undefined && v2!=undefined && v1!=v2) change='modify'
					response.write(e.h`<td class=${change}>${v2}`)
				})
			}
			response.write(`\n</table>\n`)
		}
	}
}

exports.viewElements=(response,project,changesets,filters)=>{
	response.write(`<h2>Filtered elements list</h2>\n`)
	response.write(`<table>\n`)
	response.write(`<tr><th>enabled filter<th>value\n`)
	for (const [k,v] of Object.entries(filters)) {
		response.write(e.h`<tr><td>${k}<td>${v}\n`)
	}
	response.write(`</table>\n`)
	let first=true
	for (const [changeType,elementType,elementId,elementVersion] of filterChanges(project,changesets,filters)) {
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
		const timestampString=new Date(elementStore[elementVersion].timestamp-1000).toISOString()
		const query=`[date:"${timestampString}"];\n${elementType}(${elementId});\nout meta geom;`
		response.write(e.h`<td><a href=${'https://overpass-turbo.eu/map.html?Q='+encodeURIComponent(query)}>ov-</a>`)
		response.write(e.h`<td><a href=${'https://osmlab.github.io/osm-deep-history/#/'+elementType+'/'+elementId}>odh</a>`)
		const majorTags={}
		for (const data of Object.values(elementStore)) {
			for (const k of ['boundary','building','highway','landuse','natural','power']) {
				if (k in data.tags) majorTags[k]=data.tags[k]
			}
		}
		response.write(e.h`<td>${Object.entries(majorTags).map(([k,v])=>k+'='+v).join(' ')}`)
		const latestVersion=getLatestElementVersion(elementStore)
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
		response.write(`<button type=submit>Fetch a batch of latest versions from OSM</button>\n`)
		response.write(`</form>`)
	}
}

exports.fetchFirstVersions=async(response,project,changesets,filters)=>{
	const multifetchList=[]
	for (const [changeType,elementType,elementId,elementVersion] of filterChanges(project,changesets,filters)) {
		if (project.store[elementType][elementId]?.[1]) continue
		multifetchList.push([elementType,elementId,1])
		if (multifetchList.length>=10000) break
	}
	await osm.multifetchToStore(project.store,multifetchList)
}

exports.fetchPreviousVersions=async(response,project,changesets,filters)=>{
	const multifetchList=[]
	for (const [changeType,elementType,elementId,elementVersion] of filterChanges(project,changesets,filters)) {
		if (elementVersion<=1) continue
		if (project.store[elementType][elementId]?.[elementVersion-1]) continue
		multifetchList.push([elementType,elementId,elementVersion-1])
		if (multifetchList.length>=10000) break
	}
	await osm.multifetchToStore(project.store,multifetchList)
}

exports.fetchLatestVersions=async(response,project,changesets,filters)=>{
	const multifetchList=[]
	for (const [changeType,elementType,elementId,elementVersion] of filterChanges(project,changesets,filters)) {
		// TODO keep list of recently updated elements somewhere and check it - otherwise can't fetch more than a batch
		multifetchList.push([elementType,elementId])
		if (multifetchList.length>=10000) break
	}
	await osm.multifetchToStore(project.store,multifetchList)
}

function *filterChanges(project,changesets,filters) {
	const filteredChangeList=[]
	for (const changeListEntry of project.getChangesFromChangesets(changesets)) {
		const [changeType,elementType,elementId,elementVersion]=changeListEntry
		if (filters.change && filters.change!=changeType) continue
		if (filters.type && filters.type!=elementType) continue
		if (filters.version && filters.version!=elementVersion) continue
		const elementStore=project.store[elementType][elementId]
		if (filters.uid1) {
			if (elementStore[1]===undefined) continue
			if (elementStore[1].uid!=filters.uid1) continue
		}
		yield changeListEntry
	}
}

function getLatestElementVersion(elementStore) { // TODO remove copypaste
	return Math.max(...(Object.keys(elementStore).map(v=>Number(v))))
}
