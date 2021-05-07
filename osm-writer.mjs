import * as e from './escape.js'

/**
 * Outputs osm xml for provided elements in provided store.
 * Output format: https://wiki.openstreetmap.org/wiki/OSM_XML
 * Currently doesn't support writing deletes or deleted versions.
 *
 * @param elements Pre-sorted array of either
 *     [etype,eid,ev]
 *     or
 *     [etype,eid,ev,ev2] - for writing modifications from version ev to version ev2
 */
export default function writeOsmFile(response,store,elements) {
	response.writeHead(200,{'Content-Type':'application/xml; charset=utf-8'})
	response.write(`<?xml version="1.0" encoding="UTF-8"?>\n`)
	response.write(`<osm version="0.6" generator="osm-habat">\n`)
	for (const [etype,eid,ev,ev2] of elements) {
		const emeta=store[etype][eid][ev]
		const edata=store[etype][eid][ev2??ev]
		let importantAttrs=e.x`id="${eid}" version="${ev}" changeset="${emeta.changeset}" uid="${emeta.uid}"` // changeset and uid are required by josm to display element history
		if (ev2!=null && ev!=ev2) importantAttrs+=' action="modify"'
		if (etype=='node') {
			response.write(`  <node `+importantAttrs+e.x` lat="${edata.lat}" lon="${edata.lon}"`)
			let t=Object.entries(edata.tags)
			if (t.length<=0) {
				response.write(`/>\n`)
			} else {
				response.write(`>\n`)
				for (const [k,v] of t) response.write(e.x`    <tag k="${k}" v="${v}"/>\n`)
				response.write(`  </node>\n`)
			}
		} else if (etype=='way') {
			response.write(`  <way `+importantAttrs+`>\n`)
			for (const id of edata.nds) {
				response.write(e.x`    <nd ref="${id}" />\n`)
			}
			for (const [k,v] of Object.entries(edata.tags)) {
				response.write(e.x`    <tag k="${k}" v="${v}"/>\n`)
			}
			response.write(`  </way>\n`)
		} else if (etype=='relation') {
			response.write(`  <relation `+importantAttrs+`>\n`)
			for (const [mtype,mid,mrole] of edata.members) {
				response.write(e.x`    <member type="${mtype}" ref="${mid}" role="${mrole}"/>\n`)
			}
			for (const [k,v] of Object.entries(edata.tags)) {
				response.write(e.x`    <tag k="${k}" v="${v}"/>\n`)
			}
			response.write(`  </relation>\n`)
		}
	}
	response.end(`</osm>\n`)
}
