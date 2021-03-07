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
const bocaScoped=require('./boca-scoped')

/*
TODO maybe redirects from fetches to: request.headers.referer??'.'
element filters are the obstacle to path-based redirects: . and ..
sometimes need to replicate the filter in the redirect location, sometimes not
*/

const osmchaFilterTag=e.independentValuesEscape(value=>{
	if (!Array.isArray(value)) value=[value]
	return '['+value.map(singleValue=>{
		const cEscapedValue=String(singleValue).replace(/\\/g,'\\\\').replace(/"/g,'\\"')
		return `{"label":"${cEscapedValue}","value":"${cEscapedValue}"}`
	}).join(',')+']'
})

class Project {
	constructor(dirname) {
		this.dirname=dirname
		this.store=osm.readStore(this.storeFilename)
		this.user={}
		if (fs.existsSync(this.usersFilename)) this.user=JSON.parse(fs.readFileSync(this.usersFilename))
		this.changeset={}
		if (fs.existsSync(this.changesetsFilename)) this.changeset=JSON.parse(fs.readFileSync(this.changesetsFilename))
		this.scope={}
		if (fs.existsSync(this.scopesFilename)) {
			const text=String(fs.readFileSync(this.scopesFilename))
			let scope
			for (const line of text.split(/\r\n|\r|\n/)) {
				let match
				if (match=line.match(/^#+\s*(.*\S)\s*$/)) {
					[,scope]=match
					if (!(scope in this.scope)) this.scope[scope]=[]
				} else {
					this.scope[scope]?.push(line)
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
		// TODO
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
			if (cid in this.store.changeset) {
				yield [cid,this.store.changeset[cid]]
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
		for (const line of this.scope[scope]) {
			let match
			if (line.match(/^[1-9]\d*$/)) {
				cids.add(line)
			} else if (match=line.match(/changeset\/([1-9]\d*)$/)) {
				const [,cid]=match
				cids.add(cid)
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
}

class View {
	constructor(project) {
		this.project=project
	}
	serveMain(response) {
		this.writeHead(response)
		this.writeMain(response)
		this.writeTail(response)
	}
	serveByChangeset(response,insides) {
		this.writeHead(response)
		insides(response,this.project,this.getChangesets())
		this.writeTail(response)
	}
	serveByElement(response,insides,filters) {
		this.writeHead(response)
		insides(response,this.project,this.getChangesets(),filters)
		this.writeTail(response)
	}
	async serveFetchElements(response,insides,filters,redirectHref,errorMessage) {
		try {
			await insides(response,this.project,this.getChangesets(),filters)
		} catch (ex) {
			return respondFetchError(response,ex,'elements fetch error',errorMessage)
		}
		this.project.saveStore()
		response.writeHead(303,{'Location':redirectHref})
		response.end()
	}
	async serveRoute(response,route,passGetQuery,passPostQuery) {
		if (route=='') {
			this.serveMain(response)
		} else if (route=='elements') {
			this.serveByElement(response,bocaScoped.viewElements,passGetQuery())
		} else if (route=='counts') {
			this.serveByChangeset(response,bocaScoped.analyzeCounts)
		} else if (route=='formulas') {
			this.serveByChangeset(response,bocaScoped.analyzeFormulas)
		} else if (route=='keys') {
			this.serveByChangeset(response,bocaScoped.analyzeKeys)
		} else if (route=='deletes') {
			this.serveByChangeset(response,bocaScoped.analyzeDeletes)
		} else if (route=='cpcpe') {
			this.serveByChangeset(response,bocaScoped.analyzeChangesPerChangesetPerElement)
		} else if (route=='cpe') {
			this.serveByChangeset(response,bocaScoped.analyzeChangesPerElement)
		} else if (route=='fetch-previous') {
			const filters=await passPostQuery()
			await this.serveFetchElements(
				response,
				bocaScoped.fetchPreviousVersions,
				filters,
				'.',
				`<p>cannot fetch previous versions of elements\n`
			)
		} else if (route=='fetch-first') {
			const filters=await passPostQuery()
			await this.serveFetchElements(
				response,
				bocaScoped.fetchFirstVersions,
				filters,
				'deletes',
				`<p>cannot fetch first versions of elements\n`
			)
		} else if (route=='fetch-latest') {
			const filters=await passPostQuery()
			await this.serveFetchElements(
				response,
				bocaScoped.fetchLatestVersions,
				filters,
				'elements?'+querystring.stringify(filters),
				`<p>cannot fetch latest versions of elements\n`
			)
		} else if (route=='fetch-history') {
			const args=await passPostQuery()
			await serveFetchHistory(response,this.project,args.type,args.id)
		} else {
			return false
		}
		return true
	}
	writeHead(response) {
		respondHead(response,this.getTitle())
		this.writeHeading(response)
		response.write(`<nav><ul>\n`)
		response.write(`<li><a href=/>root</a>\n`)
		response.write(`<li><a href=.>main view</a>\n`)
		response.write(`<li><a href=elements>elements</a>\n`)
		response.write(`<li><a href=counts>element counts</a>\n`)
		response.write(`<li><a href=formulas>change formulas</a>\n`)
		response.write(`<li><a href=keys>changed keys</a>\n`)
		response.write(`<li><a href=deletes>deletion distributions</a>\n`)
		response.write(`<li><a href=cpcpe>changes per changeset per element</a>\n`)
		response.write(`<li><a href=cpe>changes per element</a>\n`)
		response.write(`</ul></nav>\n`)
	}
	writeTail(response) {
		response.write(`<hr/>\n`)
		response.write(`<form method=post action=fetch-previous>`)
		response.write(`<button type=submit>Fetch a batch of previous versions</button>`)
		response.write(`</form>\n`)
		respondTail(response)
	}
}

class AllView extends View {
	getChangesets() {
		return this.project.getAllChangesets()
	}
	getTitle() {
		return 'all changeset data'
	}
	writeHeading(response) {
		response.write(`<h1>All changeset data</h1>\n`)
	}
	writeMain(response) {
		// TODO write some summary of all changesets
	}
}

class ScopeView extends View {
	constructor(project,scope) {
		super(project)
		this.scope=scope
	}
	getChangesets() {
		return this.project.getScopeChangesets(this.scope)
	}
	getTitle() {
		return 'scope "'+this.scope+'"'
	}
	writeHeading(response) {
		response.write(e.h`<h1>Scope "${this.scope}"</h1>\n`)
	}
	writeMain(response) {
		const cids=[]
		for (const [cid,] of this.getChangesets()) cids.push(cid)
		const osmchaFilter=osmchaFilterTag`{"ids":${cids},"date__gte":${''}}`
		const osmchaHref=e.u`https://osmcha.org/?filters=${osmchaFilter}`
		response.write(e.h`<ul>\n`)
		response.write(e.h`<li>external tools: <a href=${osmchaHref}>osmcha</a></li>\n`)
		response.write(e.h`</ul>\n`)
		response.write(`<textarea>\n`)
		for (const line of this.project.scope[this.scope]) {
			response.write(e.h`${line}\n`)
		}
		response.write(`</textarea>`)
	}
}

class UserView extends View {
	constructor(project,user) {
		super(project)
		this.user=user
	}
	getChangesets() {
		return this.project.getUserChangesets(this.user)
	}
	getTitle() {
		return 'user '+this.user.displayName
	}
	writeHeading(response) {
		const osmHref=e.u`https://www.openstreetmap.org/user/${this.user.displayName}`
		response.write(e.h`<h1>User #${this.user.id} <a href=${osmHref}>${this.user.displayName}</a></h1>\n`)
	}
	writeMain(response) {
		const osmchaFilter=osmchaFilterTag`{"uids":${this.user.id},"date__gte":${''}}`
		const osmchaHref=e.u`https://osmcha.org/?filters=${osmchaFilter}`
		const hdycHref=e.u`http://hdyc.neis-one.org/?${this.user.displayName}`
		response.write(e.h`<ul>\n`)
		response.write(e.h`<li>last update was on ${Date(this.user.updateTimestamp)}\n`)
		response.write(e.h`<li>downloaded metadata of ${this.user.changesets.length}/${this.user.changesetsCount} changesets\n`)
		response.write(e.h`<li>external tools: <a href=${hdycHref}>hdyc</a> <a href=${osmchaHref}>osmcha</a></li>\n`)
		response.write(e.h`</ul>\n`)
		response.write(`<details><summary>copypaste for caser</summary><pre><code>`+
			`## ${this.user.displayName}\n`+
			`\n`+
			`* uid ${this.user.id}\n`+
			`* changesets count ${this.user.changesetsCount}\n`+
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
		for (let i=0;i<this.user.changesets.length;i++) {
			const changeset=this.project.changeset[this.user.changesets[i]]
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
			} else if (!(changeset.id in this.project.store.changeset)) {
				response.write(`☐`)
			} else {
				const nMissingChanges=changeset.changes_count-this.project.store.changeset[changeset.id].length
				if (nMissingChanges==0) {
					response.write(`☑`)
				} else {
					response.write(e.h`<span title=${nMissingChanges+' missing changes'}>☒</span>`)
				}
			}
			if (i>=this.user.changesets.length-1) {
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
	}
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
		} else if (match=path.match(new RegExp('^/all/([^/]*)$'))) {
			const [,subpath]=match
			const view=new AllView(project)
			if (await view.serveRoute(response,subpath,
				()=>querystring.parse(urlParse.query),
				()=>readPost(request)
			)) {
				// ok
			} else {
				response.writeHead(404)
				response.end(`All-downloaded-changesets route not defined`)
			}
		} else if (match=path.match(new RegExp('^/scope/([^/]*)/([^/]*)$'))) {
			const [,scope,subpath]=match
			if (!(scope in project.scope)) {
				response.writeHead(404)
				response.end(`Scope "${scope}" not found`)
				return
			}
			const view=new ScopeView(project,scope)
			if (await view.serveRoute(response,subpath,
				()=>querystring.parse(urlParse.query),
				()=>readPost(request)
			)) {
				// ok
			} else {
				response.writeHead(404)
				response.end(`Scope route not defined`)
			}
		} else if (match=path.match(new RegExp('^/user/([1-9]\\d*)/([^/]*)$'))) {
			const [,uid,subpath]=match
			if (!(uid in project.user)) {
				response.writeHead(404)
				response.end(`User #${uid} not found`)
				return
			}
			const user=project.user[uid]
			const view=new UserView(project,user)
			if (await view.serveRoute(response,subpath,
				()=>querystring.parse(urlParse.query),
				()=>readPost(request)
			)) {
				// ok
			} else if (subpath=='bbox.osm') {
				serveBbox(response,project,user)
			} else if (subpath=='fetch-metadata') {
				await serveFetchUserMetadata(response,project,user)
			} else if (subpath=='fetch-data') {
				await serveFetchUserData(response,project,user)
			} else {
				response.writeHead(404)
				response.end(`User route not defined`)
			}
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
	for (const scope in project.scope) {
		const href=e.u`/scope/${scope}/`
		response.write(e.h`<li><a href=${href}>${scope}</a>\n`)
	}
	response.write(`</ul>\n`)
	response.write(`<h3>Fetched users</h3>\n`)
	response.write(`<ul>\n`)
	for (const uid in project.user) {
		const href=e.u`/user/${uid}/`
		response.write(`<li>`+project.getUserLink(uid)+e.h` <a href=${href}>view</a>\n`)
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
	respondTail(response)
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
		return osm.topVersion(store.way[wayId])
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
			nodeVz[id]=osm.topVersion(store.node[id])
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

async function serveFetchHistory(response,project,etype,eid) {
	try {
		const timestamp=Date.now()
		await osm.fetchToStore(project.store,e.u`/api/0.6/${etype}/${eid}/history`)
		if (!project.store[etype][eid]) throw new Error(`Fetch completed but the element record is empty for ${etype} #${eid}`)
		project.store[etype][eid].top={
			timestamp,
			version:osm.topVersion(project.store[etype][eid])
		}
	} catch (ex) {
		return respondFetchError(response,ex,'element history fetch error',e.h`<p>cannot fetch element ${etype} #${eid} history\n`)
	}
	project.saveStore()
	response.writeHead(303,{'Location':e.u`cpe#${etype[0]+eid}`})
	response.end()
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
.create {background: #CFC}
.modify {background: #FFC}
.delete {background: #FCC}
section.element h3 {
	display: inline-block;
}
section.element table {
	border-collapse: collapse;
}
section.element td.target {
	border-left: solid 3px #004;
	border-right: solid 3px #004;
}
section.element tr:first-child td.target {
	border-top: solid 3px #004;
}
section.element tr:last-child td.target {
	border-bottom: solid 3px #004;
}
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

function mergeChangesets(changesets1,changesets2) {
	const changesetsSet=new Set()
	for (const id of changesets1) changesetsSet.add(id)
	for (const id of changesets2) changesetsSet.add(id)
	const changesets=[...changesetsSet]
	changesets.sort((x,y)=>(x-y))
	return changesets
}
