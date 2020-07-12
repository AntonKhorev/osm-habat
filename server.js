const fs=require('fs')
const path=require('path')
const http=require('http')
const url=require('url')
const sanitize=require('sanitize-filename')
const expat=require('node-expat')
const open=require('open')

const e=require('./escape')
const User=require('./user')

function respondHead(response,title) {
	response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'})
	for (const line of [
		`<!DOCTYPE html>`,
		`<html lang=en>`,
		`<head>`,
		`<meta charset=utf-8>`,
		e.h`<title>${title}</title>`,
		`<style>`,
		`.create {background: #CFC}`,
		`.modify {background: #FFC}`,
		`.delete {background: #FCC}`,
		`</style>`,
		`</head>`,
		`<body>`,
	]) {
		response.write(line)
		response.write('\n')
	}
}

function respondTail(response) {
	for (const line of [
		`</body>`,
		`</html>`,
	]) {
		response.write(line)
		response.write('\n')
	}
	response.end()
}

function reportUser(response,user,callback) {
	let currentYear,currentMonth
	const createdBys={}
	const sources={}
	const changesetsWithComments=[]
	const reportChanges=()=>{
		response.write(`<h2>Changes</h2>\n`)
		let mode='?'
		let nodeChanges={}
		let wayChanges={}
		let relationChanges={}
		let nodeVersions={}
		let wayVersions={}
		let relationVersions={}
		let nParsed=0
		const up=(ac,av,attrs)=>{
			const id=attrs.id
			const ver=Number(attrs.version)
			if (ac[id]===undefined) {
				ac[id]=mode
			} else {
				if (av[id]+1!=ver) ac[id]+='-'
				ac[id]+=mode
			}
			av[id]=ver
		}
		user.parseChangesetData(()=>{
			nParsed++
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				switch (name) {
				case 'create': mode='C'; break
				case 'modify': mode='M'; break
				case 'delete': mode='D'; break
				case 'node': up(nodeChanges,nodeVersions,attrs); break
				case 'way': up(wayChanges,wayVersions,attrs); break
				case 'relation': up(relationChanges,relationVersions,attrs); break
				}
			}).on('endElement',(name)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode='?'
				}
			})
		},()=>{
			response.write(`<ul>\n`)
			response.write(e.h`<li>downloaded and parsed ${nParsed} changesets\n`)
			if (nParsed>0) {
				const changesLayerName=encodeURIComponent('changes of '+user.displayName)
				const changesRemoteUrl=encodeURIComponent(`http://localhost:${server.address().port}/user/${user.uid}/changes.osm`)
				response.write(`<li><a href=changes.osm>changes josm file</a>, <a href=http://127.0.0.1:8111/import?new_layer=true&layer_name=${changesLayerName}&url=${changesRemoteUrl}>josm remote control</a>\n`)
				response.write(`<li><a href=deletions.osm>deletions josm file</a>\n`)
				response.write(`<li><a href=keys/>changed keys</a>\n`)
				response.write(`<li><a href=elements/>changed elements</a>\n`)
			}
			response.write(`</ul>\n`)
			response.write(`<table>\n`)
			response.write(`<tr><th>change<th>nodes<th>ways<th>relations\n`)
			const changesTotal={}
			for (const [,c] of Object.entries(nodeChanges)) {
				if (changesTotal[c]===undefined) changesTotal[c]=[0,0,0]
				changesTotal[c][0]++
			}
			for (const [,c] of Object.entries(wayChanges)) {
				if (changesTotal[c]===undefined) changesTotal[c]=[0,0,0]
				changesTotal[c][1]++
			}
			for (const [,c] of Object.entries(relationChanges)) {
				if (changesTotal[c]===undefined) changesTotal[c]=[0,0,0]
				changesTotal[c][2]++
			}
			for (const change in changesTotal) {
				response.write(e.h`<tr><td>${change}<td>${changesTotal[change][0]}<td>${changesTotal[change][1]}<td>${changesTotal[change][2]}\n`)
			}
			response.write(`</table>\n`)
			callback()
		})
	}
	const reportEnd=()=>{
		response.write(`<h2>Editors</h2>\n`)
		response.write(`<dl>\n`)
		for (const editor in createdBys) {
			response.write(e.h`<dt>${editor} <dd>${createdBys[editor]} changesets\n`)
		}
		response.write(`</dl>\n`)
		response.write(`<h2>Sources</h2>\n`)
		response.write(`<dl>\n`)
		for (const source in sources) {
			response.write(e.h`<dt>${source} <dd>${sources[source]} changesets\n`)
		}
		response.write(`</dl>\n`)
		response.write(`<h2>Comments</h2>\n`)
		response.write(`<dl>\n`)
		response.write(`<dt>Changesets with comments <dd>`)
		if (changesetsWithComments.length==0) {
			response.write(`none`)
		}
		for (const id of changesetsWithComments) {
			response.write(e.h` <a href=${'https://www.openstreetmap.org/changeset/'+id}>${id}</a>`)
		}
		response.write(`\n`)
		response.write(`</dl>\n`)
		response.write(`<h2>Areas</h2>\n`)
		response.write(`<ul>\n`)
		response.write(`<li><a href=bbox.osm>bbox josm file</a>\n`)
		response.write(`</ul>\n`)
		reportChanges()
	}
	const encodedName=encodeURIComponent(user.displayName)
	const cEscapedName=user.displayName.replace(/\\/g,'\\\\').replace(/"/g,'\\"')
	response.write(e.h`<h1>User #${user.uid} <a href=${'https://www.openstreetmap.org/user/'+encodedName}>${user.displayName}</a></h1>\n`)
	response.write(e.h`<ul>\n`)
	response.write(e.h`<li>last update was on ${user.updateTimestamp}\n`)
	response.write(e.h`<li>downloaded metadata of ${user.changesets.length}/${user.changesetsCount} changesets\n`)
	const hdycHref=`http://hdyc.neis-one.org/?`+encodedName
	const osmchaHref=`https://osmcha.org/filters?filters=`+encodeURIComponent(`{"users":[{"label":"${cEscapedName}","value":"${cEscapedName}"}],"date__gte":[{"label":"","value":""}]}`)
	response.write(e.h`<li>external tools: <a href=${hdycHref}>hdyc</a> <a href=${osmchaHref}>osmcha</a></li>\n`)
	response.write(e.h`</ul>\n`)
	response.write(e.h`<h2>Changesets</h2>\n`)
	user.parseChangesetMetadata(i=>{
		const id=user.changesets[i]
		let dateString,createdBy,source
		return (new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='changeset') {
				dateString=attrs.created_at
				if (attrs.comments_count!='0') {
					changesetsWithComments.push(id)
				}
			} else if (name=='tag') {
				if (attrs.k=='created_by') createdBy=attrs.v
				if (attrs.k=='source') source=attrs.v
			}
		}).on('end',()=>{
			const date=new Date(dateString)
			if (i==0) {
				response.write(e.h`<dl>\n<dt>${dateString} <dd>last known changeset`)
			}
			if (currentYear!=date.getFullYear() || currentMonth!=date.getMonth()) {
				currentYear=date.getFullYear()
				currentMonth=date.getMonth()
				response.write(e.h`\n<dt>${currentYear}-${String(currentMonth+1).padStart(2,'0')} <dd>`)
			}
			response.write(e.h` <a href=${'https://www.openstreetmap.org/changeset/'+id}>${id}</a>`)
			if (!createdBy) createdBy='(unknown)'
			if (!source) source='(unknown)'
			createdBys[createdBy]=(createdBys[createdBy]||0)+1
			sources[source]=(sources[source]||0)+1
			if (i>=user.changesets.length-1) {
				response.write(e.h`\n<dt>${dateString} <dd>first known changeset`)
				response.write(`\n</dl>\n`)
			}
		})
	},reportEnd)
}

function reportUserKeys(response,user,callback) {
	const encodedName=encodeURIComponent(user.displayName)
	response.write(e.h`<h1>User #${user.uid} <a href=${'https://www.openstreetmap.org/user/'+encodedName}>${user.displayName}</a></h1>\n`)
	const data={node:{},way:{},relation:{}}
	const setData=(element,id,version,tags)=>{
		if (data[element][id]===undefined) {
			data[element][id]={}
		}
		data[element][id][version]=tags
	}
	const getData=(element,id,version)=>{
		if (data[element][id]===undefined) {
			return undefined
		}
		return data[element][id][version]
	}
	const knownKeyCount={}
	const knownKeyChangesets={}
	const knownTagCount={}
	const unknownKeyCount={}
	const unknownKeyChangesets={}
	const unknownTagCount={}
	const hitKey=(a,k)=>{
		a[k]=(a[k]||0)+1
	}
	const hitKeyChangeset=(a,k,changeset)=>{
		if (a[k]===undefined) a[k]=new Map()
		a[k].set(changeset,true)
	}
	const hitTag=(a,k,v)=>{
		if (a[k]===undefined) a[k]={}
		a[k][v]=(a[k][v]||0)+1
	}
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
			for (const changeset of cs.keys()) {
				if (i==0 || i==cs.size-1 || cs.size<=maxChangesets) {
					response.write(e.h` <a href=${'https://www.openstreetmap.org/changeset/'+changeset}>${changeset}</a>`)
				} else if (i==1) {
					response.write(e.h` ...${cs.size-2} more changesets...`)
				}
				i++
			}
			response.write(`\n`)
		}
		response.write(`</table>\n`)
	}
	function processChangesetData() {
		user.parseChangesetData((iChangeset)=>{
			let mode,id,version,tags
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode=name
				} else if (name=='node' || name=='way' || name=='relation') {
					id=attrs.id
					version=Number(attrs.version)
					tags={}
				} else if (name=='tag') {
					if (tags) tags[attrs.k]=attrs.v
				}
			}).on('endElement',(name)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode=undefined
				} else if (name=='node' || name=='way' || name=='relation') {
					setData(name,id,version,tags)
					const prevData=getData(name,id,version-1)
					for (const [k,v] of Object.entries(tags)) {
						if (mode=='create' || (mode=='modify' && prevData!==undefined && prevData[k]!=v)) {
							hitKey(knownKeyCount,k)
							hitKeyChangeset(knownKeyChangesets,k,user.changesets[iChangeset])
							hitTag(knownTagCount,k,v)
						} else if (mode=='modify' && prevData===undefined) {
							hitKey(unknownKeyCount,k)
							hitKeyChangeset(unknownKeyChangesets,k,user.changesets[iChangeset])
							hitTag(unknownTagCount,k,v)
						}
					}
					id=version=tags=undefined
				}
			})
		},()=>{
			writeKeyTable('Known key edits',knownKeyCount,knownKeyChangesets,knownTagCount)
			writeKeyTable('Possible key edits',unknownKeyCount,unknownKeyChangesets,unknownTagCount)
			callback()
		})
	}
	function processPreviousData() {
		user.parsePreviousData(()=>{
			let id,version,tags
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				if (name=='node' || name=='way' || name=='relation') {
					id=attrs.id
					version=Number(attrs.version)
					tags={}
				} else if (name=='tag') {
					if (tags) tags[attrs.k]=attrs.v
				}
			}).on('endElement',(name)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode=undefined
				} else if (name=='node' || name=='way' || name=='relation') {
					setData(name,id,version,tags)
					id=version=tags=undefined
				}
			})
		},processChangesetData)
	}
	processPreviousData()
}

function reportUserElements(response,user,callback) {
	const encodedName=encodeURIComponent(user.displayName)
	response.write(e.h`<h1>User #${user.uid} <a href=${'https://www.openstreetmap.org/user/'+encodedName}>${user.displayName}</a></h1>\n`)
	response.write(`<h2>Elements changed</h2>\n`)
	response.write(`<p>example css mod - show only modified names:\n`)
	response.write(`<pre><code>`+
		`tr:not(.modify),\n`+
		`tr:not([data-key^=name])\n`+
		`{display:none}\n`+
	`</code></pre>\n`)
	const data={node:{},way:{},relation:{}}
	const setData=(element,id,version,tags)=>{
		if (data[element][id]===undefined) {
			data[element][id]={}
		}
		data[element][id][version]=tags
	}
	const getData=(element,id,version)=>{
		if (data[element][id]===undefined) {
			return undefined
		}
		return data[element][id][version]
	}
	function processChangesetData() {
		user.parseChangesetData((i)=>{
			let tableHeaderWritten=false
			let mode,element,id,version,tags
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode=name
				} else if (name=='node' || name=='way' || name=='relation') {
					if (!tableHeaderWritten) {
						let id=user.changesets[i]
						response.write(e.h`<h3><a href=${`https://www.openstreetmap.org/changeset/${id}`}>Changeset #${id}</a> written around ${attrs.timestamp}</h3>\n`)
						response.write(`<table>\n`)
						response.write(`<tr><th>key<th>old value<th>new value\n`)
						tableHeaderWritten=true
					}
					element=name
					id=attrs.id
					version=Number(attrs.version)
					tags={}
				} else if (name=='tag') {
					tags[attrs.k]=attrs.v
				}
			}).on('endElement',(name)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode=undefined
				} else if (name=='node' || name=='way' || name=='relation') {
					response.write(e.h`<tr><th colspan=3>${mode} <a href=${`https://www.openstreetmap.org/${name}/${id}`}>${element} #${id}</a>\n`)
					const prevTags=getData(element,id,version-1)
					const combinedTags={}
					if (prevTags!==undefined) {
						for (const [k,v] of Object.entries(prevTags)) {
							combinedTags[k]=[v,'']
						}
					}
					for (const [k,v] of Object.entries(tags)) {
						if (combinedTags[k]===undefined) combinedTags[k]=['','']
						combinedTags[k][1]=v
					}
					for (const [k,[v1,v2]] of Object.entries(combinedTags)) {
						let change
						if (v1=='' && v2!='') change='create'
						if (v1!='' && v2=='') change='delete'
						if (v1!='' && v2!='' && v1!=v2) change='modify'
						response.write(e.h`<tr class=${change} data-key=${k}><td>${k}<td>${v1}<td>${v2}\n`)
					}
					setData(element,id,version,tags)
					element=id=version=tags=undefined
				}
			}).on('end',()=>{
				if (tableHeaderWritten) response.write(`</table>\n`)
			})
		},callback)
	}
	function processPreviousData() {
		user.parsePreviousData(()=>{
			let element,id,version,tags
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				if (name=='node' || name=='way' || name=='relation') {
					element=name
					id=attrs.id
					version=Number(attrs.version)
					tags={}
				} else if (name=='tag') {
					tags[attrs.k]=attrs.v
				}
			}).on('endElement',(name)=>{
				if (name=='node' || name=='way' || name=='relation') {
					setData(element,id,version,tags)
					element=id=version=tags=undefined
				}
			})
		},processChangesetData)
	}
	processPreviousData()
}

function respondBbox(response,user) {
	response.writeHead(200,{
		'Content-Type':'application/xml; charset=utf-8',
		'Content-Disposition':'attachment; filename="bbox.osm"',
	})
	response.write(`<?xml version="1.0" encoding="UTF-8"?>\n`)
	response.write(`<osm version="0.6" generator="osm-habat" download="never" upload="never">\n`)
	let k=0 // number of changesets with bbox
	user.parseChangesetMetadata(()=>(new expat.Parser()).on('startElement',(name,attrs)=>{
		if (name=='changeset' && attrs.min_lat && attrs.min_lon && attrs.max_lat && attrs.max_lon) {
			response.write(e.x`  <node id="-${k*4+1}" lat="${attrs.min_lat}" lon="${attrs.min_lon}" />\n`)
			response.write(e.x`  <node id="-${k*4+2}" lat="${attrs.max_lat}" lon="${attrs.min_lon}" />\n`)
			response.write(e.x`  <node id="-${k*4+3}" lat="${attrs.max_lat}" lon="${attrs.max_lon}" />\n`)
			response.write(e.x`  <node id="-${k*4+4}" lat="${attrs.min_lat}" lon="${attrs.max_lon}" />\n`)
			k++
		}
	}),()=>{
		for (let i=0;i<k;i++) {
			response.write(e.x`  <way id="-${i+1}">\n`)
			for (let j=0;j<=4;j++) {
				response.write(e.x`    <nd ref="-${i*4+1+j%4}" />\n`)
			}
			response.write(e.x`  </way>\n`)
		}
		response.end(`</osm>\n`)
	})
}

function writeNode(response,id,version,data) {
	if (!data) {
		response.write(e.x`  <!-- missing node id="${id}" version="${version}" -->\n`)
		return
	}
	const [lat,lon,tags]=data
	response.write(e.x`  <node id="${id}" version="${version}" lat="${lat}" lon="${lon}"`)
	let t=Object.entries(tags)
	if (t.length<=0) {
		response.write(`/>\n`)
	} else {
		response.write(`>\n`)
		for (const [k,v] of t) response.write(e.x`    <tag k="${k}" v="${v}"/>\n`)
		response.write(`  </node>\n`)
	}
}

function writeWay(response,id,version,data) {
	if (!data) {
		response.write(e.x`  <!-- missing way id="${id}" version="${version}" -->\n`)
		return
	}
	const [tags,nodes]=data
	response.write(e.x`  <way id="${id}" version="${version}">\n`)
	for (const node of nodes) response.write(e.x`    <nd ref="${node}"/>\n`)
	for (const [k,v] of Object.entries(tags)) response.write(e.x`    <tag k="${k}" v="${v}"/>\n`)
	response.write(`  </way>\n`)
}

function respondChanges(response,user) {
	response.writeHead(200,{
		'Content-Type':'application/xml; charset=utf-8',
		'Content-Disposition':'attachment; filename="changes.osm"',
	})
	response.write(`<?xml version="1.0" encoding="UTF-8"?>\n`)
	response.write(`<osm version="0.6" generator="osm-habat">\n`)
	const nodeData={} // id: [version,lat,lon,tags]
	const wayData={} // id: [version,tags,nodes]
	function writeData() {
		for (const [id,[version,lat,lon,tags]] of Object.entries(nodeData)) {
			writeNode(response,id,version,[lat,lon,tags])
		}
		for (const [id,[version,tags,nodes]] of Object.entries(wayData)) {
			writeWay(response,id,version,[tags,nodes])
			const missingNodes=[]
			for (const node of nodes) {
				if (!nodeData[node]) missingNodes.push(node)
			}
			if (missingNodes.length>0) {
				response.write(e.x`  <!-- way ${id} is missing nodes ${missingNodes.join(',')} -->\n`)
			}
		}
		response.end(`</osm>\n`)
	}
	function processReferencedData() {
		const requiredNodes={}
		for (const [id,[version,tags,nodes]] of Object.entries(wayData)) {
			for (const node of nodes) {
				if (!nodeData[node]) requiredNodes[node]=true
			}
		}
		user.parseReferencedData(()=>{
			let id,version,lat,lon,tags
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				if (name=='node') {
					id=attrs.id
					version=Number(attrs.version)
					lat=attrs.lat
					lon=attrs.lon
					tags={}
				} else if (name=='tag') {
					if (tags) tags[attrs.k]=attrs.v
				}
			}).on('endElement',(name)=>{
				if (name=='node') {
					if (requiredNodes[id] && lat!==undefined && lon!==undefined) { // otherwise node is deleted
						nodeData[id]=[version,lat,lon,tags]
					}
					id=version=lat=lon=tags=nodes=undefined
				}
			})
		},writeData)
	}
	function processChangesetData() {
		user.parseChangesetData(()=>{
			let mode
			let id,version,lat,lon,tags,nodes
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode=name
				} else if (name=='node' || name=='way') { // TODO relation
					id=attrs.id
					version=Number(attrs.version)
					lat=attrs.lat
					lon=attrs.lon
					tags={}
					nodes=[]
				} else if (name=='tag') {
					if (tags) tags[attrs.k]=attrs.v
				} else if (name=='nd') {
					if (nodes) nodes.push(attrs.ref)
				}
			}).on('endElement',(name)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode=undefined
				} else if (name=='node' || name=='way') { // TODO relation
					if (name=='node') {
						if (mode=='delete') {
							delete nodeData[id]
						} else if (mode=='create' || mode=='modify') {
							nodeData[id]=[version,lat,lon,tags]
						}
					} else if (name=='way') {
						if (mode=='delete') {
							delete wayData[id]
						} else if (mode=='create' || mode=='modify') {
							wayData[id]=[version,tags,nodes]
						}
					}
					id=version=lat=lon=tags=nodes=undefined
				}
			})
		},processReferencedData)
	}
	processChangesetData()
}

function respondDeletions(response,user) {
	response.writeHead(200,{
		'Content-Type':'application/xml; charset=utf-8',
		'Content-Disposition':'attachment; filename="deletions.osm"',
	})
	response.write(`<?xml version="1.0" encoding="UTF-8"?>\n`)
	response.write(`<osm version="0.6" generator="osm-habat">\n`)
	const nodeVersions={}
	const wayVersions={}
	const nodeData={} // id: [lat,lon,tags]
	const wayData={} // id: [tags,nodes]
	function writeData() {
		for (const [id,version] of Object.entries(nodeVersions)) {
			writeNode(response,id,version,nodeData[id])
		}
		for (const [id,version] of Object.entries(wayVersions)) {
			writeWay(response,id,version,wayData[id])
		}
		response.end(`</osm>\n`)
	}
	function processPreviousData() {
		user.parsePreviousData(()=>{
			let id,version,lat,lon,tags,nodes
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				if (name=='node' || name=='way') { // TODO relation
					id=attrs.id
					version=Number(attrs.version)
					lat=attrs.lat
					lon=attrs.lon
					tags={}
					nodes=[]
				} else if (name=='tag') {
					if (tags) tags[attrs.k]=attrs.v
				} else if (name=='nd') {
					if (nodes) nodes.push(attrs.ref)
				}
			}).on('endElement',(name)=>{
				if (name=='node' || name=='way') { // TODO relation
					if (name=='node' && nodeVersions[id]==version) nodeData[id]=[lat,lon,tags]
					if (name=='way' && wayVersions[id]==version) wayData[id]=[tags,nodes]
					id=version=lat=lon=tags=nodes=undefined
				}
			})
		},writeData)
	}
	function processChangesetData() {
		user.parseChangesetData(()=>{
			let mode
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode=name
				} else if (name=='node' || name=='way') { // TODO relation
					if (mode=='delete') { // TODO handle self-deletions
						const id=attrs.id
						const version=Number(attrs.version)
						if (name=='node') nodeVersions[id]=version-1
						if (name=='way') wayVersions[id]=version-1
					}
				}
			}).on('endElement',(name)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode=undefined
				}
			})
		},processPreviousData)
	}
	processChangesetData()
}

function matchUser(response,match) {
	const [,uid]=match
	if (!/^[1-9]\d*$/.test(uid)) {
		response.writeHead(404)
		response.end('User not found')
		return
	}
	const user=new User(uid)
	if (!user.exists) {
		response.writeHead(404)
		response.end('User not found')
		return
	}
	return user
}

const server=http.createServer((request,response)=>{
	const path=url.parse(request.url).pathname
	let match
	if (path=='/') {
		respondHead(response,'index')
		response.write(`<h1>Index</h1>\n`)
		response.write(`<ul>\n`)
		response.write(`<li><a href=/user/>users</a>\n`)
		response.write(`</ul>\n`)
		respondTail(response)
	} else if (path=='/user/') {
		respondHead(response,'users')
		response.write(`<h1>Users</h1>\n`)
		response.write(`<table>\n`)
		response.write(`<tr><th>id<th>name<th>changesets<th>updated on\n`)
		fs.readdir('user',(err,filenames)=>{
			for (const uid of filenames) {
				const user=new User(uid)
				response.write(e.h`<tr><td><a href=${'/user/'+uid+'/'}>${uid}</a><td>${user.displayName}<td>${user.changesets.length}/${user.changesetsCount}<td>${user.updateTimestamp}\n`)
			}
			response.write(`</table>\n`)
			respondTail(response)
		})
	} else if (match=path.match(new RegExp('^/user/([^/]*)/$'))) {
		const user=matchUser(response,match)
		if (!user) return
		respondHead(response,'user '+user.displayName)
		reportUser(response,user,()=>{
			respondTail(response)
		})
	} else if (match=path.match(new RegExp('^/user/([^/]*)/keys/$'))) {
		const user=matchUser(response,match)
		if (!user) return
		respondHead(response,'keys of user '+user.displayName)
		reportUserKeys(response,user,()=>{
			respondTail(response)
		})
	} else if (match=path.match(new RegExp('^/user/([^/]*)/elements/$'))) {
		const user=matchUser(response,match)
		if (!user) return
		respondHead(response,'elements changed by user '+user.displayName)
		reportUserElements(response,user,()=>{
			respondTail(response)
		})
	} else if (match=path.match(new RegExp('^/user/([^/]*)/bbox.osm$'))) {
		const user=matchUser(response,match)
		if (!user) return
		respondBbox(response,user)
	} else if (match=path.match(new RegExp('^/user/([^/]*)/changes.osm$'))) {
		const user=matchUser(response,match)
		if (!user) return
		respondChanges(response,user)
	} else if (match=path.match(new RegExp('^/user/([^/]*)/deletions.osm$'))) {
		const user=matchUser(response,match)
		if (!user) return
		respondDeletions(response,user)
	} else {
		response.writeHead(404)
		response.end('Route not defined')
	}
}).listen(process.env.PORT||0).on('listening',()=>{
	if (!process.env.PORT) open('http://localhost:'+server.address().port)
})
