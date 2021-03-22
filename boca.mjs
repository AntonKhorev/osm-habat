// bunch-of-changesets analyser

import * as fs from 'fs'
import * as http from 'http'
import * as querystring from 'querystring'
import open from 'open'

import * as e from './escape.js'
import * as osm from './osm.js'
import Project from './boca-project.mjs'
import * as respond from './boca-respond.mjs'
import {AllView,ScopeView,UserView} from './boca-view.mjs'

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
			await view.serveRoute(response,subpath,queryParams,()=>readPost(request),referer) ||
			await serveCommonViewRoute(response,project,subpath,()=>readPost(request),referer)
		)
		let match
		if (pathname=='/') {
			serveRoot(response,project)
		} else if (pathname=='/store') {
			serveStore(response,project.store)
		} else if (pathname=='/uid') {
			serveUid(response,project,querystring.parse(query).uid)
		} else if (match=pathname.match(new RegExp('^/undelete/w(\\d+)\\.osm$'))) { // currently for ways - TODO extend
			const [,id]=match
			await serveUndeleteWay(response,project,id)
		} else if (pathname=='/fetch-user') {
			const post=await readPost(request)
			await serveFetchUser(response,project,post.user,referer)
		} else if (pathname=='/fetch-changeset') {
			const post=await readPost(request)
			await serveFetchChangeset(response,project,post.changeset,referer)
		} else if (match=pathname.match(new RegExp('^/all/([^/]*)$'))) {
			const [,subpath]=match
			const view=new AllView(project)
			if (await serveViewRoutes(view,subpath)) {
				// ok
			} else {
				response.writeHead(404)
				response.end(`All-downloaded-changesets route not defined`)
			}
		} else if (match=pathname.match(new RegExp('^/scope/([^/]*)/([^/]*)$'))) {
			const [,scope,subpath]=match
			if (!(scope in project.scope)) {
				response.writeHead(404)
				response.end(`Scope "${scope}" not found`)
				return
			}
			const view=new ScopeView(project,scope)
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
			const view=new UserView(project,user)
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
		} else if (match=pathname.match(new RegExp('^/changeset/([1-9]\\d*)/$'))) {
			const [,cid]=match
			if (!project.store.changeset[cid]) {
				response.writeHead(404)
				response.end(`Changeset #${cid} not found`)
				return
			}
			serveChangeset(response,project,cid)
		} else if (pathname=='/favicon.ico') {
			fs.readFile(new URL('./favicon.ico',import.meta.url),(err,data)=>{
				if (err) {
					res.writeHead(404)
					res.end()
					return
				}
				response.writeHead(200,{
					'Content-Type':'image/x-icon',
					'Cache-Control':'public, max-age=604800, immutable',
				})
				response.end(data)
			})
		} else {
			response.writeHead(404)
			response.end('Route not defined')
		}
	}).listen(process.env.PORT||0).on('listening',()=>{
		if (!process.env.PORT) open('http://localhost:'+server.address().port)
	})
}

async function serveCommonViewRoute(response,project,route,passPostQuery,referer) {
	if (route=='fetch-history') {
		const args=await passPostQuery()
		await serveFetchHistory(response,project,args.type,args.id,referer)
	} else if (route=='reload-redactions') {
		serveReloadRedactions(response,project,referer)
	} else if (route=='make-redactions') {
		const args=await passPostQuery()
		const getVersions=a=>(Array.isArray(a)?a:[a]).map(Number).filter(Number.isInteger)
		serveMakeRedactions(response,project,args.type,args.id,getVersions(args.version))
	} else {
		return false
	}
	return true
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
		const href=e.u`/changeset/${cid}/`
		response.write(e.h`<a href=${href}>${cid}</a> `)
	}
	response.write(`</div>\n`)
	response.write(`<h2>Actions</h2>\n`)
	response.write(`<form method=post action=/fetch-user>\n`)
	response.write(`<label>User to fetch: <input type=text name=user></label>\n`)
	response.write(`<button>Fetch from OSM</button>\n`)
	response.write(`</form>\n`)
	response.write(`<form method=post action=/fetch-changeset>\n`)
	response.write(`<label>Changeset to fetch: <input type=text name=changeset></label>\n`)
	response.write(`<button>Fetch from OSM</button>\n`)
	response.write(`</form>\n`)
	response.write(`<p><a href=/store>view json store</a></p>\n`)
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
			response.write(e.x`    <tag k="url" v="https://www.openstreetmap.org/changeset/${cids[i]}" />\n`)
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
		while (user.changesetsCount-user.changesets.length>0) {
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

async function serveFetchChangeset(response,project,changesetId,referer) {
	try {
		await osm.fetchToStore(project.store,`/api/0.6/changeset/${changesetId}/download`)
	} catch (ex) {
		return respond.fetchError(response,ex,'changeset request error',e.h`<p>cannot fetch changeset ${changesetId}\n`)
	}
	project.saveStore()
	response.writeHead(303,{'Location':referer??'.'})
	response.end()
}

async function serveFetchHistory(response,project,etype,eid,referer) {
	try {
		const timestamp=Date.now()
		await osm.fetchToStore(project.store,e.u`/api/0.6/${etype}/${eid}/history`,true)
		if (!project.store[etype][eid]) throw new Error(`Fetch completed but the element record is empty for ${etype} #${eid}`)
	} catch (ex) {
		return respond.fetchError(response,ex,'element history fetch error',e.h`<p>cannot fetch element ${etype} #${eid} history\n`)
	}
	project.saveStore()
	response.writeHead(303,{'Location':(referer??'.')+e.u`#${etype[0]+eid}`}) // TODO check if referer is a path that supports element anchor
	response.end()
}

function serveReloadRedactions(response,project,referer) {
	project.loadRedactions()
	response.writeHead(303,{'Location':referer??'.'})
	response.end()
}

function serveMakeRedactions(response,project,etype,eid,evs) {
	response.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'})
	for (const ev of evs) {
		response.write(`${etype}/${eid}/${ev}\n`)
	}
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

function serveChangeset(response,project,cid) {
	respond.mapHead(response,'changeset '+cid)
	function writeItem(type,data,label,osmHref) {
		let dataAttrs=''
		for (const [k,v] of Object.entries(data)) {
			dataAttrs+=e.h` data-${k}=${v}`
		}
		const itemClass=`item ${type}`
		response.write(e.h`<div class=${itemClass}`+dataAttrs+e.h`><label><input type=checkbox>${label}</label> `)
		response.write(e.h`<a href=${osmHref}>[osm]</a>`)
		response.write(`</div>\n`)
	}
	{
		const data={id:cid}
		const changeset=project.changeset[cid]
		if (changeset?.min_lat && changeset?.min_lon && changeset?.max_lat && changeset?.max_lon) {
			data['min-lat']=changeset.min_lat
			data['min-lon']=changeset.min_lon
			data['max-lat']=changeset.max_lat
			data['max-lon']=changeset.max_lon
		}
		writeItem(
			'changeset',
			data,
			`changeset ${cid}`,
			e.u`https://www.openstreetmap.org/changeset/${cid}`
		)
	}
	for (const [ctype,etype,eid,ev] of project.store.changeset[cid]) {
		const data={id:eid}
		const element=project.store[etype][eid][ev]
		if (element.lat!=null && element.lon!=null) {
			data.lat=element.lat
			data.lon=element.lon
		}
		writeItem(
			etype,
			data,
			`${ctype} ${etype} ${eid}`,
			e.u`https://www.openstreetmap.org/${etype}/${eid}`
		)
	}
	respond.mapTail(response)
}
