import * as fs from 'fs'
import * as path from 'path'

import * as e from './escape.js' // TODO move somewhere else along with getUserLink()
import * as osm from './osm.js'

const getFileLines=(filename)=>String(fs.readFileSync(filename)).split(/\r\n|\r|\n/)

export default class Project {
	constructor(dirname) {
		this.dirname=dirname
		if (fs.existsSync(dirname)) {
			if (!fs.lstatSync(dirname).isDirectory()) throw new Error(`project path ${dirname} exists as a file instead of a directory`)
		} else {
			fs.mkdirSync(dirname)
		}
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
			Object.assign( // keeps newly added blank props created by this.clearPendingRedactions()
				this.pendingRedactions,
				JSON.parse(fs.readFileSync(this.pendingRedactionsFilename))
			)
		}
	}
	savePendingRedactions() {
		fs.writeFileSync(this.pendingRedactionsFilename,JSON.stringify(this.pendingRedactions,null,2))
	}
	backupAndClearPendingRedactions() {
		if (fs.existsSync(this.pendingRedactionsFilename)) {
			fs.renameSync(this.pendingRedactionsFilename,this.pendingRedactionsBackupFilename)
		}
		this.clearPendingRedactions()
	}
	isEmptyPendingRedactions() {
		for (const etype of ['node','way','relation']) {
			if (Object.keys(this.pendingRedactions[etype]).length>0) return false
		}
		return this.pendingRedactions.extra.length==0
	}
	redactElementVersionsAndTags(etype,eid,evs,tags) {
		if (!this.pendingRedactions[etype][eid]) {
			this.pendingRedactions[etype][eid]={versions:{},tags:{}}
		}
		const prElement=this.pendingRedactions[etype][eid]
		const timestamp=Date.now()
		let changed=false
		const recordLastChange=(action,attribute,etype,eid,evtag)=>{
			if (!changed) {
				changed=true
				this.pendingRedactions.last=[]
			}
			this.pendingRedactions.last.push([action,attribute,etype,eid,evtag])
		}
		for (const ev of evs) {
			if (prElement.versions[ev]) continue
			prElement.versions[ev]=timestamp
			recordLastChange('create','version',etype,eid,ev)
		}
		for (const tag of tags) {
			if (prElement.tags[tag]) continue
			prElement.tags[tag]=timestamp
			recordLastChange('create','tag',etype,eid,tag)
		}
	}
	unredactElement(etype,eid) {
		if (!this.pendingRedactions[etype][eid]) return
		const prElement=this.pendingRedactions[etype][eid]
		this.pendingRedactions.last=[]
		for (const ev in this.pendingRedactions[etype][eid].versions) {
			this.pendingRedactions.last.push(['delete','version',etype,eid,Number(ev)])
		}
		for (const tag in this.pendingRedactions[etype][eid].tags) {
			this.pendingRedactions.last.push(['delete','tag',etype,eid,tag])
		}
		delete this.pendingRedactions[etype][eid]
	}
	getElementPendingRedactions(etype,eid) {
		return this.pendingRedactions[etype][eid]??{versions:{},tags:{}}
	}
	/** @yields {[attribute:string, etype:string, eid:number, evtag:(number|string), timestamp:number]} */
	*listPendingRedactions() {
		for (const etype of ['node','way','relation']) {
			for (const [eid,prElement] of Object.entries(this.pendingRedactions[etype])) {
				for (const [ev,timestamp] of Object.entries(prElement.versions)) {
					yield ['version',etype,Number(eid),Number(ev),timestamp]
				}
				for (const [etag,timestamp] of Object.entries(prElement.tags)) {
					yield ['tag',etype,Number(eid),etag,timestamp]
				}
			}
		}
	}
	marshallPendingRedactions() {
		let result=''
		for (const etype of ['node','way','relation']) {
			for (const [eid,prElement] of Object.entries(this.pendingRedactions[etype])) {
				for (const ev in prElement.versions) {
					if (Number(ev)) result+=`${etype}/${eid}/${ev}\n`
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
			extra:[],
		}
	}
	addExtraElementToPendingRedactions(etype,eid) {
		for (const [etype1,eid1] of this.pendingRedactions.extra) {
			if (etype1==etype && eid1==eid) return
		}
		this.pendingRedactions.extra.push([etype,eid])
	}
	removeExtraElementFromPendingRedactions(etype,eid) {
		for (let i=0;i<this.pendingRedactions.extra.length;i++) {
			const [etype1,eid1]=this.pendingRedactions.extra[i]
			if (etype1==etype && eid1==eid) {
				this.pendingRedactions.extra.splice(i,1)
				return
			}
		}
	}
}
