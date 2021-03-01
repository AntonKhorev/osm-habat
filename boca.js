// bunch-of-changesets analyser

const fs=require('fs')
const path=require('path')
const http=require('http')
const url=require('url')
const querystring=require('querystring')
const open=require('open')
const expat=require('node-expat')

const e=require('./escape')
const osm=require('./osm')
const bocaAnalysis=require('./boca-analysis')

class Project {
	constructor(dirname) {
		this.dirname=dirname
		this.store=osm.readStore(this.storeFilename)
		this.user={}
		if (fs.existsSync(this.usersFilename)) this.user=JSON.parse(fs.readFileSync(this.usersFilename))
		this.changeset={}
		if (fs.existsSync(this.changesetsFilename)) this.changeset=JSON.parse(fs.readFileSync(this.changesetsFilename))
		this.scopes={}
		if (fs.existsSync(this.scopesFilename)) {
			const text=String(fs.readFileSync(this.scopesFilename))
			let scope
			for (const line of text.split(/\r\n|\r|\n/)) {
				let match
				if (match=line.match(/^#+\s*(.*\S)\s*$/)) {
					[,scope]=match
					if (!(scope in this.scopes)) this.scopes[scope]=[]
				} else {
					this.scopes[scope]?.push(line)
				}
			}
		}
	}
	saveStore() {
		osm.writeStore(this.storeFilename,this.store)
	}
	saveUsers() {
		fs.writeFileSync(this.usersFilename,JSON.stringify(this.user))
	}
	saveChangesets() {
		fs.writeFileSync(this.changesetsFilename,JSON.stringify(this.changeset))
	}
	saveScopes() {
		const savedata={...this.data}
		if (savedata.scope.length==0) delete savedata.scope
		fs.writeFileSync(this.projectFilename,JSON.stringify(savedata,null,2))
	}

	get storeFilename() { return path.join(this.dirname,'store.json') }
	get usersFilename() { return path.join(this.dirname,'users.json') }
	get changesetsFilename() { return path.join(this.dirname,'changesets.json') }
	get scopesFilename() { return path.join(this.dirname,'scopes.txt') }
	getUserLink(uid) {
		if (uid in this.user) {
			const href=e.u`https://www.openstreetmap.org/user/${this.user[uid].displayName}`
			return e.h`<a href=${href}>${uid} = ${this.user[uid].displayName}</a>`
		} else {
			const href=e.u`/uid?uid=${uid}`
			return e.h`<a href=${href}>${uid} = ?</a>`
		}
	}

	// changeset data/change iterators
	getAllChangesets() {
		return Object.entries(this.store.changeset)
	}
	*getUserChangesets(user) {
		for (const cid of user.changesets) {
			if (cid in project.store.changeset) {
				yield* project.store.changeset[cid]
			}
		}
	}
	*getScopeChangesets(scope) {
		const cids=new Set()
		/*
		for (const [scopeElementType,scopeElementId] of this.data.scope) {
			if (scopeElementType!="changeset") continue // TODO user
			cids[scopeElementId]=true
		}
		*/
		for (const line of this.scopes[scope]) {
			if (line.match(/^[1-9]\d*$/)) {
				cids.add(line)
			}
		}
		const sortedCids=[...cids]
		sortedCids.sort((x,y)=>(x-y))
		for (const cid of sortedCids) {
			if (cid in this.store.changeset) yield [cid,this.store.changeset[cid]]
		}
	}
	*getChangesFromChangesets(changesets) {
		for (const [,changesetChanges] of changesets) {
			yield* changesetChanges
		}
	}
	/*
	getAllChanges() {
		return this.getChangesFromChangesets(
			this.getAllChangesets()
		)
	}
	getUserChanges(user) {
		return this.getChangesFromChangesets(
			this.getUserChangesets(user)
		)
	}
	getScopeChanges(scope) {
		return this.getChangesFromChangesets(
			this.getScopeChangesets(scope)
		)
	}
	*/
}

if (process.argv[2]===undefined) {
	console.log('need to supply project directory')
	return process.exit(1)
}
main(process.argv[2])

function main(projectDirname) {
	const project=new Project(projectDirname)
	const server=http.createServer(async(request,response)=>{
		const urlParse=url.parse(request.url)
		const path=urlParse.pathname
		let match
		if (path=='/') {
			serveRoot(response,project)
		} else if (path=='/store') {
			serveStore(response,project.store)
		} else if (path=='/elements') {
			serveElements(response,project,querystring.parse(urlParse.query))
		} else if (path=='/uid') {
			serveUid(response,project,querystring.parse(urlParse.query).uid)
		} else if (match=path.match(new RegExp('^/undelete/w(\\d+)\\.osm$'))) { // currently for ways - TODO extend
			const [,id]=match
			await serveUndeleteWay(response,project,id)
		} else if (path=='/fetch-user') {
			const post=await readPost(request)
			await serveFetchUser(response,project,post.user)
		} else if (path=='/fetch-changeset') {
			const post=await readPost(request)
			await serveFetchChangeset(response,project,post.changeset)
		} else if (path=='/fetch-first') {
			const post=await readPost(request)
			await serveFetchFirstVersions(response,project,post)
		} else if (path=='/fetch-latest') {
			const post=await readPost(request)
			await serveFetchLatestVersions(response,project,post)
		} else if (match=path.match(new RegExp('^/all/([a-z]*)$'))) {
			const [,subpath]=match
			if (subpath=='') {
				serveAll(response,project)
			} else if (subpath=='count') {
				serveAll(response,project,bocaAnalysis.analyzeCount)
			} else {
				response.writeHead(404)
				response.end(`<em>All</em> route not defined`)
				return
			}
		} else if (match=path.match(new RegExp('^/user/([1-9]\\d*)/([a-z]*)$'))) {
			const [,uid,subpath]=match
			if (!(uid in project.user)) {
				response.writeHead(404)
				response.end(`User #${uid} not found`)
				return
			}
			if (subpath=='') {
				serveUser(response,project,user)
			} else {
				response.writeHead(404)
				response.end(`User #${uid} route not defined`)
				return
			}
		/*
		} else if (match=userPathMatch('')) {
			const user=matchUser(response,match)
			if (!user) return
			serveUser(response,project,user)
		} else if (match=userPathMatch('keys')) {
			const user=matchUser(response,match)
			if (!user) return
			serveUserKeys(response,project,user)
		} else if (match=userPathMatch('bbox.osm')) {
			const user=matchUser(response,match)
			if (!user) return
			serveBbox(response,project,user)
		} else if (match=userPathMatch('fetch-metadata')) {
			const user=matchUser(response,match)
			if (!user) return
			await serveFetchUserMetadata(response,project,user)
		} else if (match=userPathMatch('fetch-data')) {
			const user=matchUser(response,match)
			if (!user) return
			await serveFetchUserData(response,project,user)
		*/
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

function serveRoot(response,project) {
	respondHead(response,'habat-boca')
	response.write(`<h1>Bunch-of-changesets analyser</h1>\n`)
	response.write(`<h2>Views</h2>\n`)
	response.write(`<h3>All</h3>\n`)
	response.write(`<p><a href=/all/>All completely downloaded changesets.</a></p>\n`)
	response.write(`<h3>Scopes</h3>\n`)
	response.write(`<ul>\n`)
	for (const scope in project.scopes) {
		const href=e.u`/scope/${scope}/`
		response.write(e.h`<li><a href=${href}>${scope}</a>\n`)
	}
	response.write(`</ul>\n`)
	response.write(`<h3>Fetched users</h3>\n`)
	response.write(`<ul>\n`)
	for (const uid in project.users) {
		const href=e.u`/user/${uid}/`
		response.write(e.h`<li>${project.getUserLink(uid)} <a href=${href}>view</a>\n`)
	}
	response.write(`</ul>\n`)
	response.write(`<h3>Fetched data of changesets</h3>\n`)
	response.write(`<div>`)
	for (const cid in project.store.changeset) {
		response.write(e.h`${cid} `)
	}
	response.write(`</div>\n`)
	response.write(`<h2>Actions</h2>\n`)
	response.write(`<form method=post action=/fetch-user>\n`)
	response.write(`<label>User to fetch: <input type=text name=user></label>\n`)
	response.write(`<button type=submit>Fetch from OSM</button>\n`)
	response.write(`</form>\n`)
	response.write(`<form method=post action=/fetch-changeset>\n`)
	response.write(`<label>Changeset to fetch: <input type=text name=changeset></label>\n`)
	response.write(`<button type=submit>Fetch from OSM</button>\n`)
	response.write(`</form>\n`)
	response.write(`<p><a href=/store>view json store</a></p>\n`)

	/*
	response.write(`<h2>Deletion version distribution</h2>\n`)
	const deletedVersions={node:{},way:{},relation:{}}
	for (const [changeType,elementType,elementId,elementVersion] of project.getChanges()) {
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
			const href=`/elements?change=delete&type=${elementType}&version=${v+1}`
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
			const href=`/elements?change=delete&type=${elementType}&uid1=${uid}`
			response.write(e.h`<tr><td>`+project.getUserLink(uid)+pc(count)+`<td><a href=${href}>show</a>\n`)
		}
		if (unknownUidCount>0) {
			response.write(e.h`<tr><td>unknown`+pc(unknownUidCount)+`\n`)
		}
		response.write(`</table>\n`)
		if (unknownUidCount>0) {
			response.write(`<form method=post action=/fetch-first>\n`)
			response.write(e.h`<input type=hidden name=type value=${elementType}>\n`)
			response.write(`<input type=hidden name=change value=delete>\n`)
			response.write(`<button type=submit>Fetch a batch of first versions from OSM</button>\n`)
			response.write(`</form>\n`)
		}
	}
	*/

	respondTail(response)
}

function serveAll(response,project,insides) {
	respondHead(response,'all changeset data')
	response.write(`<nav><ul>\n`)
	response.write(`<li><a href=count>element counts</a>\n`)
	response.write(`</ul></nav>\n`)
	if (insides) {
		insides(response,project,project.getAllChangesets())
	} else {
		// TODO list changesets
	}
	respondTail(response)
}

function serveUser(response,project,user) {
	respondHead(response,'user '+user.displayName)
	const osmHref=e.u`https://www.openstreetmap.org/user/${user.displayName}`
	const osmchaHref=`https://osmcha.org/filters?filters=`+encodeURIComponent(`{"uids":[{"label":"${user.id}","value":"${user.id}"}],"date__gte":[{"label":"","value":""}]}`)
	const hdycHref=e.u`http://hdyc.neis-one.org/?${user.displayName}`
	response.write(e.h`<h1>User #${user.id} <a href=${osmHref}>${user.displayName}</a></h1>\n`)
	response.write(e.h`<ul>\n`)
	response.write(e.h`<li>last update was on ${Date(user.updateTimestamp)}\n`)
	response.write(e.h`<li>downloaded metadata of ${user.changesets.length}/${user.changesetsCount} changesets\n`)
	response.write(e.h`<li>external tools: <a href=${hdycHref}>hdyc</a> <a href=${osmchaHref}>osmcha</a></li>\n`)
	response.write(e.h`</ul>\n`)
	response.write(`<details><summary>copypaste for caser</summary><pre><code>`+
		`## ${user.displayName}\n`+
		`\n`+
		`* uid ${user.id}\n`+
		`* changesets count ${user.changesetsCount}\n`+
		`* dwg ticket `+
	`</code></pre></details>\n`)
	response.write(`<form method=post action=fetch-metadata>`)
	response.write(`<button type=submit>Update user and changesets metadata</button>`)
	response.write(`</form>\n`)
	response.write(`<form method=post action=fetch-data>`)
	response.write(`<button type=submit>Fetch a batch of changesets data</button> `)
	response.write(`</form>\n`)
	response.write(`<h2>Changesets</h2>\n`)
	response.write(`<details><summary>legend</summary>`+
		`<div>☐ changes not downloaded</div>\n`+
		`<div>☑ changes fully downloaded</div>\n`+
		`<div>☒ changes downloaded, some are missing probably due to redaction</div>\n`+
		`<div>○ empty changeset</div>\n`+
	`</details>\n`)
	let currentYear,currentMonth
	const editors={}
	const sources={}
	const changesetsWithComments=[]
	for (let i=0;i<user.changesets.length;i++) {
		const changeset=project.changeset[user.changesets[i]]
		const date=new Date(changeset.created_at)
		if (i==0) {
			response.write(e.h`<dl>\n<dt>${date} <dd>first known changeset`)
		}
		if (currentYear!=date.getFullYear() || currentMonth!=date.getMonth()) {
			currentYear=date.getFullYear()
			currentMonth=date.getMonth()
			response.write(e.h`\n<dt>${currentYear}-${String(currentMonth+1).padStart(2,'0')} <dd>`)
		}
		response.write(e.h` <a href=${'https://www.openstreetmap.org/changeset/'+changeset.id}>${changeset.id}</a>`)
		if (changeset.changes_count==0) {
			response.write(`○`)
		} else if (!(changeset.id in project.store.changeset)) {
			response.write(`☐`)
		} else {
			const nMissingChanges=changeset.changes_count-project.store.changeset[changeset.id].length
			if (nMissingChanges==0) {
				response.write(`☑`)
			} else {
				response.write(e.h`<span title=${nMissingChanges+' missing changes'}>☒</span>`)
			}
		}
		if (i>=user.changesets.length-1) {
			response.write(e.h`\n<dt>${date} <dd>last known changeset`)
			response.write(`\n</dl>\n`)
		}
		const inc=(group,item)=>{
			if (!(group in editors)) editors[group]={}
			if (!(item in editors[group])) editors[group][item]=0
			editors[group][item]++
		}
		if (/^iD\s/.test(changeset.tags.created_by)) {
			inc('iD',changeset.tags.created_by)
		} else {
			inc('(other)',changeset.tags.created_by??'(unknown)')
		}
		const source=changeset.tags.source??'(unknown)'
		sources[source]=(sources[source]??0)+1
		if (changeset.comments_count>0) changesetsWithComments.push(changeset.id)
	}
	response.write(`<h2>Editors</h2>\n`)
	response.write(`<dl>\n`)
	for (const [group,items] of Object.entries(editors)) {
		const sum=Object.values(items).reduce((x,y)=>x+y)
		response.write(e.h`<dt>${group} <dd>${sum} changesets`)
		for (const [item,count] of Object.entries(items)) {
			response.write(e.h` - <em>${item}</em> ${count}`)
		}
		response.write(`\n`)
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

	// change formulas TODO make fn
	const getChanges=function*(){ // TODO pass iterator to fn
		for (const cid of user.changesets) {
			if (cid in project.store.changeset) {
				yield* project.store.changeset[cid]
			}
		}
	}
	response.write(`<h2>Changes</h2>\n`)
	response.write(`<ul>\n`)
	response.write(`<li><a href=keys>changed keys</a>\n`)
	response.write(`</ul>\n`)
	const elementChanges={node:{},way:{},relation:{}}
	const elementVersions={node:{},way:{},relation:{}}
	for (const [changeType,elementType,elementId,elementVersion] of getChanges()) {
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

	respondTail(response)
}

function serveUserKeys(response,project,user) {
	respondHead(response,'key analysis of user '+user.displayName)
	const osmHref=e.u`https://www.openstreetmap.org/user/${user.displayName}`
	response.write(e.h`<h1>User #${user.id} <a href=${osmHref}>${user.displayName}</a></h1>\n`)
	const getChanges=function*(){ // TODO pass iterator to fn
		for (const cid of user.changesets) {
			if (cid in project.store.changeset) {
				yield* project.store.changeset[cid]
			}
		}
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
	const hitKeyChangeset=(a,k,cid)=>{
		if (a[k]===undefined) a[k]=new Set()
		a[k].add(cid)
	}
	const hitTag=(a,k,v)=>{
		if (a[k]===undefined) a[k]={}
		a[k][v]=(a[k][v]||0)+1
	}
	for (const [changeType,elementType,elementId,elementVersion] of getChanges()) {
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
	respondTail(response)

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

function serveBbox(response,project,user) {
	response.writeHead(200,{
		'Content-Type':'application/xml; charset=utf-8',
		'Content-Disposition':'attachment; filename="bbox.osm"',
	})
	response.write(`<?xml version="1.0" encoding="UTF-8"?>\n`)
	response.write(`<osm version="0.6" generator="osm-habat" download="never" upload="never">\n`)
	const csets=[]
	for (let i=0;i<user.changesets.length;i++) {
		const changeset=project.changeset[user.changesets[i]]
		if (changeset.min_lat && changeset.min_lon && changeset.max_lat && changeset.max_lon) {
			const k=csets.length*4
			response.write(e.x`  <node id="-${k+1}" lat="${changeset.min_lat}" lon="${changeset.min_lon}" />\n`)
			response.write(e.x`  <node id="-${k+2}" lat="${changeset.max_lat}" lon="${changeset.min_lon}" />\n`)
			response.write(e.x`  <node id="-${k+3}" lat="${changeset.max_lat}" lon="${changeset.max_lon}" />\n`)
			response.write(e.x`  <node id="-${k+4}" lat="${changeset.min_lat}" lon="${changeset.max_lon}" />\n`)
			csets.push(changeset.id)
		}
	}
	for (let i=0;i<csets.length;i++) {
		response.write(e.x`  <way id="-${i+1}">\n`)
		for (let j=0;j<=4;j++) {
			response.write(e.x`    <nd ref="-${i*4+1+j%4}" />\n`)
			response.write(e.x`    <tag k="url" v="https://www.openstreetmap.org/changeset/${csets[i]}" />\n`)
			const comment=project.changeset[csets[i]].tags.comment
			if (comment!==undefined) response.write(e.x`    <tag k="name" v="${comment}" />\n`)
		}
		response.write(e.x`  </way>\n`)
	}
	response.end(`</osm>\n`)
}

function serveStore(response,store) {
	response.writeHead(200,{'Content-Type':'application/json; charset=utf-8'})
	response.end(JSON.stringify(store))
}

function serveElements(response,project,filters) {
	respondHead(response,'browse elements')
	response.write(`<h1>Filtered elements list</h1>\n`)
	response.write(`<table>\n`)
	response.write(`<tr><th>enabled filter<th>value\n`)
	for (const [k,v] of Object.entries(filters)) {
		response.write(e.h`<tr><td>${k}<td>${v}\n`)
	}
	response.write(`</table>\n`)
	const filteredChangeList=filterChanges(project,filters)
	let first=true
	for (const [changeType,elementType,elementId,elementVersion] of filteredChangeList) {
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
			response.write(e.h`<td><a href=${`/undelete/w${elementId}.osm`}>undelete.osm</a>`)
		}
		response.write(`\n`)
	}
	if (first) {
		response.write(`<p>none found\n`)
	} else {
		response.write(`</table>\n`)
		response.write(`<form method=post action=/fetch-latest>\n`)
		for (const [k,v] of Object.entries(filters)) {
			response.write(e.h`<input type=hidden name=${k} value=${v}>\n`)
		}
		response.write(`<button type=submit>Fetch a batch of latest versions from OSM</button>\n`)
		response.write(`</form>`)
	}
	respondTail(response)
}

async function serveFetchUser(response,project,userString) {
	const addUserByName=async(userName)=>{
		const [changesets,uid]=await osm.fetchChangesetsToStore(project.changeset,e.u`/api/0.6/changesets?display_name=${userName}`)
		project.saveChangesets()
		await osm.fetchUserToStore(project.user,uid)
		project.user[uid].changesets=mergeChangesets(project.user[uid].changesets,changesets)
	}
	try {
		if (/^[1-9]\d*$/.test(userString)) {
			await osm.fetchUserToStore(project.user,userString)
		} else {
			const userUrl=new URL(userString)
			if (userUrl.host=='www.openstreetmap.org') {
				const [,userPathDir,userPathEnd]=userUrl.pathname.split('/')
				if (userPathDir=='user') {
					const userName=decodeURIComponent(userPathEnd)
					await addUserByName(userName)
				} else {
					throw new Error(`fetch user: invalid osm url path ${userUrl.pathname}`)
				}
			} else if (userUrl.host=='hdyc.neis-one.org') {
				const userName=decodeURIComponent(userUrl.search).substr(1)
				await addUserByName(userName)
			} else if (userUrl.host=='resultmaps.neis-one.org') {
				await osm.fetchUserToStore(project.user,userUrl.searchParams.get('uid'))
			} else {
				throw new Error(`fetch user: unrecognized host ${userUrl.host}`)
			}
		}
	} catch (ex) {
		return respondFetchError(response,ex,'user fetch error',e.h`<p>user fetch failed for input <code>${userString}</code>\n`)
	}
	project.saveUsers()
	response.writeHead(303,{'Location':'/'})
	response.end()
}

async function serveFetchUserMetadata(response,project,user) {
	try {
		await osm.fetchUserToStore(project.user,user.id)
		let timestamp
		while (user.changesetsCount-user.changesets.length>0) {
			let requestPath=e.u`/api/0.6/changesets?user=${user.id}`
			if (timestamp!==undefined) requestPath+=e.u`&time=2001-01-01,${timestamp}`
			const [changesets,,newTimestamp]=await osm.fetchChangesetsToStore(project.changeset,requestPath)
			user.changesets=mergeChangesets(user.changesets,changesets)
			timestamp=newTimestamp
			if (changesets.length==0) break
		}
	} catch (ex) {
		return respondFetchError(response,ex,'user fetch metadata error',e.h`<p>user fetch metadata failed for user #${user.id}\n`)
	}
	project.saveChangesets()
	project.saveUsers()
	response.writeHead(303,{'Location':'.'})
	response.end()
}

async function serveFetchUserData(response,project,user) {
	let nDownloads=0
	for (let i=0;i<user.changesets.length;i++) {
		if (nDownloads>=1000) break
		const changesetId=user.changesets[i]
		if (project.changeset[changesetId].changes_count==0) continue
		if (changesetId in project.store.changeset) continue
		try {
			await osm.fetchToStore(project.store,`/api/0.6/changeset/${changesetId}/download`)
		} catch (ex) {
			return respondFetchError(response,ex,'changeset request error',e.h`<p>cannot fetch changeset ${changesetId}\n`)
		}
		nDownloads++
	}
	if (nDownloads>0) project.saveStore()
	response.writeHead(303,{'Location':'.'})
	response.end()
}

async function serveUid(response,project,uid) {
	if (!(uid in project.user)) {
		try {
			await osm.fetchUserToStore(project.user,uid)
		} catch (ex) {
			return respondFetchError(response,ex,'user profile redirect error',`<p>redirect to user profile on osm website failed\n`)
		}
		project.saveUsers()
	}
	response.writeHead(301,{'Location':e.u`https://www.openstreetmap.org/user/${project.user[uid].displayName}`})
	response.end()
}

async function serveUndeleteWay(response,project,wayId) {
	const store=project.store
	const getLatestWayVersion=async(wayId)=>{
		// await osm.fetchToStore(store,`/api/0.6/way/${wayId}`) // deleted elements return 410 w/o version number
		await osm.multifetchToStore(store,[['way',wayId]])
		return getLatestElementVersion(store.way[wayId])
		// probably easier just to request full history
	}
	const getLatestVisibleWayVersion=async(wayId,wayVz)=>{
		let v=wayVz
		while (v>0 && !store.way[wayId][v].visible) {
			v--
			if (!(v in store.way[wayId])) {
				await osm.fetchToStore(store,`/api/0.6/way/${wayId}/${v}`)
				// again probably easier just to request full history
				// can estimate if such request is going to be heavy
			}
		}
		if (v<=0) throw new Error('visible element version not found')
		return v
	}
	const getLatestNodeVersions=async(wayId,wayVv)=>{
		const nodeVz={}
		for (const id of store.way[wayId][wayVv].nds) nodeVz[id]=-1
		await osm.multifetchToStore(store,
			Object.keys(nodeVz).map(id=>['node',id])
		)
		for (const id in nodeVz) {
			nodeVz[id]=getLatestElementVersion(store.node[id])
		}
		return nodeVz
	}
	const getLatestVisibleNodeVersions=async(wayId,wayVv,nodeVz)=>{
		const versionToCheck=(id,v)=>{
			let vc=v
			for (;vc>0;vc--) {
				if (!(vc in store.node[id])) break
				if (store.node[id][vc].visible) break
			}
			return vc
		}
		const nodeVv={}
		for (const [id,v] of Object.entries(nodeVz)) nodeVv[id]=v
		while (true) {
			const fetchList=[]
			for (const [id,v] of Object.entries(nodeVv)) {
				const vc=versionToCheck(id,v)
				nodeVv[id]=vc
				if (((vc in store.node[id]) && store.node[id][vc].visible) || vc<=0) continue
				fetchList.push(['node',id,vc])
			}
			if (fetchList.length==0) break
			await osm.multifetchToStore(store,fetchList)
		}
		for (const [id,v] of Object.entries(nodeVv)) {
			if (v<=0) throw new Error(`visible version of node ${id} not found`)
		}
		return nodeVv
	}
	const wayVz=await getLatestWayVersion(wayId)
	if (store.way[wayId][wayVz].visible) {
		response.writeHead(200,{'Content-Type':'application/xml; charset=utf-8'})
		response.write(`<?xml version="1.0" encoding="UTF-8"?>\n`)
		response.write(`<osm version="0.6" generator="osm-habat">\n`)
		// do nothing
		response.end(`</osm>\n`)
		return
	}
	const wayVv=await getLatestVisibleWayVersion(wayId,wayVz)
	const nodeVz=await getLatestNodeVersions(wayId,wayVv)
	const nodeVv=await getLatestVisibleNodeVersions(wayId,wayVv,nodeVz)
	response.writeHead(200,{'Content-Type':'application/xml; charset=utf-8'})
	response.write(`<?xml version="1.0" encoding="UTF-8"?>\n`)
	response.write(`<osm version="0.6" generator="osm-habat">\n`)
	const importantTags=(st,id,vv,vz)=>e.x`id="${id}" version="${vz}" changeset="${st[id][vz].changeset}" uid="${st[id][vz].uid}"`+(vv==vz?'':' action="modify"') // changeset and uid are required by josm to display element history
	for (const [id,vv] of Object.entries(nodeVv)) {
		const vz=nodeVz[id]
		response.write(`  <node `+importantTags(store.node,id,vv,vz)+e.x` lat="${store.node[id][vv].lat}" lon="${store.node[id][vv].lon}"`)
		let t=Object.entries(store.node[id][vv].tags)
		if (t.length<=0) {
			response.write(`/>\n`)
		} else {
			response.write(`>\n`)
			for (const [k,v] of t) response.write(e.x`    <tag k="${k}" v="${v}"/>\n`)
			response.write(`  </node>\n`)
		}
	}
	response.write(`  <way `+importantTags(store.way,wayId,wayVv,wayVz)+`>\n`)
	for (const id of store.way[wayId][wayVv].nds) {
		response.write(e.x`    <nd ref="${id}" />\n`)
	}
	for (const [k,v] of Object.entries(store.way[wayId][wayVv].tags)) {
		response.write(e.x`    <tag k="${k}" v="${v}"/>\n`)
	}
	response.write(`  </way>\n`)
	response.end(`</osm>\n`)
	// TODO save store if was modified
}

async function serveFetchChangeset(response,project,changesetId) {
	try {
		await osm.fetchToStore(project.store,`/api/0.6/changeset/${changesetId}/download`)
	} catch (ex) {
		return respondFetchError(response,ex,'changeset request error',e.h`<p>cannot fetch changeset ${changesetId}\n`)
	}
	project.saveStore()
	response.writeHead(303,{'Location':'/'})
	response.end()
}

async function serveFetchFirstVersions(response,project,filters) {
	const filteredChangeList=filterChanges(project,filters)
	const multifetchList=[]
	for (const [changeType,elementType,elementId,elementVersion] of filteredChangeList) {
		if (project.store[elementType][elementId]!==undefined && project.store[elementType][elementId][1]!==undefined) continue
		multifetchList.push([elementType,elementId,1])
		if (multifetchList.length>=10000) break
	}
	try {
		await osm.multifetchToStore(project.store,multifetchList)
	} catch (ex) {
		return respondFetchError(response,ex,'multifetch error',`<p>cannot fetch first versions of elements\n`)
	}
	project.saveStore()
	response.writeHead(303,{'Location':'/'})
	response.end()
}

async function serveFetchLatestVersions(response,project,filters) {
	const filteredChangeList=filterChanges(project,filters)
	const multifetchList=[]
	for (const [changeType,elementType,elementId,elementVersion] of filteredChangeList) {
		// TODO keep list of recently updated elements somewhere and check it - otherwise can't fetch more than a batch
		multifetchList.push([elementType,elementId])
		if (multifetchList.length>=10000) break
	}
	try {
		await osm.multifetchToStore(project.store,multifetchList)
	} catch (ex) {
		return respondFetchError(response,ex,'multifetch error',`<p>cannot fetch latest versions of elements\n`)
	}
	project.saveStore()
	response.writeHead(303,{'Location':'/elements?'+querystring.stringify(filters)})
	response.end()
}

function filterChanges(project,filters) {
	const filteredChangeList=[]
	for (const changeListEntry of project.getChanges()) {
		const [changeType,elementType,elementId,elementVersion]=changeListEntry
		if (filters.change && filters.change!=changeType) continue
		if (filters.type && filters.type!=elementType) continue
		if (filters.version && filters.version!=elementVersion) continue
		const elementStore=project.store[elementType][elementId]
		if (filters.uid1) {
			if (elementStore[1]===undefined) continue
			if (elementStore[1].uid!=filters.uid1) continue
		}
		filteredChangeList.push(changeListEntry)
	}
	return filteredChangeList
}

function respondHead(response,title,httpCode=200) {
	response.writeHead(httpCode,{'Content-Type':'text/html; charset=utf-8'})
	response.write(
e.h`<!DOCTYPE html>
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

function getLatestElementVersion(elementStore) {
	return Math.max(...(Object.keys(elementStore).map(v=>Number(v))))
}

function mergeChangesets(changesets1,changesets2) {
	const changesetsSet=new Set()
	for (const id of changesets1) changesetsSet.add(id)
	for (const id of changesets2) changesetsSet.add(id)
	const changesets=[...changesetsSet]
	changesets.sort((x,y)=>(x-y))
	return changesets
}
