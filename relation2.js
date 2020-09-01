// explore relations in changeset
// node relation2.js <osm path> <output html file> [<store file>]

const fs=require('fs')
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
	const title=`Changes in relations caused by changeset ${changesetId}`
	for (const line of [
		`<!DOCTYPE html>`,
		`<html lang=en>`,
		`<head>`,
		`<meta charset=utf-8>`,
		e.h`<title>${title}</title>`,
		`</head>`,
		`<body>`,

	]) {
		response.write(line)
		response.write('\n')
	}
	response.write(`<h1>Changeset ${ref('changeset',changesetId)}</h1>\n`)
	if (!(changesetId in store.changes)) {
		response.write(`<p>Relation changes unknown because changes not downloaded.</p>\n`)
	} else {
		response.write(`<table>\n`)
		response.write(`<tr><th rowspan=2>relation<th colspan=2>existense<th colspan=2>tags<th colspan=2>members<th colspan=2>geometry\n`)
		response.write(`<tr><th>old<th>new<th>old<th>new<th>old<th>new<th>old<th>new\n`)
		for (const [changetype,elementtype,id,version] of store.changes[changesetId]) {
			if (elementtype!='relation') continue
			response.write(`<tr><td>${ref('relation',id)}<td>?<td>?<td>?<td>?<td>?<td>?<td>?<td>?\n`)
		}
		response.write(`</table>\n`)
	}
	for (const line of [
		`</body>`,
		`</html>`,
	]) {
		response.write(line)
		response.write('\n')
	}
	response.end()
}
