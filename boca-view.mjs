import * as e from './escape.js'
import * as osm from './osm.js'
import * as osmLink from './osm-link.mjs'
import * as respond from './boca-respond.mjs'
import {createParentQuery} from './boca-parent.mjs'
import * as scoped from './boca-scoped.mjs'
import elementWriter from './boca-element.mjs'
import Filter from './boca-filter.mjs'

export function writeRedactionsStatus(response,project) {
	if (project.pendingRedactions.last.length>0) {
		response.write(`<p>last redaction changes:<ul>\n`)
		for (const [action,etype,eid,ev] of project.pendingRedactions.last) {
			const anchor='#'+etype[0]+eid
			response.write(e.h`<li>${action} <a href=${anchor}>${etype} #${eid}</a> v${ev}\n`)
		}
		response.write(`</ul>\n`)
	}
	if (project.isEmptyPendingRedactions()) {
		response.write(`<p>no pending redactions\n`)
	} else {
		response.write(`<p><a href=/redactions/>view all pending redactions</a>\n`)
	}
}

class ElementaryView { // doesn't need to provide real changesets/changes
	constructor(project) {
		this.project=project
	}
	async serveRoute(response,route,getQuery,passPostQuery,referer) {
		if (route=='') {
			this.serveMain(response)
		} else if (route=='elements') {
			this.serveByElement(response,scoped.viewElements,route,getQuery)
		} else if (route=='cpe') {
			this.serveByElement(response,scoped.analyzeChangesPerElement,route,getQuery)
		} else if (route=='reload-redactions') {
			this.project.loadRedactions()
			response.writeHead(303,{'Location':referer??'.'})
			response.end()
		} else {
			return await this.serveReloadableRoute(response,route,getQuery,passPostQuery,referer)
		}
		return true
	}
	async serveReloadableRoute(response,route,getQuery,passPostQuery,referer) {
		const getVersions=a=>(Array.isArray(a)?a:[a]).map(Number).filter(Number.isInteger)
		const actions=[
			['fetch-history',async({type,id})=>{
				await osm.fetchToStore(this.project.store,e.u`/api/0.6/${type}/${id}/history`,true)
				if (!this.project.store[type][id]) throw new Error(`Fetch completed but the element record is empty for ${type} #${id}`)
				this.project.saveStore()
			}],
			['redact',async({type,id,version})=>{
				this.project.redactElementVersions(type,id,getVersions(version))
				this.project.savePendingRedactions()
			}],
			['unredact',async({type,id})=>{
				this.project.unredactElement(type,id)
				this.project.savePendingRedactions()
			}],
		]
		for (const [routePrefix,action] of actions) {
			if (route==routePrefix) {
				const args=await passPostQuery()
				try {
					await action(args)
				} catch (ex) {
					respond.fetchError(response,ex,'element action error',e.h`<p>cannot perform action for element ${args.type} #${args.id}\n`)
					return true
				}
				response.writeHead(303,{'Location':(referer??'.')+e.u`#${args.type[0]+args.id}`}) // TODO check if referer is a path that supports element anchor
				response.end()
				return true
			} else if (route==routePrefix+'-reload') {
				const args=await passPostQuery()
				try {
					await action(args)
				} catch (ex) {
					response.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'})
					response.write(`cannot perform action for element ${args.type} #${args.id}\n`)
					response.write(`the error was: ${ex.message}\n`)
					response.end()
					return true
				}
				response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'})
				const etype=args.type
				const eid=Number(args.id)
				const [evs,parent]=this.getSelectedElementVersionsAndParent(etype,eid)
				elementWriter(response,this.project,etype,eid,evs,parent)
				response.end()
				return true
			}
		}
		return false
	}
	getSelectedElementVersionsAndParent(targetEtype,targetEid) {
		const evs=[]
		let parent
		for (const [,changes] of this.getChangesets()) { // TODO optimized version for full views - look through csets in element history
			for (const [,etype,eid,ev] of changes) {
				if (etype==targetEtype && eid==targetEid) {
					evs.push(ev)
					if (targetEtype=='way' && ev==1) {
						const parentQuery=createParentQuery(this.project,changes)
						parent=parentQuery(eid)
					}
				}
			}
		}
		return [evs,parent]
	}
	serveMain(response) {
		this.writeHead(response)
		this.writeMain(response)
		this.writeTail(response)
	}
	serveByElement(response,insides,route,query) {
		const filter=new Filter(query)
		this.writeHead(response)
		response.write(`<h2>Element filters</h2>\n`)
		response.write(e.h`<form class=real action=${route}>\n`)
		response.write(e.h`<textarea name=filter>${filter.text}</textarea>\n`)
		response.write(`<details><summary>Filter syntax</summary>\n`)
		response.write(Filter.syntaxDescription)
		response.write(`</details>\n`)
		response.write(`<div><button>Apply filters</button></div>\n`)
		response.write(`</form>\n`)
		insides(response,this.project,this.getChangesets(),filter)
		this.writeTail(response)
	}
	writeHead(response) {
		respond.head(response,this.getTitle())
		this.writeHeading(response)
		response.write(`<nav><ul>\n`)
		for (const [href,text] of this.listNavLinks()) {
			response.write(`<li><a href=${href}>${text}</a>\n`)
		}
		response.write(`</ul></nav>\n`)
	}
	writeTail(response) {
		response.write(`</main>\n`)
		response.write(`<footer>\n`)
		response.write(`<div class=redactions-status>\n`)
		writeRedactionsStatus(response,this.project)
		response.write(`</div>\n`)
		response.write(`<form method=post>`)
		this.writeFooterButtons(response)
		response.write(`</form>\n`)
		response.write(`</footer>\n`)
		respond.tailNoMain(response)
	}
	writeFooterButtons(response) {
		response.write(`<button formaction=reload-redactions>Reload redactions</button>`)
	}
	*listNavLinks() {
		yield* [
			['/','root'],
			['.','main view'],
			['elements','elements'],
			['cpe','changes per element'],
		]
	}
}

class FullView extends ElementaryView {
	async serveRoute(response,route,getQuery,passPostQuery,referer) {
		if (await super.serveRoute(response,route,getQuery,passPostQuery,referer)) {
			return true
		}
		if (route=='counts') {
			this.serveByChangeset(response,scoped.analyzeCounts)
		} else if (route=='formulas') {
			this.serveByChangeset(response,scoped.analyzeFormulas)
		} else if (route=='keys') {
			this.serveByChangeset(response,scoped.analyzeKeys)
		} else if (route=='deletes') {
			this.serveByChangeset(response,scoped.analyzeDeletes)
		} else if (route=='cpcpe') {
			this.serveByChangeset(response,scoped.analyzeChangesPerChangesetPerElement)
		} else if (route=='fetch-previous') {
			const query=await passPostQuery()
			await this.serveFetchElements(response,
				scoped.fetchPreviousVersions,
				query,referer,
				`<p>cannot fetch previous versions of elements\n`
			)
		} else if (route=='fetch-first') {
			const query=await passPostQuery()
			await this.serveFetchElements(response,
				scoped.fetchFirstVersions,
				query,referer,
				`<p>cannot fetch first versions of elements\n`
			)
		} else if (route=='fetch-latest') {
			const query=await passPostQuery()
			await this.serveFetchElements(response,
				scoped.fetchLatestVersions,
				query,referer,
				`<p>cannot fetch latest versions of elements\n`
			)
		} else if (route=='fetch-redacted') {
			await this.serveFetchElements(response,
				scoped.fetchLatestVersions,
				{'vt.redacted':true},referer,
				`<p>cannot fetch latest versions of redacted elements\n`
			)
		} else if (route=='fetch-subsequent') { // TODO make it work with elementary views
			const query=await passPostQuery()
			await this.serveFetchElements(response,
				scoped.fetchSubsequentVersions,
				query,referer,
				`<p>cannot fetch subsequent versions of elements\n`
			)
		} else {
			return false
		}
		return true
	}
	serveByChangeset(response,insides) {
		this.writeHead(response)
		insides(response,this.project,this.getChangesets())
		this.writeTail(response)
	}
	async serveFetchElements(response,insides,query,referer,errorMessage) {
		const filter=new Filter(query).dropOrder()
		try {
			await insides(response,this.project,this.getChangesets(),filter)
		} catch (ex) {
			return respond.fetchError(response,ex,'elements fetch error',errorMessage)
		}
		this.project.saveStore()
		response.writeHead(303,{'Location':referer??'.'})
		response.end()
	}
	writeFooterButtons(response) {
		super.writeFooterButtons(response)
		response.write(`<button formaction=fetch-previous>Fetch previous versions</button>`)
		response.write(`<button formaction=fetch-latest>Fetch latest versions</button>`)
		response.write(`<button formaction=fetch-redacted>Fetch a batch of elements with last version redacted</button>`)
	}
	*listNavLinks() {
		yield* super.listNavLinks()
		yield* [
			['counts','element counts'],
			['formulas','change formulas'],
			['keys','changed keys'],
			['deletes','deletion distributions'],
			['cpcpe','changes per changeset per element'],
		]
	}
}

export class AllView extends FullView {
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

export class ScopeView extends FullView {
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
		response.write(`<ul>\n`)
		response.write(`<li>external tools: `+osmLink.changesets(cids).osmcha.at('osmcha')+`\n`)
		response.write(`</ul>\n`)
		response.write(`<textarea>\n`)
		for (const line of this.project.scope[this.scope]) {
			response.write(e.h`${line}\n`)
		}
		response.write(`</textarea>`)
	}
}

export class UserView extends FullView {
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
		response.write(e.h`<h1>User #${this.user.id} `+osmLink.username(this.user.displayName).at(this.user.displayName)+`</h1>\n`)
	}
	writeMain(response) {
		response.write(e.h`<ul>\n`)
		response.write(e.h`<li>last update was on ${Date(this.user.updateTimestamp)}\n`)
		response.write(e.h`<li>downloaded metadata of ${this.user.changesets.length}/${this.user.changesetsCount} changesets\n`)
		response.write(e.h`<li>external tools: `+osmLink.username(this.user.displayName).hdyc.at('hdyc')+` `+osmLink.user(this.user.id).osmcha.at('osmcha')+`</li>\n`)
		response.write(e.h`</ul>\n`)
		response.write(`<details><summary>copypaste for caser</summary><pre><code>`+
			`## ${this.user.displayName}\n`+
			`\n`+
			`* uid ${this.user.id}\n`+
			`* changesets count ${this.user.changesetsCount}\n`+
			`* dwg ticket `+
		`</code></pre></details>\n`)
		response.write(`<form method=post action=fetch-metadata>`)
		response.write(`<button>Update user and changesets metadata</button>`)
		response.write(`</form>\n`)
		response.write(`<form method=post action=fetch-data>`)
		response.write(`<button>Fetch a batch of changesets data</button> `)
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
			response.write(' '+osmLink.changeset(changeset.id).at(changeset.id))
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
			let foundEditor=false
			for (const editor of ['iD','JOSM','Level0','MAPS.ME','OsmAnd','osmtools','Potlatch','Vespucci']) { // possible created_by values: https://wiki.openstreetmap.org/wiki/Key:created_by
				if (new RegExp(`^(reverter.*?;)?${editor}\\W`).test(changeset.tags.created_by)) {
					inc(editor,changeset.tags.created_by)
					foundEditor=true
					break
				}
			}
			if (!foundEditor) inc('(other)',changeset.tags.created_by??'(unknown)')
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
			response.write(' '+osmLink.changeset(id).at(id))
		}
		response.write(`\n`)
		response.write(`</dl>\n`)
		response.write(`<h2>Areas</h2>\n`)
		response.write(`<ul>\n`)
		const bboxTitle='changeset bboxes of user '+this.user.displayName
		response.write(e.h`<li><a class=rc href=bbox.osm data-upload-policy=false title=${bboxTitle}>bbox josm file</a>\n`)
		response.write(e.h`<li><a class=rc href=bbox-noscope.osm data-upload-policy=false title=${'non-scoped '+bboxTitle}>bbox josm file with scopes excluded</a>\n`)
		response.write(`</ul>\n`)
	}
}

export class ChangesetView extends FullView {
	constructor(project,cid) {
		super(project)
		this.cid=cid
	}
	getChangesets() {
		return [[this.cid,this.project.store.changeset[this.cid]]]
	}
	getTitle() {
		return 'changeset '+this.cid
	}
	writeHeading(response) {
		response.write(`<h1>Changeset #`+osmLink.changeset(this.cid).at(this.cid)+`</h1>\n`)
	}
	writeMain(response) {
		const href=osmLink.changeset(this.cid)
		response.write(e.h`<ul>\n`)
		response.write(e.h`<li><a href=map>changeset viewer</a>\n`)
		response.write(e.h`<li>external tools: `+href.osmcha.at('osmcha')+` `+href.achavi.at('achavi')+`</li>\n`)
		response.write(e.h`</ul>\n`)
	}
}

export class RedactionsExtraElementsView extends ElementaryView {
	*getChangesets() {
		for (const [etype,eid] of this.project.pendingRedactions.extra) {
			for (const ev of osm.allVersions(this.project.store[etype][eid])) {
				yield [null,[
					[null,etype,eid,ev]
				]]
			}
		}
	}
	getTitle() {
		return 'extra elements in pending redactions'
	}
	writeHeading(response) {
		response.write(`<h1>Extra elements in pending redactions</h1>\n`)
	}
	writeMain(response) {
		response.write(e.h`<p>${this.project.pendingRedactions.extra.length} elements in total\n`)
	}
}
