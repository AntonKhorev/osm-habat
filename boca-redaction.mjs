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
}
