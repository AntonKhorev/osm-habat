import * as e from './escape.js'

export const osmchaFilterTag=e.independentValuesEscape(value=>{
	if (!Array.isArray(value)) value=[value]
	return '['+value.map(singleValue=>{
		const cEscapedValue=String(singleValue).replace(/\\/g,'\\\\').replace(/"/g,'\\"')
		return `{"label":"${cEscapedValue}","value":"${cEscapedValue}"}`
	}).join(',')+']'
})

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
	get osmcha() { return {__proto__:hrefProto,
		toString() {
			return e.u`https://osmcha.org/changesets/${cid}/`
		},
	}},
})

export const changesetOfUser=(cid,uid)=>({__proto__:changeset(cid),
	get osmcha() { return {__proto__:hrefProto,
		toString() {
			const osmchaFilter=osmchaFilterTag`{"uids":${uid},"date__gte":${''}}`
			return e.u`https://osmcha.org/changesets/${cid}/?filters=${osmchaFilter}`
		},
	}},
})

export const changesets=(cids)=>({ // not a href b/c don't know any obvious href
	get osmcha() { return {__proto__:hrefProto,
		toString() {
			const osmchaFilter=osmchaFilterTag`{"ids":${cids},"date__gte":${''}}`
			return e.u`https://osmcha.org/?filters=${osmchaFilter}`
		},
	}},
})

export const username=(uname)=>({__proto__:hrefProto,
	toString() {
		return e.u`https://www.openstreetmap.org/user/${uname}`
	},
	get hdyc() { return {__proto__:hrefProto,
		toString() {
			return e.u`https://hdyc.neis-one.org/?${uname}`
		},
	}},
})

export const user=(uid)=>({ // TODO api href
	get osmcha() { return {__proto__:hrefProto,
		toString() {
			const osmchaFilter=osmchaFilterTag`{"uids":${uid},"date__gte":${''}}`
			return e.u`https://osmcha.org/?filters=${osmchaFilter}`
		},
	}},
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
