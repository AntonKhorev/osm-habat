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
		`ul { column-width:6em; list-style-type:none }`,
		`#map { height:50em }`,
		`</style>`,
		`</head>`,
		`<body>`,
	]) {
		response.write(line)
		response.write('\n')
	}
	const causes={}
	const effects={}
	response.write(`<h1>Changeset ${ref('changeset',changesetId)}</h1>\n`)
	if (!(changesetId in store.changes)) {
		response.write(req(`Causes and effects are unknown because changes not downloaded.`,`c${changesetId}`))
	} else {
		for (const [changetype,elementtype,id,version] of store.changes[changesetId]) {
			if (!(elementtype in causes)) causes[elementtype]={}
			if (!(changetype in causes[elementtype])) causes[elementtype][changetype]={}
			causes[elementtype][changetype][id]=version
		}
		response.write(`<h2>Causes</h2>\n`)
		for (const elementtype of ['node','way','relation']) {
			for (const changetype of ['create','modify','delete']) {
				let entries=[]
				if (elementtype in causes && changetype in causes[elementtype]) {
					entries=Object.entries(causes[elementtype][changetype])
				}
				response.write(`<details><summary>${elementtype} ${changetype} - ${entries.length} entries</summary>`)
				if (entries.length>0) {
					response.write(`<ul>`)
					for (const [id,version] of entries) {
						if (elementtype=='node' && changetype!='delete') {
							response.write(`<li data-elementtype=${elementtype} data-lat=${store.nodes[id][version].lat} data-lon=${store.nodes[id][version].lon}>`)
						} else {
							response.write(`<li>`)
						}
						response.write(`${ref(elementtype,id)}v${version}`)
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
		for (const [changetype,elementtype,id,version] of store.changes[changesetId]) {
			if (elementtype!='relation') continue
			let oldExistence='?'
			let newExistence='?'
			let addTags='?'
			let chgTags='?'
			let remTags='?'
			if (changetype=='create') {
				oldExistence='-'
				newExistence='+'
				chgTags=remTags=0
				if (id in store.relations && version in store.relations[id]) {
					addTags=Object.keys(store.relations[id][version].tags).length
				}
			} else if (changetype=='modify') {
				if (version==2) oldExistence='+' // otherwise undelete is possible
				newExistence='+'
			} else if (changetype=='delete') {
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
