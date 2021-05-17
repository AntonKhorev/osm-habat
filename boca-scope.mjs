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
		this.uids=new Set()
		this.usernames=new Set()
		for (const line of lines) {
			let match
			if (match=line.match(/^\*(.*)$/)) {
				const [,statusString]=match
				this.status=statusString.trim()
				continue
			}
			try {
				const cid=osmRef.changeset(line)
				this.cids.add(cid)
				continue
			} catch {}
			try {
				const [type,value]=osmRef.user(line)
				if (type=='id') {
					this.uids.add(value)
				} else if (type=='name') {
					this.usernames.add(value)
				}
				continue
			} catch {}
		}
	}
	*getChangesets(store,userStore) {
		const collectedUids=new Set(this.uids)
		for (const [uid,userData] of Object.entries(userStore)) {
			if (this.usernames.has(userData.displayName)) {
				collectedUids.add(uid)
			}
		}
		const collectedCids=new Set(this.cids)
		for (const uid of collectedUids) {
			for (const cid of userStore[uid]?.changesets??[]) {
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
<li>user id or url - to include all of this user's changesets in the scope
</ul>
</details>
`
}
