const fs=require('fs')
const path=require('path')

const e=require('./escape') // TODO move somewhere else along with getUserLink()
const osm=require('./osm')

const getFileLines=(filename)=>String(fs.readFileSync(filename)).split(/\r\n|\r|\n/)

class Project {
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
	getUserLink(uid) { // TODO move somewhere else
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
				cids.add(cid)
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
}

module.exports=Project
