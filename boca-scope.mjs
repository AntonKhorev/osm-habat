import * as osmRef from './osm-ref.mjs'

export default class Scope {
	static collectLinesByScopes(lines) {
		let scopeName
		let scopeLines=new Map()
		for (const line of lines) {
			let match
			if (match=line.match(/^#+\s*(.*\S)\s*$/)) {
				[,scopeName]=match
				if (!scopeLines.has(scopeName)) scopeLines.set(scopeName,[])
			} else {
				scopeLines.get(scopeName)?.push(line)
			}
		}
		return scopeLines
	}
	constructor(name,lines) {
		this.name=name
		this.lines=lines
		this.cids=new Set()
		this.uids=new Map()
		this.usernames=new Map()
		let lastRange=undefined
		for (const line of lines) {
			let match
			if (match=line.match(/^\*(.*)$/)) {
				const [,statusString]=match
				this.status=statusString.trim()
				lastRange=undefined
				continue
			}
			try {
				const cid=osmRef.changeset(line)
				this.cids.add(cid)
				lastRange=undefined
				continue
			} catch {}
			try {
				const [type,value]=osmRef.user(line)
				const range=[null,null]
				if (type=='id') {
					this.uids.set(value,range)
					lastRange=range
				} else if (type=='name') {
					this.usernames.set(value,range)
					lastRange=range
				} else {
					lastRange=undefined
				}
				continue
			} catch {}
			if (match=line.match(/^\s+\[\s*([0-9-]+)\s*$/)) {
				const [,dateString]=match
				const timestamp=Date.parse(dateString)
				if (!Number.isInteger(timestamp)) continue
				if (!lastRange) continue
				lastRange[0]=timestamp
			}
		}
	}
	*getChangesets(store,userStore,changesetStore) {
		const collectedUids=new Map(this.uids)
		for (const [uid,userData] of Object.entries(userStore)) {
			if (this.usernames.has(userData.displayName)) {
				collectedUids.set(uid,this.usernames.get(displayName))
			}
		}
		const collectedCids=new Set(this.cids)
		for (const [uid,range] of collectedUids) {
			for (const cid of userStore[uid]?.changesets??[]) {
				if (range[0]!=null) {
					if (!changesetStore[cid]) continue
					if (changesetStore[cid].created_at<range[0]) continue
				}
				collectedCids.add(cid)
			}
		}
		const sortedCids=[...collectedCids]
		sortedCids.sort((x,y)=>(x-y))
		for (const cid of sortedCids) {
			if (cid in store.changeset) yield [cid,store.changeset[cid]]
		}
	}
	static fileSyntaxDescription=`<p>Markdown-like syntax with file read line-by line. Line starting with <kbd>#</kbd> followed by a scope name starts a scope section. Lines inside a section can be:
<ul>
<li><kbd>*</kbd> followed by a status indicator (currently any string) - used to mark which scopes were processed
<li>changeset id or url - to include this changeset in the scope
<li>user id (preceded by <kbd>uid</kbd> because otherwise it's interpreted as a changeset id) or url - to include this user's changesets in the scope, all of them unless filtered by a range
<li>whitespace followed by <kbd>[</kbd> followed by date (YYYY, YYYY-MM or YYYY-MM-DD) after user line - to set the range lower bound by month
</ul>
</details>
`
}
