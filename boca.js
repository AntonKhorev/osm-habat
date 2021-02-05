// bunch-of-changesets analyser

const http=require('http')
const url=require('url')
const querystring=require('querystring')
const open=require('open')
const expat=require('node-expat')

const e=require('./escape')
const osm=require('./osm')

if (process.argv[2]===undefined) {
	console.log('need to supply store filename')
	return process.exit(1)
}
main(process.argv[2])

function main(storeFilename) {
	const store=osm.readStore(storeFilename)
	const server=http.createServer(async(request,response)=>{
		const urlParse=url.parse(request.url)
		const path=urlParse.pathname
		if (path=='/') {
			serveRoot(response,store)
		} else if (path=='/store') {
			serveStore(response,store)
		} else if (path=='/elements') {
			serveElements(response,store,querystring.parse(urlParse.query))
		} else if (path=='/uid') {
			serveUid(response,store,querystring.parse(urlParse.query).uid)
		} else if (path=='/load-changeset') {
			const post=await readPost(request)
			await serveLoadChangeset(response,store,storeFilename,post.changeset)
		} else if (path=='/load-first-versions-of-deleted-elements') {
			const post=await readPost(request)
			await serveLoadFirstVersionsOfDeletedElements(response,store,storeFilename,post.type)
		} else {
			response.writeHead(404)
			response.end('Route not defined')
		}
	}).listen(process.env.PORT||0).on('listening',()=>{
		if (!process.env.PORT) open('http://localhost:'+server.address().port)
	})
}

async function readPost(request) {
	return new Promise((resolve,reject)=>{
		let body=''
		request.on('data',data=>{
			body+=data
			if (body.length>1e6) request.connection.destroy() // TODO reject with code 413
		}).on('end',()=>{
			resolve(querystring.parse(body))
		})
	})
}

function serveRoot(response,store) {
	respondHead(response,'habat-boca')
	response.write(`<h1>Bunch-of-changesets analyser</h1>\n`)
	response.write(`<h2>Actions</h2>\n`)
	response.write(`<form method=post action=/load-changeset>\n`)
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
			const href=`/elements?change=delete&type=${elementType}&version=${v+1}`
			response.write(e.h`<tr><td><a href=${href}>${v}</a><td>${versions.filter(x=>x==v).length}\n`)
		}
		response.write(`</table>\n`)
	}
	response.write(`<h2>Deletion first vesion user count</h2>\n`)
	for (const elementType of ['node','way','relation']) {
		response.write(e.h`<h3>for ${elementType} elements</h2>\n`)
		const elementTypeStore=store[elementType+'s']
		const uidCounts={}
		let unknownUidCount=0
		const deletedElementIds=Object.keys(deletedVersions[elementType])
		const totalCount=deletedElementIds.length
		let hasDeletions=false
		for (const elementId of deletedElementIds) {
			hasDeletions=true
			if (elementTypeStore[elementId]===undefined || elementTypeStore[elementId][1]===undefined) {
				unknownUidCount++
				continue
			}
			const uid=elementTypeStore[elementId][1].uid
			if (uidCounts[uid]===undefined) uidCounts[uid]=0
			uidCounts[uid]++
		}
		if (!hasDeletions) {
			response.write(`<p>no deletions\n`)
			continue
		}
		response.write(`<table>\n`)
		response.write(`<tr><th>uid<th>#<th>%\n`)
		const pc=count=>e.h`<td>${count}<td>${(count/totalCount*100).toFixed(2)}%`
		for (const [uid,count] of Object.entries(uidCounts)) {
			response.write(e.h`<tr><td><a href=${`/uid?uid=${uid}`}>${uid}</a>`+pc(count)+`\n`)
		}
		if (unknownUidCount>0) {
			response.write(e.h`<tr><td>unknown`+pc(unknownUidCount)+`\n`)
		}
		response.write(`</table>\n`)
		if (unknownUidCount>0) {
			response.write(`<form method=post action=/load-first-versions-of-deleted-elements>\n`)
			response.write(e.h`<input type=hidden name=type value=${elementType}>\n`)
			response.write(`<button type=submit>Load a batch of first versions from OSM</button>\n`)
			response.write(`</form>\n`)
		}
	}
	respondTail(response)
}

function serveStore(response,store) {
	response.writeHead(200,{'Content-Type':'application/json; charset=utf-8'})
	response.end(JSON.stringify(store))
}

function serveElements(response,store,filters) {
	respondHead(response,'habat-boca')
	response.write(`<h1>Filtered elements list</h1>\n`)
	let first=true
	for (const [changesetId,changeList] of Object.entries(store.changes)) { // TODO first accumulate all changes - or don't?
		for (const [changeType,elementType,elementId,elementVersion] of changeList) {
			if (filters.change && filters.change!=changeType) continue
			if (filters.type && filters.type!=elementType) continue
			if (filters.version && filters.version!=elementVersion) continue
			if (first) {
				first=false
				response.write(`<table>\n`)
				response.write(`<tr><th>element<th>osm<th><abbr title='overpass turbo before change'>ov-</abbr><th><abbr title='osm deep history'>odh</abbr>\n`)
			}
			response.write(`<tr>`)
			response.write(e.h`<td>${elementType[0]}${elementId}`)
			response.write(e.h`<td><a href=${'https://www.openstreetmap.org/'+elementType+'/'+elementId}>osm</a>`)
			const timestampString=new Date(store[elementType+'s'][elementId][elementVersion].timestamp-1000).toISOString()
			const query=`[date:"${timestampString}"];\n${elementType}(${elementId});\nout meta geom;`
			response.write(e.h`<td><a href=${'https://overpass-turbo.eu/map.html?Q='+encodeURIComponent(query)}>ov-</a>`)
			response.write(e.h`<td><a href=${'https://osmlab.github.io/osm-deep-history/#/'+elementType+'/'+elementId}>odh</a>`)
			response.write(`\n`)
		}
	}
	if (first) {
		response.write(`<p>none found\n`)
	} else {
		response.write(`</table>\n`)
	}
	respondTail(response)
}

async function serveUid(response,store,uid) {
	const getDisplayName=()=>new Promise((resolve,reject)=>osm.apiGet(`/api/0.6/user/${uid}`,res=>{
		if (res.statusCode!=200) reject(new Error(`failed user data fetch for uid ${uid}`))
		res.pipe(new expat.Parser().on('startElement',(name,attrs)=>{
			if (name=='user' && attrs.display_name!==undefined) {
				res.unpipe().destroy()
				resolve(attrs.display_name)
			}
		}).on('end',()=>reject(new Error(`couldn't find user's display name inside fetched data`))))
	}))
	let displayName
	try {
		displayName=await getDisplayName()
	} catch (ex) {
		return respondFetchError(response,ex,'user profile redirect error',`<p>redirect to user profile on osm website failed\n`)
	}
	response.writeHead(301,{'Location':e.u`https://www.openstreetmap.org/user/${displayName}`})
	response.end()
}

async function serveLoadChangeset(response,store,storeFilename,changesetId) {
	try {
		await osm.fetchToStore(store,`/api/0.6/changeset/${changesetId}/download`)
	} catch (ex) {
		return respondFetchError(response,ex,'changeset request error',e.h`<p>cannot load changeset ${changesetId}\n`)
	}
	osm.writeStore(storeFilename,store)
	response.writeHead(303,{'Location':'/'})
	response.end()
}

async function serveLoadFirstVersionsOfDeletedElements(response,store,storeFilename,requestedElementType) {
	const deletedElements={}
	for (const [changesetId,changeList] of Object.entries(store.changes)) {
		for (const [changeType,elementType,elementId,elementVersion] of changeList) {
			if (elementType!=requestedElementType) continue
			if (changeType=='delete') {
				deletedElements[elementId]=true
			} else {
				delete deletedElements[elementId]
			}
		}
	}
	const multifetchList=[]
	const elementTypeStore=store[requestedElementType+'s']
	for (const elementId of Object.keys(deletedElements)) {
		if (elementTypeStore[elementId]!==undefined && elementTypeStore[elementId][1]!==undefined) continue
		multifetchList.push([requestedElementType,elementId,1])
		if (multifetchList.length>=10000) break
	}
	try {
		await osm.multifetchToStore(store,multifetchList)
	} catch (ex) {
		return respondFetchError(response,ex,'multifetch error',`<p>cannot load elements\n`)
	}
	osm.writeStore(storeFilename,store)
	response.writeHead(303,{'Location':'/'})
	response.end()
}

function respondHead(response,title,httpCode=200) {
	response.writeHead(httpCode,{'Content-Type':'text/html; charset=utf-8'})
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

function respondFetchError(response,ex,pageTitle,pageBody) {
	respondHead(response,pageTitle,500)
	response.write(pageBody)
	response.write(e.h`<p>the error was <code>${ex.message}</code>\n`)
	response.write(`<p><a href=/>return to main page</a>\n`)
	respondTail(response)
}
