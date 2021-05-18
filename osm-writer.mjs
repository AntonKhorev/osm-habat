import * as e from './escape.js'

/**
 * Outputs osm xml for provided elements in provided store.
 * Output format: https://wiki.openstreetmap.org/wiki/OSM_XML
 * Currently doesn't support writing deletes or deleted versions.
 *
 * @param {function(string)} write - called to output part of xml file
 * @param elements - Pre-sorted array of either
 *     [etype,eid,ev]
 *     or
 *     [etype,eid,ev,ev2] - for writing modifications from version ev to version ev2
 */
export default function writeOsmFile(write,store,elements) {
	const getDataForEdit=(estore,ev,edit)=>{
		if (edit==null) {
			return [estore[ev],false]
		} else if (Number.isInteger(edit)) {
			const ev2=edit
			return [estore[ev2],true]
		} else {
			const tags=edit
			return [{...estore[ev],tags},true]
		}
	}
	write(`<?xml version="1.0" encoding="UTF-8"?>\n`)
	write(`<osm version="0.6" generator="osm-habat">\n`)
	for (const [etype,eid,ev,edit] of elements) {
		const emeta=store[etype][eid][ev]
		const [edata,isModified]=getDataForEdit(store[etype][eid],ev,edit)
		let importantAttrs=e.x`id="${eid}" version="${ev}" changeset="${emeta.changeset}" uid="${emeta.uid}"` // changeset and uid are required by josm to display element history
		if (isModified) importantAttrs+=' action="modify"'
		if (etype=='node') {
			write(`  <node `+importantAttrs+e.x` lat="${edata.lat}" lon="${edata.lon}"`)
			let t=Object.entries(edata.tags)
			if (t.length<=0) {
				write(`/>\n`)
			} else {
				write(`>\n`)
				for (const [k,v] of t) write(e.x`    <tag k="${k}" v="${v}"/>\n`)
				write(`  </node>\n`)
			}
		} else if (etype=='way') {
			write(`  <way `+importantAttrs+`>\n`)
			for (const id of edata.nds) {
				write(e.x`    <nd ref="${id}" />\n`)
			}
			for (const [k,v] of Object.entries(edata.tags)) {
				write(e.x`    <tag k="${k}" v="${v}"/>\n`)
			}
			write(`  </way>\n`)
		} else if (etype=='relation') {
			write(`  <relation `+importantAttrs+`>\n`)
			for (const [mtype,mid,mrole] of edata.members) {
				write(e.x`    <member type="${mtype}" ref="${mid}" role="${mrole}"/>\n`)
			}
			for (const [k,v] of Object.entries(edata.tags)) {
				write(e.x`    <tag k="${k}" v="${v}"/>\n`)
			}
			write(`  </relation>\n`)
		}
	}
	write(`</osm>\n`)
}
