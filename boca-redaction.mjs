// this is pending redactions
// completed redactions are handled by Project class

export default class Redaction {
	constructor() {
		this.clear()
	}
	clear() {
		this.node={}
		this.way={}
		this.relation={}
		this.last=[]
		this.extra=[]
	}
	isEmpty() {
		for (const etype of ['node','way','relation']) {
			if (Object.keys(this[etype]).length>0) return false
		}
		return this.extra.length==0
	}
	/** @yields {[attribute:string, etype:string, eid:number, evtag:(number|string), timestamp:number]} */
	*list() {
		for (const etype of ['node','way','relation']) {
			for (const [eid,prElement] of Object.entries(this[etype])) {
				for (const [ev,timestamp] of Object.entries(prElement.versions)) {
					yield ['version',etype,Number(eid),Number(ev),timestamp]
				}
				for (const [etag,timestamp] of Object.entries(prElement.tags)) {
					yield ['tag',etype,Number(eid),etag,timestamp]
				}
			}
		}
	}
	marshall() {
		let result=''
		for (const etype of ['node','way','relation']) {
			for (const [eid,prElement] of Object.entries(this[etype])) {
				for (const ev in prElement.versions) {
					if (Number(ev)) result+=`${etype}/${eid}/${ev}\n`
				}
			}
		}
		return result
	}
	getElement(etype,eid) {
		return this[etype][eid]??{versions:{},tags:{}}
	}

	// manipulate elements
	redactElementVersionsAndTags(etype,eid,evs,tags) {
		if (!this[etype][eid]) {
			this[etype][eid]={versions:{},tags:{}}
		}
		const element=this[etype][eid]
		const timestamp=Date.now()
		let changed=false
		const recordLastChange=(action,attribute,etype,eid,evtag)=>{
			if (!changed) {
				changed=true
				this.last=[]
			}
			this.last.push([action,attribute,etype,eid,evtag])
		}
		for (const ev of evs) {
			if (element.versions[ev]) continue
			element.versions[ev]=timestamp
			recordLastChange('create','version',etype,eid,ev)
		}
		for (const tag of tags) {
			if (element.tags[tag]) continue
			element.tags[tag]=timestamp
			recordLastChange('create','tag',etype,eid,tag)
		}
	}
	unredactElement(etype,eid) {
		const element=this[etype][eid]
		if (!element) return
		this.last=[]
		for (const ev in element.versions) {
			this.last.push(['delete','version',etype,eid,Number(ev)])
		}
		for (const tag in element.tags) {
			this.last.push(['delete','tag',etype,eid,tag])
		}
		delete this[etype][eid]
	}
	addExtraElement(etype,eid) {
		for (const [etype1,eid1] of this.extra) {
			if (etype1==etype && eid1==eid) return
		}
		this.extra.push([etype,eid])
	}
	removeExtraElement(etype,eid) {
		for (let i=0;i<this.extra.length;i++) {
			const [etype1,eid1]=this.extra[i]
			if (etype1==etype && eid1==eid) {
				this.extra.splice(i,1)
				return
			}
		}
	}
}
