import * as e from './escape.js'

const hrefProto={
	at(text) {
		return e.h`<a href=${this}>${text}</a>`
	},
	ah(html) {
		return e.h`<a href=${this}>`+html+`</a>`
	},
}

export const element=(etype,eid)=>({__proto__:hrefProto,
	toString() {
		return e.u`https://www.openstreetmap.org/${etype}/${eid}`
	},
	get history() { return {__proto__:hrefProto,
		toString() {
			return e.u`https://www.openstreetmap.org/${etype}/${eid}/history`
		},
	}},
	get deepHistory() { return {__proto__:hrefProto,
		toString() {
			return e.u`https://osmlab.github.io/osm-deep-history/#/${etype}/${eid}`
		},
	}},
	get deepDiff() { return {__proto__:hrefProto,
		toString() {
			return e.u`http://osm.mapki.com/history/${etype}.php?id=${eid}`
		},
	}},
})

export const node=(eid)=>element('node',eid)
export const way=(eid)=>element('way',eid)
export const relation=(eid)=>element('relation',eid)

export const elementVersion=(etype,eid,ev)=>({__proto__:hrefProto,
	toString() {
		return e.u`https://api.openstreetmap.org/api/0.6/${etype}/${eid}/${ev}.json`
	},
})

export const elementTimestamp=(etype,eid,timestamp)=>({ // not a href b/c don't know any obvious href
	get overpassTurboBefore() { return {__proto__:hrefProto,
		toString() {
			const timestampString=new Date(timestamp-1000).toISOString()
			const query=`[date:"${timestampString}"];\n${etype}(${eid});\nout meta geom;` // TODO escape overpass query
			return e.u`https://overpass-turbo.eu/map.html?Q=${query}`
		},
	}},
})

export const changeset=(cid)=>({__proto__:hrefProto,
	toString() {
		return e.u`https://www.openstreetmap.org/changeset/${cid}`
	},
})

export const key=(key)=>({__proto__:hrefProto,
	toString() {
		return e.u`https://wiki.openstreetmap.org/wiki/Key:${key}`
	},
})
export const tag=(key,value)=>({__proto__:hrefProto,
	toString() {
		return e.u`https://wiki.openstreetmap.org/wiki/Tag:${key+'='+value}`
	},
})
