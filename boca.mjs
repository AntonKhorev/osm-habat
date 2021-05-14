// bunch-of-changesets analyser

import * as fs from 'fs'
import * as http from 'http'
import * as querystring from 'querystring'
import open from 'open'

import * as e from './escape.js'
import * as osm from './osm.js'
import * as osmLink from './osm-link.mjs'
import * as osmRef from './osm-ref.mjs'
import writeOsmFile from './osm-writer.mjs'
import Project from './boca-project.mjs'
import Redaction from './boca-redaction.mjs'
import * as respond from './boca-respond.mjs'
import * as views from './boca-view.mjs'
import {fetchTopVisibleVersions} from './boca-fetcher.mjs'

import * as bocaCommonCssPatch from './boca-common-css-patch.mjs'

if (process.argv[2]===undefined) {
	console.log('need to supply project directory')
	process.exit(1)
} else {
	main(process.argv[2])
}

function main(projectDirname) {
	const project=new Project(projectDirname)
	const server=http.createServer(async(request,response)=>{
		const [pathname,query]=request.url.split(/\?(.*)/)
		const queryParams=querystring.parse(query??'')
		let referer
		try {
			const url=new URL(request.headers.referer)
			if (request.headers.host==url.host) { // protect against forged referers
				referer=url.pathname+url.search
			}
		} catch {}
		const serveViewRoutes=async(view,subpath)=>(
			await view.serveRoute(response,subpath,queryParams,()=>readPost(request),referer)
		)
		let match
		if (pathname=='/') {
			serveRoot(response,project)
		} else if (pathname=='/store') {
			serveStore(response,project.store)
		} else if (pathname=='/uid') {
			serveUid(response,project,querystring.parse(query).uid)
		} else if (match=pathname.match(new RegExp('^/undelete/([nwr])(\\d+)\\.osm$'))) {
			const [,nwr,eid]=match
			const etype={
				n:'node',w:'way',r:'relation'
			}[nwr]
			await serveUndeleteElement(response,project,etype,eid)
		} else if (pathname=='/fetch-user') {
			const post=await readPost(request)
			await serveFetchUser(response,project,post.user,referer)
		} else if (pathname=='/fetch-changeset') {
			const post=await readPost(request)
			await serveFetchChangeset(response,project,post.changeset,referer)
		} else if (match=pathname.match(new RegExp('^/all/([^/]*)$'))) {
			const [,subpath]=match
			const view=new views.AllView(project)
			if (await serveViewRoutes(view,subpath)) {
				// ok
			} else {
				response.writeHead(404)
				response.end(`All-downloaded-changesets route not defined`)
			}
		} else if (match=pathname.match(new RegExp('^/scope/([^/]*)/([^/]*)$'))) {
			const [,scopeString,subpath]=match
			const scope=decodeURIComponent(scopeString)
			if (!(scope in project.scope)) {
				response.writeHead(404)
				response.end(`Scope "${scope}" not found`)
				return
			}
			const view=new views.ScopeView(project,scope)
			if (await serveViewRoutes(view,subpath)) {
				// ok
			} else {
				response.writeHead(404)
				response.end(`Scope route not defined`)
			}
		} else if (match=pathname.match(new RegExp('^/user/([1-9]\\d*)/([^/]*)$'))) {
			const [,uid,subpath]=match
			if (!(uid in project.user)) {
				response.writeHead(404)
				response.end(`User #${uid} not found`)
				return
			}
			const user=project.user[uid]
			const view=new views.UserView(project,user)
			if (await serveViewRoutes(view,subpath)) {
				// ok
			} else if (subpath=='bbox.osm') {
				serveBbox(response,project,user)
			} else if (subpath=='bbox-noscope.osm') {
				serveBbox(response,project,user,true)
			} else if (subpath=='fetch-metadata') {
				await serveFetchUserMetadata(response,project,user,referer)
			} else if (subpath=='fetch-data') {
				await serveFetchUserData(response,project,user,referer)
			} else {
				response.writeHead(404)
				response.end(`User route not defined`)
			}
		} else if (match=pathname.match(new RegExp('^/changeset/([1-9]\\d*)/([^/]*)$'))) {
			const [,cid,subpath]=match
			if (!project.store.changeset[cid]) {
				response.writeHead(404)
				response.end(`Changeset #${cid} not found`)
				return
			}
			const view=new views.ChangesetView(project,cid)
			if (await serveViewRoutes(view,subpath)) {
				// ok
			} else if (subpath=='map') {
				serveChangeset(response,project,cid)
			} else {
				response.writeHead(404)
				response.end(`Changeset route not defined`)
			}
		} else if (match=pathname.match(new RegExp('^/siblings/([1-9]\\d*)/([1-9]\\d*)/([^/]*)$'))) {
			const [,eid,cid,subpath]=match

			if (!project.store.changeset[cid]) {
				try {
					await osm.fetchToStore(project.store,`/api/0.6/changeset/${cid}/download`)
				} catch (ex) {
					return respond.fetchError(response,ex,'route prefetch error',e.h`<p>route prefetch failed\n`)
				}
				project.saveStore()
			}
			if (!project.store.changeset[cid]) {
				response.writeHead(404)
				response.end(`Changeset #${cid} not found`)
				return
			}
			if (!project.store.way[eid]) {
				response.writeHead(404)
				response.end(`Way #${eid} not found`)
				return
			}
			const view=new views.SiblingsView(project,Number(eid),Number(cid))
			if (await serveViewRoutes(view,subpath)) {
				// ok
			} else {
				response.writeHead(404)
				response.end(`Siblings route not defined`)
			}
		} else if (pathname=='/redactions/') {
			let redactionChangeset
			try {
				if (queryParams.redaction_changeset!=null) {
					redactionChangeset=osmRef.changeset(queryParams.redaction_changeset)
				}
			} catch (ex) {
				response.writeHead(404)
				response.end(`Error providing redaction changeset: <code>${ex.message}</code>`)
				return
			}
			serveRedactions(response,project,redactionChangeset)
		} else if (pathname=='/redactions/download') {
			response.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'})
			response.end(project.pendingRedactions.marshall())
		} else if (pathname=='/redactions/reset-loaded') {
			const post=await readPost(request)
			if (post.confirm) {
				project.pendingRedactions.loaded={node:{},way:{},relation:{}}
				project.savePendingRedactions()
				response.writeHead(303,{'Location':'.'})
				response.end()
			} else {
				response.writeHead(404)
				response.end('Need to confirm redaction clearing')
			}
		} else if (pathname=='/redactions/clear') {
			const post=await readPost(request)
			if (post.confirm) {
				project.backupAndClearPendingRedactions()
				response.writeHead(303,{'Location':'.'})
				response.end()
			} else {
				response.writeHead(404)
				response.end('Need to confirm redaction clearing')
			}
		} else if (pathname=='/redactions/add-element') {
			const post=await readPost(request)
			try {
				const [etype,eid]=osmRef.element(post.element)
				// have to fetch element - otherwise can't present it in elementary views
				await osm.fetchToStore(project.store,e.u`/api/0.6/${etype}/${eid}/history`,true)
				if (!project.store[etype][eid]) throw new Error(`Fetch completed but the element record is empty for ${etype} #${eid}`)
				project.saveStore()
				project.pendingRedactions.addExtraElement(etype,eid)
				project.savePendingRedactions()
				response.writeHead(303,{'Location':'.'})
				response.end()
			} catch (ex) {
				response.writeHead(404)
				response.end(`Error adding extra element to pending redactions: <code>${ex.message}</code>`)
			}
		} else if (pathname=='/redactions/remove-element') {
			const post=await readPost(request)
			try {
				project.pendingRedactions.removeExtraElement(post.type,post.id)
				project.savePendingRedactions()
				response.writeHead(303,{'Location':'.'})
				response.end()
			} catch (ex) {
				response.writeHead(404)
				response.end(`Error removing extra element from pending redactions: <code>${ex.message}</code>`)
			}
		} else if (pathname=='/redactions/update-target-tags') {
			const post=await readPost(request)
			try {
				if (!post.tags) throw new Error('no tags provided')
				project.pendingRedactions.targets={}
				for (const tag of post.tags.split(/\r\n|\r|\n/)) {
					if (tag=='') continue
					project.pendingRedactions.targets[tag]=1
				}
				project.savePendingRedactions()
				response.writeHead(303,{'Location':'.'})
				response.end()
			} catch (ex) {
				response.writeHead(404)
				response.end(`Error updating target tags in pending redactions: <code>${ex.message}</code>`)
			}
		} else if (pathname=='/redactions/status') {
			response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'})
			views.writeRedactionsStatus(response,project)
			response.end()
		} else if (match=pathname.match(new RegExp('^/redactions/extra/([^/]*)$'))) {
			const [,subpath]=match
			const view=new views.RedactionsExtraElementsView(project)
			if (await serveViewRoutes(view,subpath)) {
				// ok
			} else {
				response.writeHead(404)
				response.end(`Redactions extra elements route not defined`)
			}
		} else if (pathname=='/boca-common.js') {
			servePatchedJsFile(response,pathname,'/boca-common-patch.mjs')
		} else if (pathname=='/boca-map.js') {
			serveStaticFile(response,pathname,'text/javascript; charset=utf-8')
		} else if (pathname=='/boca-common.css') {
			servePatchedCssFile(response,pathname,bocaCommonCssPatch)
		} else if (pathname=='/favicon.ico') {
			serveStaticFile(response,pathname,'image/x-icon')
		} else {
			response.writeHead(404)
			response.end('Route not defined')
		}
	}).listen(process.env.PORT||0).on('listening',()=>{
		if (!process.env.PORT) open('http://localhost:'+server.address().port)
	})
}

function serveStaticFile(response,pathname,contentType) {
	fs.readFile(new URL('.'+pathname,import.meta.url),(err,data)=>{
		response.writeHead(200,{
			'Content-Type':contentType,
			'Cache-Control':'public, max-age=604800, immutable',
		})
		response.end(data)
	})
}

function servePatchedJsFile(response,pathname,patchPathname) {
	const contentType='text/javascript; charset=utf-8'
	fs.readFile(new URL('.'+pathname,import.meta.url),(err,data)=>{
		fs.readFile(new URL('.'+patchPathname,import.meta.url),(err,patchData)=>{
			response.writeHead(200,{
				'Content-Type':contentType,
				'Cache-Control':'public, max-age=604800, immutable',
			})
			response.write(data)
			response.write(`\n// patch from ${patchPathname}\n`)
			response.write(
				String(patchData).replace(/^export\s+/gm,'')
			)
			response.end()
		})
	})
}

function servePatchedCssFile(response,pathname,patchModule) {
	const contentType='text/css; charset=utf-8'
	fs.readFile(new URL('.'+pathname,import.meta.url),(err,data)=>{
		response.writeHead(200,{
			'Content-Type':contentType,
			'Cache-Control':'public, max-age=604800, immutable',
		})
		response.end(
			String(data).replace(/\${(.*?)}/g,(_,s)=>patchModule[s])
		)
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
	respond.head(response,'habat-boca')
	response.write(`<h1>Bunch-of-changesets analyser</h1>\n`)
	response.write(`<h2>Views</h2>\n`)
	response.write(`<h3>All</h3>\n`)
	response.write(`<p><a href=/all/>All completely downloaded changesets.</a></p>\n`)
	response.write(`<h3 id=section-scopes>Scopes</h3>\n`)
	response.write(`<ul>\n`)
	let hasScopes=false
	for (const scope in project.scope) {
		hasScopes=true
		const href=e.u`/scope/${scope}/`
		response.write(e.h`<li><a href=${href}>${scope}</a>\n`)
	}
	response.write(`</ul>\n`)
	response.write(`<p>`)
	if (!hasScopes) response.write(`None defined yet. `)
	response.write(`Define scopes by creating/editing <kbd>scopes.txt</kbd> file in the project directory.\n`)
	response.write(`<h3 id=section-users>Fetched users</h3>\n`)
	response.write(`<ul>\n`)
	for (const uid in project.user) {
		const href=e.u`/user/${uid}/`
		response.write(`<li>`+project.getUserLink(uid)+e.h` <a href=${href}>view</a>\n`)
	}
	response.write(`</ul>\n`)
	response.write(`<h3>Fetched data of changesets</h3>\n`)
	response.write(`<div>`)
	for (const cid in project.store.changeset) {
		const href=e.u`/changeset/${cid}/`
		response.write(e.h`<a href=${href}>${cid}</a> `)
	}
	response.write(`</div>\n`)
	response.write(`<h2>Fetches</h2>\n`)
	response.write(`<form class=real method=post action=/fetch-user>\n`)
	response.write(`<label>User to fetch: <input id=input-user type=text name=user></label>\n`)
	response.write(`<button>Fetch from OSM</button>\n`)
	response.write(`</form>\n`)
	response.write(`<form class=real method=post action=/fetch-changeset>\n`)
	response.write(`<label>Changeset to fetch: <input type=text name=changeset></label>\n`)
	response.write(`<button>Fetch from OSM</button>\n`)
	response.write(`</form>\n`)
	response.write(`<h2>Redactions</h2>\n`)
	response.write(`<p><a href=/redactions/>view/configure pending redactions</a></p>\n`)
	response.write(`<details>
<summary>How to do a redaction</summary>
<p>This is a recipe to redact specific tags added or changed by a user when you're ready to process all of the chagesets in one go.
	If there's too much data, you'll need to group the chagesets into <a href=#section-scopes>scopes</a> before editing.
<ol>
<li>Go to the <a href=redactions/>pending redactions page</a>.
<li>In the <a href=redactions/#section-config>config section</a> specify the tags you want to redact (target tags).
	You are unlikely to do this correctly without looking at the edits first so actually you'll do this later.
	You don't have to specify any tags to do redactions, it's just for tag highlighting and keyboard controls.
	You'll want those if you have to deal with thousands of elements.
<li>Back on the main page fetch a user by pasting user's OSM profile URL into <a href=#input-user>User to fetch</a> input.
<li>Go to user page in <a href=#section-users>Views / Fetched users<a> above.
<li>Press <em>Update user and changesets metadata</em> button to download all changeset metadata (changeset ids, comments, bboxes, editor/imagery tags).
<li>Press <em>Fetch a batch of changesets data</em> to download some changeset data.
	You may need to repeat this until you see ☑ after each changeset in the changesets list.
	This may take a while that's why long downloads are split into several steps.
	It may be useful to watch the server console to see what's being downloaded at the moment.
<li>Open <em>changes per element</em> subpage.
	If there's too much stuff you may want to set up a filter first.
	You're not able yet to see the changes because downloaded data contains only the user's versions of elements but not what they've been before.
<li>Scroll to the end of the page and press <em>Fetch a batch of previous versions</em>.
	After that you'll be able to see the changes on tags.
	You still don't know if you need to submit any changes to the data because current versions of elements are not downloaded.
	To do a proper redaction you also need all versions between the user's one and the current one.
<li>Scroll to the end of the page and press <em>Fetch a batch of subsequent versions</em>.
	Now you have all of the data to make redactions.
	However you still don't have the data to see the ways/relations, which we'll ignore for now.
<li>Look at the changes on elements. Now you probably want to change the target tags.
<li>TBD actual editing, submit changes to osm
<li>TBD get redaction file, use osm-revert-scripts (need moderator flag - or send the file to someone who has the flag), save redaction file to redactions subdirectory of project directory
</ol>
</details>
`)
	response.write(`<h2>Extras</h2>\n`)
	response.write(`<p><a href=/store>view json store</a></p>\n`)
	respond.tail(response)
}

async function serveRedactions(response,project,redactionChangeset) {
	respond.head(response,'redactions')
	response.write(`<h1>Pending redactions</h1>\n`)
	response.write(`<nav><p><a href=/>return to root</a></nav>`)
	response.write(`<h2>Pending element edits</h2>\n`)
	response.write(e.h`<textarea readonly>${project.pendingRedactions.marshall()}</textarea>\n`)
	response.write(`<div><a href=download>download redactions file</a></div>\n`)
	let versionCount=0
	const elementTypeVisited={
		node:{},
		way:{},
		relation:{},
	}
	const tagCounts={}
	if (!project.pendingRedactions.isEmpty()) {
		let minTimestamp=+Infinity
		let maxTimestamp=-Infinity
		response.write(`<details>\n`)
		response.write(`<summary>Pending edits with timestamps</summary>\n`)
		response.write(`<table>\n`)
		response.write(`<tr><th>element<th>attribute<th>time\n`)
		for (const [attribute,etype,eid,evtag,timestamp] of project.pendingRedactions.list()) {
			if (timestamp<minTimestamp) minTimestamp=timestamp
			if (timestamp>maxTimestamp) maxTimestamp=timestamp
			response.write(`<tr><td>`+osmLink.element(etype,eid).at(`${etype} #${eid}`)+`<td>`)
			if (attribute=='version') {
				versionCount++
				if (!elementTypeVisited[etype][eid]) elementTypeVisited[etype][eid]=1
				if (evtag==project.store[etype][eid].top.version) elementTypeVisited[etype][eid]=2
				response.write(e.h`v${evtag}`)
			} else if (attribute=='tag') {
				if (!tagCounts[evtag]) tagCounts[evtag]=0
				tagCounts[evtag]++
				const values=new Set()
				for (const ev of osm.allVersions(project.store[etype][eid])) {
					const value=project.store[etype][eid][ev].tags[evtag]
					if (value!=null) values.add(value)
				}
				if (values.size==0) {
					response.write(e.h`${evtag} (value unknown)`)
				} else {
					response.write(e.h`${evtag} = ${[...values].join(';')}`)
				}
			}
			response.write(e.h`<td><time>${new Date(timestamp)}</time>\n`)
		}
		response.write(`</table>\n`)
		response.write(`</details>\n`)
		response.write(`<table>\n`)
		response.write(e.h`<tr><th>earliest entry<td>${new Date(minTimestamp)}\n`)
		response.write(e.h`<tr><th>latest entry<td>${new Date(maxTimestamp)}\n`)
		response.write(`</table>\n`)
	}
	response.write(`<h2>Extra elements</h2>\n`)
	response.write(`<form class=real method=post action=add-element>\n`)
	response.write(`<label>OSM URL of element: <input type=text name=element></label>\n`)
	response.write(`<button>Add extra element to redaction</button>\n`)
	response.write(`</form>\n`)
	response.write(`<table>\n`)
	response.write(`<tr><th>extra element\n`)
	for (const [etype,eid] of project.pendingRedactions.extra) {
		response.write(`<tr><td>`+osmLink.element(etype,eid).at(`${etype} #${eid}`)+`<td>`)
		response.write(`<form method=post action=remove-element>`)
		response.write(`<input type=hidden name=type value=${etype}>`)
		response.write(`<input type=hidden name=id value=${eid}>`)
		response.write(`<button>Remove</button>`)
		response.write(`</form>`)
	}
	response.write(`</table>\n`)
	response.write(`<div><a href=extra/cpe>view changes on extra elements</a></div>\n`)
	response.write(`<h2>Remote control loaded state</h2>\n`)
	response.write(`<ul>\n`)
	for (const etype of ['node','way','relation']) {
		response.write(`<li>${Object.keys(project.pendingRedactions.loaded[etype]).length} ${etype}s are assumed to be loaded\n`)
	}
	response.write(`</ul>\n`)
	response.write(`<form class=real method=post action=reset-loaded>\n`)
	response.write(`<div><label><input type=checkbox name=confirm> Yes, I want to reset loaded element state.</label></div>\n`)
	response.write(`<div><button>Reset loaded state</button></div>\n`)
	response.write(`</form>\n`)
	const getNonTopEids=()=>{
		let result=''
		for (const etype of ['node','way','relation']) {
			for (const [eid,v] of Object.entries(elementTypeVisited[etype])) {
				if (v==1) result+=','+etype[0]+eid
			}
		}
		return result
	}
	const hiddenHref=e.u`http://127.0.0.1:8111/zoom?left=0&right=0&top=0&bottom=0&select=currentselection${getNonTopEids()}`
	response.write(`<div><a class=rc href=${hiddenHref}>rc add to selection redacted elements w/o top version redaction</a> - because you can't see them with josm <kbd>modified</kbd> search</div>\n`)
	response.write(`<h2>Common <a href="https://www.openstreetmap.org/redactions">published redactions</a> and <a href="https://wiki.openstreetmap.org/wiki/Revert_scripts">osm-revert-scripts</a> commands to execute them</h2>\n`)
	response.write(`<dl>\n`)
	for (const [id,name] of [
		[170,'Data copied from unspecified other maps'],
		[172,'Privacy concerns'],
	]) {
		const href=e.u`https://www.openstreetmap.org/redactions/${id}`
		response.write(e.h`<dt><a href=${href}>${name}</a>\n`)
		response.write(e.h`<dd><kbd>perl batch_redaction.pl apply </kbd><em>filename</em><kbd> ${id}</kbd>\n`)
	}
	response.write(`</dl>\n`)
	response.write(`<h2>Report for <a href="https://wiki.openstreetmap.org/wiki/Data_working_group/Large_Revert_Log">revert log</a></h2>\n`)
	const pad=n=>n.toString().padStart(2,'0')
	const formatDate=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`
	const sum=(a)=>a.reduce((x,y)=>x+y)
	const totalElementCount=()=>sum(
		['node','way','relation'].map(
			etype=>Object.keys(elementTypeVisited[etype]).length
		)
	)
	const reportTags=()=>Object.entries(tagCounts).map(([tag,count])=>`${count} ${tag} tag${count>1?'s':''}`).join(', ')
	if (redactionChangeset!=null && !project.changeset[redactionChangeset]) {
		try {
			await osm.fetchChangesetsToStore(project.changeset,e.u`/api/0.6/changeset/${redactionChangeset}`)
		} catch (ex) {}
		project.saveChangesets()
	}
	const csetMeta=project.changeset[redactionChangeset]
	const reportTicketNumber=()=>{
		const comment=csetMeta?.tags?.comment
		if (comment==null) return '{ticket number}'
		const match=comment.match(/Ticket#(\d+)/i)
		if (!match) return '{ticket number}'
		const [,ticket]=match
		return ticket
	}
	const reportArea=()=>{
		const result=[]
		for (const k of ['min_lat','min_lon','max_lat','max_lon']) {
			const v=csetMeta?.[k]
			if (v==null) return '{copy from changeset}'
			result.push(k+'='+v)
		}
		return result.join(' ')
	}
	const wikiTableRow=`|-\n`+
		`| ${formatDate(csetMeta ? new Date(csetMeta.closed_at) : new Date())}\n`+
		`| ${versionCount} versions of ${totalElementCount()} elements\n`+
		`| {region name}\n`+
		`| `+
			`Reason: data from incompatible sources. `+
			`Result: removed or reverted changes to ${reportTags()} (numbers are approximate, other changes are possible). `+
			`Area: ${reportArea()}\n`+
		`| ${reportTicketNumber()}\n`+
		`| ${csetMeta?.user??'{name}'}\n`
	response.write(e.h`<textarea disabled>${wikiTableRow}</textarea>\n`)
	response.write(`<form class=real action=.>\n`)
	response.write(`<label>Redaction changeset: <input type=text name=redaction_changeset></label>\n`)
	response.write(`<button>Add details to report from changeset metadata</button>\n`)
	response.write(`</form>\n`)
	response.write(`<h2 id=section-config>Config</h2>\n`)
	response.write(`<form class='real with-examples' method=post action=update-target-tags>\n`)
	response.write(`<details><summary>Target tags syntax</summary>\n`)
	response.write(Redaction.targetsSyntaxDescription)
	response.write(`</details>\n`)
	response.write(`<div><label>target tags:\n`)
	response.write(e.h`<textarea name=tags>${
		Object.keys(project.pendingRedactions.targets).join('\n')
	}</textarea>\n`)
	response.write(`</label></div>\n`)
	response.write(`<div><button>Update target tags</button></div>\n`)
	response.write(`</form>\n`)
	response.write(`<form class=real method=post action=clear>\n`)
	response.write(`<div><label><input type=checkbox name=confirm> Yes, I want to clear pending redactions.</label></div>\n`)
	response.write(`<div><button>Clear pending redactions</button></div>\n`)
	response.write(`</form>\n`)
	respond.tail(response)
}

function serveBbox(response,project,user,noscope=false) {
	response.writeHead(200,{
		'Content-Type':'application/xml; charset=utf-8',
		'Content-Disposition':'attachment; filename="bbox.osm"',
	})
	response.write(`<?xml version="1.0" encoding="UTF-8"?>\n`)
	response.write(`<osm version="0.6" generator="osm-habat" download="never" upload="never">\n`)
	const skipCids=new Set()
	if (noscope) {
		for (const scope in project.scope) {
			for (const [cid] of project.getScopeChangesets(scope)) {
				skipCids.add(cid)
			}
		}
	}
	const cids=[]
	for (const cid of user.changesets) { // read directly from user to include changesets that are not downloaded
		if (skipCids.has(cid)) continue
		const changeset=project.changeset[cid]
		if (!(changeset.min_lat && changeset.min_lon && changeset.max_lat && changeset.max_lon)) continue
		const k=cids.length*4
		response.write(e.x`  <node id="-${k+1}" lat="${changeset.min_lat}" lon="${changeset.min_lon}" />\n`)
		response.write(e.x`  <node id="-${k+2}" lat="${changeset.max_lat}" lon="${changeset.min_lon}" />\n`)
		response.write(e.x`  <node id="-${k+3}" lat="${changeset.max_lat}" lon="${changeset.max_lon}" />\n`)
		response.write(e.x`  <node id="-${k+4}" lat="${changeset.min_lat}" lon="${changeset.max_lon}" />\n`)
		cids.push(cid)
	}
	for (let i=0;i<cids.length;i++) {
		response.write(e.x`  <way id="-${i+1}">\n`)
		for (let j=0;j<=4;j++) {
			response.write(e.x`    <nd ref="-${i*4+1+j%4}" />\n`)
			response.write(e.x`    <tag k="url" v="${osmLink.changeset(cids[i])}" />\n`)
			const comment=project.changeset[cids[i]].tags.comment
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

async function serveFetchUser(response,project,userString,referer) {
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
		return respond.fetchError(response,ex,'user fetch error',e.h`<p>user fetch failed for input <code>${userString}</code>\n`)
	}
	project.saveUsers()
	response.writeHead(303,{'Location':referer??'.'})
	response.end()
}

async function serveFetchUserMetadata(response,project,user,referer) {
	try {
		await osm.fetchUserToStore(project.user,user.id)
		let timestamp
		for (let i=0;i<1000;i++) {
			if (!user.gone) {
				if (user.changesets.length>=user.changesetsCount) break
			}
			let requestPath=e.u`/api/0.6/changesets?user=${user.id}`
			if (timestamp!==undefined) requestPath+=e.u`&time=2001-01-01,${timestamp}`
			const [changesets,,newTimestamp]=await osm.fetchChangesetsToStore(project.changeset,requestPath)
			user.changesets=mergeChangesets(user.changesets,changesets)
			timestamp=newTimestamp
			if (changesets.length==0) break
		}
	} catch (ex) {
		return respond.fetchError(response,ex,'user fetch metadata error',e.h`<p>user fetch metadata failed for user #${user.id}\n`)
	}
	project.saveChangesets()
	project.saveUsers()
	response.writeHead(303,{'Location':referer??'.'})
	response.end()
}

async function serveFetchUserData(response,project,user,referer) {
	let nDownloads=0
	for (let i=0;i<user.changesets.length;i++) {
		if (nDownloads>=1000) break
		const changesetId=user.changesets[i]
		if (project.changeset[changesetId].changes_count==0) continue
		if (changesetId in project.store.changeset) continue
		try {
			await osm.fetchToStore(project.store,`/api/0.6/changeset/${changesetId}/download`)
		} catch (ex) {
			return respond.fetchError(response,ex,'changeset request error',e.h`<p>cannot fetch changeset ${changesetId}\n`)
		}
		nDownloads++
	}
	if (nDownloads>0) project.saveStore()
	response.writeHead(303,{'Location':referer??'.'})
	response.end()
}

async function serveUid(response,project,uid) {
	if (!(uid in project.user)) {
		try {
			await osm.fetchUserToStore(project.user,uid)
		} catch (ex) {
			return respond.fetchError(response,ex,'user profile redirect error',`<p>redirect to user profile on osm website failed\n`)
		}
		project.saveUsers()
	}
	response.writeHead(301,{'Location':osmLink.username(project.user[uid].displayName)})
	response.end()
}

async function serveUndeleteElement(response,project,etype,eid) {
	let elements
	try {
		elements=await fetchTopVisibleVersions(project,[[etype,eid]])
	} catch (ex) {
		response.writeHead(500)
		response.end(`undelete fetch error:\n${ex.message}`)
		return
	}
	writeOsmFile(response,project.store,elements)
}

async function serveFetchChangeset(response,project,cidString,referer) {
	try {
		const cid=osmRef.changeset(cidString)
		await osm.fetchToStore(project.store,`/api/0.6/changeset/${cid}/download`)
	} catch (ex) {
		return respond.fetchError(response,ex,'changeset request error',e.h`<p>cannot fetch changeset ${cidString}\n`)
	}
	project.saveStore()
	response.writeHead(303,{'Location':referer??'.'})
	response.end()
}

function mergeChangesets(changesets1,changesets2) {
	const changesetsSet=new Set()
	for (const id of changesets1) changesetsSet.add(id)
	for (const id of changesets2) changesetsSet.add(id)
	const changesets=[...changesetsSet]
	changesets.sort((x,y)=>(x-y))
	return changesets
}

async function serveChangeset(response,project,cid) {
	let earliestNodeChangeTimestamp
	const csetNodeVersions={}
	const csetWayVersionsAndTimestamps={}
	const prevWayVersionsAndTimestamps={}
	for (const [ctype,etype,eid,ev] of project.store.changeset[cid]) {
		if (etype!='node') continue
		csetNodeVersions[eid]=ev
		const newTimestamp=project.store[etype][eid][ev].timestamp
		if (earliestNodeChangeTimestamp==null || earliestNodeChangeTimestamp>newTimestamp) {
			earliestNodeChangeTimestamp=newTimestamp
		}
	}
	for (const [ctype,etype,eid,ev] of project.store.changeset[cid]) {
		if (etype!='way') continue
		const wayStore=project.store[etype][eid]
		const wayTimestamp=wayStore[ev].timestamp
		csetWayVersionsAndTimestamps[eid]=[ev,wayTimestamp]
		if (ev>1 && wayStore[ev-1]) {
			let earliestTimestamp=wayTimestamp
			if (earliestNodeChangeTimestamp!=null && earliestNodeChangeTimestamp<earliestTimestamp) {
				earliestTimestamp=earliestNodeChangeTimestamp
			}
			prevWayVersionsAndTimestamps[eid]=[ev-1,earliestTimestamp-1] // timestamp right before either way change or earliest node change
			// TODO probably better to check earliest time of way nodes instead of all nodes - but which ones: new or old way nodes?
		}
	}
	let csetWayNodes,prevWayNodes
	try {
		csetWayNodes=await getWayNodes(project,csetWayVersionsAndTimestamps,csetNodeVersions)
		prevWayNodes=await getWayNodes(project,prevWayVersionsAndTimestamps)
	} catch (ex) {
		return respond.fetchError(response,ex,'way node fetch error',`<p>fetching way nodes failed\n`)
	}
	respond.mapHead(response,'changeset '+cid)
	writeChangesetStart(cid)
	const changeset=project.changeset[cid]
	if (changeset?.min_lat && changeset?.min_lon && changeset?.max_lat && changeset?.max_lon) {
		writeBboxStart(cid)
		writeItemEnd()
	}
	for (const [ctype,etype,eid,ev] of project.store.changeset[cid]) {
		writeElementStart(ctype,etype,eid,ev)
		writeItemEnd()
	}
	writeItemEnd()
	respond.mapTail(response)
	function writeChangesetStart(cid) {
		const data={id:cid}
		const changeset=project.changeset[cid]
		writeItemStart(
			'changeset',
			data,
			`changeset ${cid}`,
			(x=>[x.at('[osm]'),x.osmcha.at('[osmcha]'),x.achavi.at('[achavi]')])(
				changeset?.uid ? osmLink.changesetOfUser(cid,changeset.uid) : osmLink.changeset(cid)
			)
		)
	}
	function writeBboxStart(cid) {
		const changeset=project.changeset[cid]
		const data={
			id:cid,
			['min-lat']:changeset.min_lat,
			['min-lon']:changeset.min_lon,
			['max-lat']:changeset.max_lat,
			['max-lon']:changeset.max_lon,
		}
		writeItemStart(
			'bbox',
			data,
			`bounding box`,
		)
	}
	function writeElementStart(ctype,etype,eid,ev) {
		const data={id:eid}
		const element=project.store[etype][eid][ev]
		if (element.lat!=null && element.lon!=null) {
			data.lat=element.lat
			data.lon=element.lon
		}
		const prevElement=project.store[etype][eid][ev-1]
		if (prevElement && prevElement.lat!=null && prevElement.lon!=null) {
			data.prevLat=prevElement.lat
			data.prevLon=prevElement.lon
		}
		writeItemStart(
			ctype+' '+etype,
			data,
			`${ctype} ${etype} ${eid}`,
			(x=>[x.at('[osm]'),x.history.at('[osm hist]'),x.deepHistory.at('[deep hist]')])(osmLink.element(etype,eid))
		)
		if (etype=='way') {
			if (haveSameNodes(csetWayNodes[eid],prevWayNodes[eid])) {
				response.write(`<div class='nds new old'>way nodes:<ul>\n`)
				writeNodeListItems(csetWayNodes[eid])
				response.write(`</ul></div>\n`)
			} else {
				response.write(`<div class='nds new'>new way nodes:<ul>\n`)
				writeNodeListItems(csetWayNodes[eid])
				response.write(`</ul></div>\n`)
				if (prevWayNodes[eid]) {
					response.write(`<div class='nds old'>old way nodes:<ul>\n`)
					writeNodeListItems(prevWayNodes[eid])
					response.write(`</ul></div>\n`)
				}
			}
		}
		function haveSameNodes(nodes1,nodes2) { // TODO compare coords instead - but then single listed node may have two versions
			if (nodes1?.length!=nodes2?.length) return false
			for (let i=0;i<nodes1.length;i++) {
				const [nid1,nv1]=nodes1[i]
				const [nid2,nv2]=nodes2[i]
				if (nid1!=nid2 || nv1!=nv2) return false
			}
			return true
		}
		function writeNodeListItems(nodes) {
			for (const [nodeId,nodeVersion] of nodes) {
				const node=project.store.node[nodeId][nodeVersion]
				response.write(e.h`<li class=nd data-id=${nodeId} data-lat=${node.lat} data-lon=${node.lon}>`+osmLink.node(nodeId).at('node '+nodeId)+e.h` v${nodeVersion}\n`)
			}
		}
	}
	function writeItemStart(type,data,label,links) {
		const toDashStyle=k=>k.replace(/[A-Z]/g,x=>'-'+x.toLowerCase())
		const itemClass=`item ${type}`
		let dataAttrs=''
		for (const [k,v] of Object.entries(data)) {
			dataAttrs+=e.h` data-${toDashStyle(k)}=${v}`
		}
		response.write(e.h`<details class=${itemClass}`+dataAttrs+e.h`><summary><label><input type=checkbox>${label}</label></summary>\n`)
		if (links) response.write('<nav>'+links.join(' ')+'</nav>\n')
	}
	function writeItemEnd() {
		response.write(`</details>\n`)
	}
}

async function getWayNodes(project,wayVersionsAndTimestamps,forceNodeVersions={}) {
	const needNodeTimestamp={} // id:timestamp
	for (const [eid,[ev,et]] of Object.entries(wayVersionsAndTimestamps)) {
		const way=project.store.way[eid][ev]
		for (const nodeId of way.nds) {
			if (forceNodeVersions[nodeId]) continue
			if (needNodeTimestamp[nodeId]==null) needNodeTimestamp[nodeId]=0
			if (needNodeTimestamp[nodeId]<et) needNodeTimestamp[nodeId]=et
		}
	}
	const nodeVersions={}
	let [madeChanges,madeFetches]=await getWayNodesInitialVersions(project.store,needNodeTimestamp,nodeVersions)
	while (madeChanges) {
		let [madeMoreChanges,madeMoreFetches]=await getWayNodesImproveVersions(project.store,needNodeTimestamp,nodeVersions)
		madeChanges=madeMoreChanges
		madeFetches=madeFetches||madeMoreFetches
	}
	if (madeFetches) {
		project.saveStore()
	}
	const wayNodes={}
	for (const [eid,[ev,et]] of Object.entries(wayVersionsAndTimestamps)) {
		const way=project.store.way[eid][ev]
		wayNodes[eid]=way.nds.map(id=>[id,forceNodeVersions[id]??nodeVersions[id]])
	}
	return wayNodes
}

async function getWayNodesInitialVersions(store,needTimestamps,versions) {
	const madeChanges=true // will populate initial vesions
	const multifetchList=[] // request only top vesions
	for (const [id,needTimestamp] of Object.entries(needTimestamps)) {
		const nodeStore=store.node[id]
		if (!nodeStore) {
			// node not fetched - need to download top version
			multifetchList.push(['node',id])
			continue
		}
		if (nodeStore.top && nodeStore.top.timestamp>=needTimestamp) {
			// top version checked after required time - no need to download another one
			continue
		}
		const vt=osm.topVersion(nodeStore)
		if (nodeStore[vt].timestamp<needTimestamp) {
			// top fetched vertion is older than required
			multifetchList.push(['node',id])
		}
	}
	if (multifetchList.length>0) {
		await osm.multifetchToStore(store,multifetchList)
	}
	for (const [id,needTimestamp] of Object.entries(needTimestamps)) {
		const nodeStore=store.node[id]
		let v=0
		for (;v<osm.topVersion(nodeStore);v++) { // TODO binary search
			if (!nodeStore[v]) continue
			if (nodeStore[v].timestamp>=needTimestamp) break
		}
		versions[id]=v
	}
	return [madeChanges,multifetchList.length>0]
}

async function getWayNodesImproveVersions(store,needTimestamps,versions) {
	let madeChanges=false
	const multifetchList=[]
	for (const [id,needTimestamp] of Object.entries(needTimestamps)) {
		const nodeStore=store.node[id]
		let v=versions[id]
		if (nodeStore[v].timestamp<=needTimestamp) continue
		madeChanges=true
		for (;v>0;v--) {
			if (!nodeStore[v]) {
				multifetchList.push(['node',id,v])
				break
			}
			if (nodeStore[v].timestamp<=needTimestamp) {
				break
			}
		}
		if (v<=0) throw new Error(`node #${id} has version 1 newer than requred`)
		versions[id]=v
	}
	if (multifetchList.length>0) {
		await osm.multifetchToStore(store,multifetchList)
	}
	return [madeChanges,multifetchList.length>0]
}
