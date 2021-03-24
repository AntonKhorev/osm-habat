import * as fs from 'fs'
import * as path from 'path'

import * as e from './escape.js' // TODO move somewhere else along with getUserLink()
import * as osm from './osm.js'

const getFileLines=(filename)=>String(fs.readFileSync(filename)).split(/\r\n|\r|\n/)

export default class Project {
	constructor(dirname) {
		this.dirname=dirname
		this.store=osm.readStore(this.storeFilename)
		this.user={}
		if (fs.existsSync(this.usersFilename)) this.user=JSON.parse(fs.readFileSync(this.usersFilename))
		this.changeset={}
		if (fs.existsSync(this.changesetsFilename)) this.changeset=JSON.parse(fs.readFileSync(this.changesetsFilename))
		this.scope={}
		if (fs.existsSync(this.scopesFilename)) {
			let scope
			for (const line of getFileLines(this.scopesFilename)) {
				let match
				if (match=line.match(/^#+\s*(.*\S)\s*$/)) {
					[,scope]=match
					if (!(scope in this.scope)) this.scope[scope]=[]
				} else {
					this.scope[scope]?.push(line)
				}
			}
		}
		this.loadRedactions()
		this.loadPendingRedactions()
	}
	loadRedactions() {
		this.redacted={node:{},way:{},relation:{}}
		if (fs.existsSync(this.redactionsDirname)) {
			for (const filename of fs.readdirSync(this.redactionsDirname)) {
				for (const line of getFileLines(path.join(this.redactionsDirname,filename))) {
					let match
					if (match=line.match(/^(node|way|relation)\/(\d+)\/(\d+)$/)) {
						const [,etype,eid,ev]=match
						if (!this.redacted[etype][eid]) this.redacted[etype][eid]={}
						this.redacted[etype][eid][ev]=filename
					}
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
	get redactionsDirname() { return path.join(this.dirname,'redactions') }
	getUserLink(uid) { // TODO move somewhere else + use osmLinks module
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
				cids.add(Number(cid))
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

	// pending redactions
	get pendingRedactionsFilename() { return path.join(this.dirname,'pending-redactions.json') }
	get pendingRedactionsBackupFilename() { return path.join(this.dirname,'pending-redactions.backup.json') }
	loadPendingRedactions() {
		this.clearPendingRedactions()
		if (fs.existsSync(this.pendingRedactionsFilename)) {
			this.pendingRedactions=JSON.parse(fs.readFileSync(this.pendingRedactionsFilename))
		}
	}
	savePendingRedactions() {
		if (this.isEmptyPendingRedactions()) {
			if (fs.existsSync(this.pendingRedactionsFilename)) {
				fs.renameSync(this.pendingRedactionsFilename,this.pendingRedactionsBackupFilename)
			}
		} else {
			fs.writeFileSync(this.pendingRedactionsFilename,JSON.stringify(this.pendingRedactions,null,2))
		}
	}
	isEmptyPendingRedactions() {
		for (const etype of ['node','way','relation']) {
			if (Object.keys(this.pendingRedactions[etype]).length>0) return false
		}
		return true
	}
	redactElementVersions(etype,eid,evs) {
		if (!this.pendingRedactions[etype][eid]) {
			this.pendingRedactions[etype][eid]={}
		}
		const timestamp=Date.now()
		let changed=false
		for (const ev of evs) {
			if (this.pendingRedactions[etype][eid][ev]) continue
			if (!changed) {
				changed=true
				this.pendingRedactions.last=[]
			}
			this.pendingRedactions[etype][eid][ev]=timestamp
			this.pendingRedactions.last.push(['create',etype,eid,ev])
		}
	}
	unredactElement(etype,eid) {
		if (!this.pendingRedactions[etype][eid]) return
		this.pendingRedactions.last=[]
		for (const ev in this.pendingRedactions[etype][eid]) {
			this.pendingRedactions.last.push(['delete',etype,eid,ev])
		}
		delete this.pendingRedactions[etype][eid]
	}
	getElementPendingRedactions(etype,eid) {
		return this.pendingRedactions[etype][eid]??{}
	}
	marshallPendingRedactions() {
		let result=''
		for (const etype of ['node','way','relation']) {
			for (const [eid,evs] of Object.entries(this.pendingRedactions[etype])) {
				for (const ev of evs) {
					result+=`${etype}/${eid}/${ev}\n`
				}
			}
		}
		return result
	}
	clearPendingRedactions() {
		this.pendingRedactions={
			node:{},
			way:{},
			relation:{},
			last:[],
		}
	}
}
