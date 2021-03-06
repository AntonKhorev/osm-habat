import * as fs from 'fs'
import * as path from 'path'

import * as e from './escape.js' // TODO move somewhere else along with getUserLink()
import * as osm from './osm.js'
import Redaction from './boca-redaction.mjs'
import Scope from './boca-scope.mjs'

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
		this.loadScopes()
		this.watchScopes()
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

	get storeFilename() { return path.join(this.dirname,'store.json') }
	get usersFilename() { return path.join(this.dirname,'users.json') }
	get changesetsFilename() { return path.join(this.dirname,'changesets.json') }
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
	*getChangesFromChangesets(changesets) {
		for (const [,changesetChanges] of changesets) {
			yield* changesetChanges
		}
	}

	// scopes
	get scopesFilename() { return path.join(this.dirname,'scopes.txt') }
	loadScopes() {
		this.scope=new Map()
		if (fs.existsSync(this.scopesFilename)) {
			const scopeLines=Scope.collectLinesByScopes(getFileLines(this.scopesFilename))
			for (const [name,lines] of scopeLines) {
				this.scope.set(name,new Scope(name,lines))
			}
		}
	}
	watchScopes() {
		fs.watchFile(this.scopesFilename,()=>{
			this.loadScopes()
		})
	}
	saveScopes() {
		// TODO
	}

	// pending redactions
	get pendingRedactionsFilename() { return path.join(this.dirname,'pending-redactions.json') }
	get pendingRedactionsBackupFilename() { return path.join(this.dirname,'pending-redactions.backup.json') }
	loadPendingRedactions() {
		this.pendingRedactions=new Redaction()
		if (fs.existsSync(this.pendingRedactionsFilename)) {
			Object.assign( // keeps newly added blank props created by Redaction ctor
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
		this.pendingRedactions.clear()
	}
}
