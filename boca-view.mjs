import * as e from './escape.js'
import * as osm from './osm.js'
import * as osmLink from './osm-link.mjs'
import * as respond from './boca-respond.mjs'
import {createParentQuery} from './boca-parent.mjs'
import * as scoped from './boca-scoped.mjs'
import elementWriter from './boca-element.mjs'
import Filter from './boca-filter.mjs'

const CAN_HAVE_FILTER=Symbol()

export function writeRedactionsStatus(response,project) {
	if (project.pendingRedactions.last.length>0) {
		response.write(`<p>last redaction changes:<ul>\n`)
		for (const [action,attribute,etype,eid,evtag] of project.pendingRedactions.last) {
			const anchor='#'+etype[0]+eid
			const attrText=(attribute=='version' ? `v` : `tag `)
			response.write(e.h`<li>${action} <a href=${anchor}>${etype} #${eid}</a> ${attrText}${evtag}\n`)
		}
		response.write(`</ul>\n`)
	}
	if (project.pendingRedactions.isEmpty()) {
		response.write(`<p><a href=/redactions/>no pending redactions</a>\n`)
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
			this.serveMain(response,getQuery)
		} else if (route=='elements') {
			this.serveByElement(response,route,getQuery,scoped.viewElements)
		} else if (route=='cpe') {
			this.serveByElement(response,route,getQuery,scoped.analyzeChangesPerElement)
		} else if (route=='nameredos') {
			this.serveByElement(response,route,getQuery,scoped.analyzeNameRedos)
		} else if (route=='top.osm') {
			this.serveFile(response,route,getQuery,scoped.serveTopVersions)
		} else if (route=='deleted.osm') {
			this.serveFile(response,route,{...getQuery,'vt.visible':0},scoped.serveTopVisibleVersions)
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
		const getTags=a=>{
			if (a==null) return []
			return (Array.isArray(a)?a:[a])
		}
		const actions=[
			['fetch-history',async({type,id})=>{
				await osm.fetchToStore(this.project.store,e.u`/api/0.6/${type}/${id}/history`,true)
				if (!this.project.store[type][id]) throw new Error(`Fetch completed but the element record is empty for ${type} #${id}`)
				this.project.saveStore()
			}],
			['redact',async({type,id,version,tag})=>{
				this.project.pendingRedactions.redactElementVersionsAndTags(type,id,getVersions(version),getTags(tag))
				this.project.savePendingRedactions()
			}],
			['unredact',async({type,id})=>{
				this.project.pendingRedactions.unredactElement(type,id)
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
						const parentQuery=createParentQuery(this.project.store,changes)
						parent=parentQuery(eid)
					}
				}
			}
		}
		return [evs,parent]
	}
	serveMain(response,query) {
		const filter=new Filter(query)
		this.writeHead(response,'.',filter)
		this.writeMain(response)
		this.writeTail(response)
	}
	serveByElement(response,route,query,insides) {
		const filter=new Filter(query)
		this.writeHead(response,route,filter)
		const ecount=insides(response,this.project,this.getChangesets(),filter)
		this.writeTail(response,ecount)
	}
	serveFile(response,route,query,insides) {
		const filter=new Filter(query)
		insides(response,this.project,this.getChangesets(),filter)
	}
	writeHead(response,route,filter) {
		respond.head(response,this.getTitle())
		this.writeHeading(response)
		response.write(`<nav class=view>\n`)
		response.write(`<ul class=routes>\n`)
		for (const [href,text,whatCanHave] of this.listNavLinks()) {
			response.write(`<li>`)
			if (href==route) response.write(`<strong>`)
			response.write(e.h`<a href=${href}>${text}</a>`)
			if (filter && whatCanHave==CAN_HAVE_FILTER && filter.text!='') {
				const filteredHref=href+e.u`?filter=${filter.text}`
				response.write(e.h` (<a href=${filteredHref}>filtered</a>)`)
			}
			if (href==route) response.write(`</strong>`)
			response.write(`\n`)
		}
		response.write(`</ul>\n`)
		if (filter) {
			response.write(e.h`<form class='filter with-examples' action=${route}>\n`)
			response.write(`<details><summary>Filter syntax</summary>\n`)
			response.write(Filter.syntaxDescription)
			response.write(`</details>\n`)
			response.write(`<label>element filters:\n`)
			response.write(e.h`<textarea name=filter>${filter.text}</textarea>\n`)
			response.write(`</label>\n`)
			response.write(`<div><button>Apply filters</button></div>\n`)
			response.write(`</form>\n`)
		}
		response.write(`</nav>\n`)
	}
	writeTail(response,ecount) {
		response.write(`</main>\n`)
		response.write(`<footer>\n`)
		response.write(`<div class=status>\n`)
		response.write(`<div class=redactions>\n`)
		writeRedactionsStatus(response,this.project)
		response.write(`</div>\n`)
		if (ecount!=null) {
			response.write(`<div class=elements>\n`)
			response.write(e.h`<span class=meter><span class=total>${ecount}</span></span> <span class=units>elements</span>\n`)
			response.write(`</div>\n`)
		}
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
			['.','main view',CAN_HAVE_FILTER],
			['elements','elements',CAN_HAVE_FILTER],
			['cpe','changes per element',CAN_HAVE_FILTER],
			['nameredos','find name readditions',CAN_HAVE_FILTER],
		]
	}
}

class FullView extends ElementaryView {
	async serveRoute(response,route,getQuery,passPostQuery,referer) {
		if (await super.serveRoute(response,route,getQuery,passPostQuery,referer)) {
			return true
		}
		if (route=='counts') {
			this.serveByChangeset(response,route,scoped.analyzeCounts)
		} else if (route=='formulas') {
			this.serveByChangeset(response,route,scoped.analyzeFormulas)
		} else if (route=='keys') {
			this.serveByChangeset(response,route,scoped.analyzeKeys)
		} else if (route=='deletes') {
			this.serveByChangeset(response,route,scoped.analyzeDeletes)
		} else if (route=='cpcpe') {
			this.serveByChangeset(response,route,scoped.analyzeChangesPerChangesetPerElement)
		} else if (route=='nonatomic') {
			this.serveByChangeset(response,route,scoped.analyzeNonatomicChangesets)
		} else {
			for (const [targetRoute,action,errorMessage,rewriteQuery] of [
				['fetch-previous',scoped.fetchPreviousVersions,`<p>cannot fetch previous versions of elements\n`], // TODO make it work with elementary views
				['fetch-first',scoped.fetchFirstVersions,`<p>cannot fetch first versions of elements\n`],
				['fetch-latest',scoped.fetchLatestVersions,`<p>cannot fetch latest versions of elements\n`],
				['fetch-redacted',scoped.fetchLatestVersions,`<p>cannot fetch latest versions of redacted elements\n`,{'vt.redacted':true}],
				['fetch-preceding',scoped.fetchPrecedingVersions,`<p>cannot fetch preceding versions of elements\n`], // TODO make it work with elementary views
				['fetch-subsequent',scoped.fetchSubsequentVersions,`<p>cannot fetch subsequent versions of elements\n`], // TODO make it work with elementary views
				['assume-loaded',scoped.assumeElementsAreLoaded,`<p>cannot assume elements are loaded\n`], // TODO not actually a fetch; make it work with elementary views
			]) {
				if (route!=targetRoute) continue
				let query
				if (rewriteQuery!=null) {
					query=rewriteQuery
				} else {
					query=await passPostQuery()
				}
				await this.serveFetchElements(response,action,query,referer,errorMessage)
				return true
			}
			return false
		}
		return true
	}
	serveByChangeset(response,route,insides) {
		this.writeHead(response,route)
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
			['nonatomic','find nonatomic changesets'],
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
		return this.scope.getChangesets(this.project.store,this.project.user)
	}
	getTitle() {
		return 'scope "'+this.scope.name+'"'
	}
	writeHeading(response) {
		response.write(e.h`<h1>Scope "${this.scope.name}"</h1>\n`)
	}
	writeMain(response) {
		const cids=[]
		for (const [cid,] of this.getChangesets()) cids.push(cid)
		response.write(`<ul>\n`)
		response.write(`<li>external tools: `+osmLink.changesets(cids).osmcha.at('osmcha')+`\n`)
		response.write(`</ul>\n`)
		response.write(`<textarea>\n`)
		for (const line of this.scope.lines) {
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
		if (this.user.gone) {
			response.write(e.h`<li>downloaded metadata of ${this.user.changesets.length} changesets\n`)
			response.write(e.h`<li>total number of changesets is unknown because the user is gone\n`)
		} else {
			response.write(e.h`<li>downloaded metadata of ${this.user.changesets.length}/${this.user.changesetsCount} changesets\n`)
		}
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

export class SiblingsView extends ElementaryView {
	constructor(project,eid,cid) {
		super(project)
		this.eid=eid
		this.cid=cid
	}
	getChangesets() {
		const changes=this.project.store.changeset[this.cid]
		const parentQuery=createParentQuery(this.project.store,changes)
		const siblingChanges=[]
		for (const change of changes) {
			const [,etype,eid,ev]=change
			if (etype=='way' && eid!=this.eid && ev==1) {
				const parent=parentQuery(eid)
				if (parent) {
					const [pid]=parent
					if (pid==this.eid) siblingChanges.push(change)
				}
			}
		}
		return [[this.cid,siblingChanges]]
	}
	getTitle() {
		return `siblings of way ${this.eid} in cahgeset ${this.cid}`
	}
	writeHeading(response) {
		const wayLink=osmLink.way(this.eid).at(`way #`+this.eid)
		const csetLink=osmLink.changeset(this.cid).at(`changeset #`+this.cid)
		response.write(`<h1>Detect siblings of ${wayLink} in ${csetLink}</h1>\n`)
	}
}
