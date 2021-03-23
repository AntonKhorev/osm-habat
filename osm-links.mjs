import * as e from './escape.js'

const hrefProto={
	at(text) {
		return e.h`<a href=${this}>${text}</a>`
	},
	ah(html) {
		return e.h`<a href=${this}>`+html+`</a>`
	},
}

export function element(etype,eid) {
	return {__proto__:hrefProto,
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
	}
}

export const node=(eid)=>element('node',eid)
export const way=(eid)=>element('way',eid)
export const relation=(eid)=>element('relation',eid)
