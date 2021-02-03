// bunch-of-changesets analyser

const http=require('http')
const url=require('url')
const querystring=require('querystring')
const open=require('open')

const e=require('./escape')
const osm=require('./osm')

if (process.argv[2]===undefined) {
	console.log('need to supply store filename')
	return process.exit(1)
}
main(process.argv[2])

function main(storeFilename) {
	const store=osm.readStore(storeFilename)
	const server=http.createServer((request,response)=>{
		const path=url.parse(request.url).pathname
		if (path=='/') {
			serveRoot(response,store)
		} else if (path=='/store') {
			serveStore(response,store)
		} else if (path=='/load') {
			let body=''
			request.on('data',data=>{
				body+=data
				if (body.length>1e6) request.connection.destroy()
			}).on('end',()=>{
				const post=querystring.parse(body)
				serveLoad(response,store,storeFilename,post.changeset)
			})
		} else {
			response.writeHead(404)
			response.end('Route not defined')
		}
	}).listen(process.env.PORT||0).on('listening',()=>{
		if (!process.env.PORT) open('http://localhost:'+server.address().port)
	})
}

function serveRoot(response,store) {
	respondHead(response,'habat-boca')
	response.write(`<h1>Bunch-of-changesets analyser</h1>\n`)
	response.write(`<h2>Actions</h2>\n`)
	response.write(`<form method=post action=/load>\n`)
	response.write(`<label>Changeset to load: <input type=text name=changeset></label>\n`)
	response.write(`<button type=submit>Load from OSM</button>\n`)
	response.write(`</form>\n`)
	response.write(`<p><a href=/store>view json store</a></p>\n`)
	response.write(`<h2>Changeset element counts</h2>\n`)
	response.write(`<table>\n`)
	response.write(`<tr><th rowspan=2>changeset<th colspan=3>nodes<th colspan=3>ways<th colspan=3>rels\n`)
	response.write(`<tr><th>C<th>M<th>D<th>C<th>M<th>D<th>C<th>M<th>D\n`)
	const cc=()=>({create:0,modify:0,delete:0})
	const globalChanges={node:{},way:{},relation:{}}
	for (const [changesetId,changeList] of Object.entries(store.changes)) {
		const count={node:cc(),way:cc(),relation:cc()}
		for (const [changeType,elementType,elementId] of changeList) {
			count[elementType][changeType]++
			globalChanges[elementType][elementId]=changeType
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
	response.write(`<h2>Deletion version distribution</h2>\n`)
	const deletedVersions={node:{},way:{},relation:{}}
	for (const [changesetId,changeList] of Object.entries(store.changes)) {
		for (const [changeType,elementType,elementId,elementVersion] of changeList) {
			if (changeType=='delete') {
				deletedVersions[elementType][elementId]=elementVersion-1
			} else {
				delete deletedVersions[elementType][elementId]
			}
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
		response.write(`<tr><th>V<th>#\n`)
		for (let v=1;v<=maxVersion;v++) {
			response.write(`<tr><td>${v}<td>${versions.filter(x=>x==v).length}\n`)
		}
		response.write(`</table>\n`)
	}
	respondTail(response)
}

function serveStore(response,store) {
	response.writeHead(200,{'Content-Type':'application/json; charset=utf-8'})
	response.end(JSON.stringify(store))
}

async function serveLoad(response,store,storeFilename,changesetId) {
	try {
		await downloadChangeset(store,changesetId)
	} catch {
		respondHead(response,'changeset request error') // TODO http error code
		response.write(e.h`<p>cannot load changeset ${changesetId}\n`)
		response.write(e.h`<p><a href=/>return to main page</a>\n`)
		respondTail(response)
		return
	}
	osm.writeStore(storeFilename,store)
	response.writeHead(301,{'Location':'/'})
	response.end()
}

function respondHead(response,title) {
	response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'})
	response.write(
`<!DOCTYPE html>
<html lang=en>
<head>
<meta charset=utf-8>
<title>${title}</title>
<style>
table td { text-align: right }
</style>
</head>
<body>
`
	)
}

function respondTail(response) {
	response.end(
`</body>
</html>`
	)
}

async function downloadChangeset(store,changesetId) {
	return new Promise((resolve,reject)=>osm.apiGet(`/api/0.6/changeset/${changesetId}/download`,res=>{
		if (res.statusCode!=200) reject()
		res.pipe(osm.makeParser(store).on('end',resolve))
	}))
}
