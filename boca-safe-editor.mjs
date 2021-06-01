/**
 * @param targetTags - object with keys = target tag keys and any values
 * @param safeTags - object with keys,values = safe tags and their required values
 */
export function undoTagsIfSafe(targetTags,safeTags,store,etype,eid,evs,parent) {
	if (evs.length!=1) return null // want only one in-version
	if (parent) return null // don't want detected parents
	const estore=store[etype][eid]
	if (!estore.top) return null // want updated element
	const ev=[evs]
	if (estore.top.version!=ev) return null // want in-version to be the last one
	const edata=estore[ev]
	if (ev==1) {
		const requiredTags={...targetTags,...safeTags}
		for (const [k,v] of edata.tags) {
			if (requiredTags[k]==null) return null // want only target and safe tags
			delete requiredTags[k]
			if (safeTags[k]!=null) {
				if (v!=safeTags[k]) return null // want safe values
			}
		}
		if (Object.keys(requiredTags).length>0) return null // want all target and safe tags
		return {...safeTags}
	} else {
		return null // TODO
	}
}
