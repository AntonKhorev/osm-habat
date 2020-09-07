// explore relations in changeset
// node relation2.js <osm path> <output html file> [<store file>]

const fs=require('fs')
const path=require('path')
const e=require('./escape')
const osm=require('./osm')

if (process.argv[2]===undefined || process.argv[3]===undefined) {
	console.log('invalid args')
	return process.exit(1)
}
main(process.argv[2],process.argv[3],process.argv[4])

function main(changesetUrl,outputFilename,storeFilename) {
	const changesetId=parseChangesetUrl(changesetUrl)
	if (storeFilename===undefined) {
		storeFilename=`c${changesetId}.json`
	}
	console.log(`exploring changeset ${changesetId}, using store file ${storeFilename}`)
	const store=osm.readStore(storeFilename)
	writeReport(changesetId,store,outputFilename)
}

function parseChangesetUrl(changesetUrl) {
	const url=new URL(changesetUrl)
	if (url.host=='www.openstreetmap.org') {
		const [,pathDir,pathEnd]=url.pathname.split('/')
		if (pathDir=='changeset') {
			const changesetId=Number(decodeURIComponent(pathEnd))
			return changesetId
		} else {
			console.log('invalid url format')
			return process.exit(1)
		}
	} else {
		console.log(`unrecognized host ${url.host}`)
		return process.exit(1)
	}
}

function writeReport(changesetId,store,outputFilename) {
	const response=fs.createWriteStream(outputFilename)
	const ref=(type,id)=>e.h`<a href=${'https://www.openstreetmap.org/'+type+'/'+id}>${id}</a>`
	const vref=(type,id,version)=>ref(type,id)+(version==1?'':'v'+version)
	const req=(msg,arg)=>e.h`<p class=req>${msg}<br /> Please run: <code>node download2.js ${arg}</code></p>`
	const title=`Changes in relations caused by changeset ${changesetId}`
	for (const line of [
		`<!DOCTYPE html>`,
		`<html lang=en>`,
		`<head>`,
		`<meta charset=utf-8>`,
		e.h`<title>${title}</title>`,
		`<link rel=stylesheet href=https://unpkg.com/leaflet@1.6.0/dist/leaflet.css>`,
		`<script src=https://unpkg.com/leaflet@1.6.0/dist/leaflet.js></script>`,
		`<style>`,
		`td { text-align:right }`,
		`ul { list-style-type:none; padding-left:0 }`,
		`li { display:inline-block; padding-left:1em }`,
		`#map { height:50em }`,
		`</style>`,
		`</head>`,
		`<body>`,
	]) {
		response.write(line)
		response.write('\n')
	}
	const causes={}
	const nodesCanAffectWays={}
	const nodesCanAffectRelations={}
	const waysCanAffectRelations={}
	const effects={}
	response.write(`<h1>Changeset ${ref('changeset',changesetId)}</h1>\n`)
	if (!(changesetId in store.changes)) {
		response.write(req(`Causes and effects are unknown because changes not downloaded.`,`c${changesetId}`))
	} else {
		const set=(setOfSets,id1,id2)=>{
			if (!(id1 in setOfSets)) setOfSets[id1]={}
			setOfSets[id1][id2]=true
		}
		for (const [changeType,elementType,id,version] of store.changes[changesetId]) {
			if (!(elementType in causes)) causes[elementType]={}
			if (!(changeType in causes[elementType])) causes[elementType][changeType]={}
			causes[elementType][changeType][id]=version
			if (elementType=='way') {
				for (const ndId of store.ways[id][version].nds) {
					set(nodesCanAffectWays,ndId,id)
				}
			} else if (elementType=='relation') {
				for (const [memberType,memberId] of store.relations[id][version].members) {
					if (memberType=='node') {
						set(nodesCanAffectRelations,memberId,id)
					} else if (memberType=='way') {
						set(waysCanAffectRelations,memberId,id)
					}
				}
			}
		}
		response.write(`<h2>Causes</h2>\n`)
		for (const elementType of ['node','way','relation']) {
			for (const changeType of ['create','modify','delete']) {
				let entries=[]
				if (elementType in causes && changeType in causes[elementType]) {
					entries=Object.entries(causes[elementType][changeType])
				}
				response.write(`<details><summary>${elementType} ${changeType} - ${entries.length} entries</summary>`)
				if (entries.length>0) {
					response.write(`<ul>`)
					for (const [id,version] of entries) {
						response.write(`<li>`)
						if (elementType=='node' && changeType!='delete') {
							const storeData=store.nodes[id][version]
							response.write(`<span data-element-type=${elementType} data-lat=${storeData.lat} data-lon=${storeData.lon}>`)
							response.write(vref(elementType,id,version))
							response.write(`</span>`)
						} else {
							response.write(vref(elementType,id,version))
						}
						if (elementType=='node' && changeType=='modify') {
							if (id in nodesCanAffectWays) {
								response.write(` w(${Object.keys(nodesCanAffectWays[id]).map(aid=>ref('way',aid)).join(', ')})?`)
							}
							if (id in nodesCanAffectRelations) {
								response.write(` r(${Object.keys(nodesCanAffectRelations[id]).map(aid=>ref('relation',aid)).join(', ')})?`)
							}
						}
						if (elementType=='way' && changeType=='modify') {
							if (id in waysCanAffectRelations) {
								response.write(` r(${Object.keys(waysCanAffectRelations[id]).map(aid=>ref('relation',aid)).join(', ')})?`)
							}
						}
					}
					response.write(`</ul>`)
				} else {
					response.write(`<p>none</p>`)
				}
				response.write(`</details>\n`)
			}
		}
		response.write(`<h2>Effects</h2>\n`)
		response.write(`<table>\n`)
		response.write(`<tr><th rowspan=2>relation<th rowspan=2>v<th colspan=2>existence<th colspan=3>tags<th colspan=2>members<th colspan=2>geometry\n`)
		response.write(`<tr><th>old<th>new<th>add<th>chg<th>rem<th>old<th>new<th>old<th>new\n`)
		for (const [changeType,elementType,id,version] of store.changes[changesetId]) {
			if (elementType!='relation') continue
			let oldExistence='?'
			let newExistence='?'
			let addTags='?'
			let chgTags='?'
			let remTags='?'
			if (changeType=='create') {
				oldExistence='-'
				newExistence='+'
				chgTags=remTags=0
				if (id in store.relations && version in store.relations[id]) {
					addTags=Object.keys(store.relations[id][version].tags).length
				}
			} else if (changeType=='modify') {
				if (version==2) oldExistence='+' // otherwise undelete is possible
				newExistence='+'
			} else if (changeType=='delete') {
				oldExistence='+'
				newExistence='-'
			}
			response.write(`<tr><td>${ref('relation',id)}<td>${version}<td>${oldExistence}<td>${newExistence}<td>${addTags}<td>${chgTags}<td>${remTags}<td>?<td>?<td>?<td>?\n`)
		}
		response.write(`</table>\n`)
	}
	response.write(`<script>\n`)
	response.write(fs.readFileSync(path.join(__dirname,'map.js')))
	response.write(`</script>\n`)
	response.write(`</body>\n`)
	response.write(`</html>\n`)
	response.end()
}
