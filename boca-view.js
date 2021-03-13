const e=require('./escape')
const respond=require('./boca-respond')
const bocaScoped=require('./boca-scoped')

const osmchaFilterTag=e.independentValuesEscape(value=>{
	if (!Array.isArray(value)) value=[value]
	return '['+value.map(singleValue=>{
		const cEscapedValue=String(singleValue).replace(/\\/g,'\\\\').replace(/"/g,'\\"')
		return `{"label":"${cEscapedValue}","value":"${cEscapedValue}"}`
	}).join(',')+']'
})

class View {
	constructor(project) {
		this.project=project
	}
	serveMain(response) {
		this.writeHead(response)
		this.writeMain(response)
		this.writeTail(response)
	}
	serveByChangeset(response,insides,order) {
		this.writeHead(response)
		insides(response,this.project,this.getChangesets(),order)
		this.writeTail(response)
	}
	serveByElement(response,insides,filters) {
		this.writeHead(response)
		insides(response,this.project,this.getChangesets(),filters)
		this.writeTail(response)
	}
	async serveFetchElements(response,insides,filters,referer,errorMessage) {
		try {
			await insides(response,this.project,this.getChangesets(),filters)
		} catch (ex) {
			return respond.fetchError(response,ex,'elements fetch error',errorMessage)
		}
		this.project.saveStore()
		response.writeHead(303,{'Location':referer??'.'})
		response.end()
	}
	async serveRoute(response,route,getQuery,passPostQuery,referer) {
		if (route=='') {
			this.serveMain(response)
		} else if (route=='elements') {
			this.serveByElement(response,bocaScoped.viewElements,getQuery)
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
			this.serveByChangeset(response,bocaScoped.analyzeChangesPerElement,getQuery.order)
		} else if (route=='fetch-previous') {
			const filters=await passPostQuery()
			await this.serveFetchElements(response,
				bocaScoped.fetchPreviousVersions,
				filters,referer,
				`<p>cannot fetch previous versions of elements\n`
			)
		} else if (route=='fetch-first') {
			const filters=await passPostQuery()
			await this.serveFetchElements(response,
				bocaScoped.fetchFirstVersions,
				filters,referer,
				`<p>cannot fetch first versions of elements\n`
			)
		} else if (route=='fetch-latest') {
			const filters=await passPostQuery()
			await this.serveFetchElements(response,
				bocaScoped.fetchLatestVersions,
				filters,referer,
				`<p>cannot fetch latest versions of elements\n`
			)
		} else if (route=='fetch-redacted') {
			await this.serveFetchElements(response,
				bocaScoped.fetchLatestVersions,
				{'vt.redacted':true},referer,
				`<p>cannot fetch latest versions of redacted elements\n`
			)
		} else {
			return false
		}
		return true
	}
	writeHead(response) {
		respond.head(response,this.getTitle())
		this.writeHeading(response)
		response.write(`<nav><ul>\n`)
		for (const [href,text] of [
			['/','root'],
			['.','main view'],
			['elements','elements'],
			['counts','element counts'],
			['formulas','change formulas'],
			['keys','changed keys'],
			['deletes','deletion distributions'],
			['cpcpe','changes per changeset per element'],
			['cpe','changes per element'],
		]) response.write(`<li><a href=${href}>${text}</a>\n`)
		response.write(`</ul></nav>\n`)
	}
	writeTail(response) {
		response.write(`</main>\n`)
		response.write(`<footer>\n`)
		response.write(`<form method=post>`)
		response.write(`<button formaction=fetch-previous>Fetch previous versions</button>`)
		response.write(`<button formaction=fetch-latest>Fetch latest versions</button>`)
		response.write(`<button formaction=reload-redactions>Reload redactions</button>`)
		response.write(`<button formaction=fetch-redacted>Fetch a batch of elements with last version redacted</button>`)
		response.write(`</footer>\n`)
		respond.tailNoMain(response)
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
exports.AllView=AllView

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
exports.ScopeView=ScopeView

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
exports.UserView=UserView