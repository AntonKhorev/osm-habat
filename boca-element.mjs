import * as e from './escape.js'
import * as osm from './osm.js'
import * as osmLink from './osm-link.mjs'

// version states:
export const IN=Symbol('IN')
export const OUT=Symbol('OUT')
export const PARENT=Symbol('PARENT')
export const UNKNOWN=Symbol('UNKNOWN') // not fetched
export const NULL=Symbol('NULL') // doesn't exist, pre-version-1 state

export default function writeElementChanges(response,project,etype,eid,evs,parent) {
	// modification types:
	const CREATE=Symbol('CREATE')
	const MODIFY=Symbol('MODIFY')
	const DELETE=Symbol('DELETE')
	const featureKeys=new Set([ // https://wiki.openstreetmap.org/wiki/Map_features#Primary_features
		'aerialway','aeroway','amenity','barrier','boundary','building',
		'craft','emergency','entrance','geological','healthcare',
		'highway','historic','landuse','leisure','man_made','military',
		'natural','office','place','power','public_transport',
		'railway','route','shop','telecom','tourism','waterway'
		// 'sport'
		// 'water' - only with natural=water
	])
	const readableFeatureKeys=new Set([
		'amenity','barrier','emergency','leisure','man_made','place','tourism'
	])
	const getVersionTable=(etype,eid,evs,parent)=>{
		if (!project.store[etype][eid]) return [[UNKNOWN]]
		// [[state,eid,ev],...]
		// first state is always either UNKNOWN or NULL
		const versionTable=[]
		const targetVersions=new Set(evs)
		const minVersion=evs[0]??1 // start either from first provided version or from first version
		const maxVersion=osm.topVersion(project.store[etype][eid])
		if (parent) {
			versionTable.push([UNKNOWN])
			versionTable.push([PARENT,...parent])
		} else if (minVersion==1) {
			versionTable.push([NULL])
		} else if (minVersion!=null && project.store[etype][eid][minVersion-1]) {
			versionTable.push([UNKNOWN])
			versionTable.push([OUT,eid,minVersion-1])
		} else {
			versionTable.push([UNKNOWN])
		}
		for (let ev=minVersion;ev<=maxVersion;ev++) {
			if (!project.store[etype][eid][ev]) {
				// do nothing for now, could put UNKNOWN state
			} else {
				versionTable.push([targetVersions.has(ev)?IN:OUT,eid,ev])
			}
		}
		return versionTable
	}
	const collapseVersionTable=(versionTable)=>{
		const collapsedVersionTable=[]
		for (const entry of versionTable) {
			if (collapsedVersionTable.length>0) {
				const [state1]=collapsedVersionTable[collapsedVersionTable.length-1]
				const [state2]=entry
				if ((state1==IN)==(state2==IN)) collapsedVersionTable.pop()
			}
			collapsedVersionTable.push(entry)
		}
		return collapsedVersionTable
	}
	const iterateVersionTable=(etype,versionTable,fn)=>{
		for (let i=1;i<versionTable.length;i++) {
			const [cstate,cid,cv]=versionTable[i]
			const [pstate,pid,pv]=versionTable[i-1]
			const getData=(state,eid,ev)=>{
				if (state==UNKNOWN || state==NULL) return undefined
				return project.store[etype][eid][ev]
			}
			fn(
				cstate,cid,cv,getData(cstate,cid,cv),
				pstate,pid,pv,getData(pstate,pid,pv)
			)
		}
	}
	const isInteresting=(etype,versionTable)=>{
		let isUntagged=true
		let isV1only=true
		let isOwnV1=false
		let isVtopDeleted=false
		let isOwnVtop=false
		iterateVersionTable(etype,versionTable,(cstate,cid,cv,cdata)=>{
			isUntagged = isUntagged && (Object.keys(cdata.tags).length==0)
			isV1only = isV1only && (cstate!=PARENT && cv==1)
			isOwnV1 = isOwnV1 || (cstate==IN && cv==1)
			isVtopDeleted = !cdata.visible
			isOwnVtop = cstate==IN
		})
		return !(etype=='node' && isUntagged && isOwnV1 && (
			isV1only || isVtopDeleted || isOwnVtop
		))
	}
	const getChangeType=(v1,v2)=>{
		if (v1==null && v2!=null) return CREATE
		if (v1!=null && v2==null) return DELETE
		if (v1!=null && v2!=null && v1!=v2) return MODIFY
	}
	const mergeChangeType=(c1,c2)=>{
		if (!c1) return c2
		if (!c2) return c1
		if (c1==c2) return c1
		return MODIFY
	}
	const getChangeTypeString=(v1,v2)=>({
		[CREATE]:'create',
		[MODIFY]:'modify',
		[DELETE]:'delete',
	}[getChangeType(v1,v2)])
	const compareVersions=(
		etype,
		cstate,cid,cv,cdata,
		pstate,pid,pv,pdata
	)=>{
		const pVisible=pdata?pdata.visible:pstate!=NULL
		const diff={}
		if (!pVisible && cdata.visible) {
			diff.visible=CREATE
		} else if (pVisible && !cdata.visible) {
			diff.visible=DELETE
		}
		if (etype=='node') {
			const isMoved=(cdata.lat!=pdata?.lat || cdata.lon!=pdata?.lon)
			if (isMoved) diff.geometry=MODIFY
		} else if (etype=='way') {
			let isNodesChanged=false
			if (cdata.nds.length!=(pdata?pdata.nds.length:0)) {
				isNodesChanged=true
			} else {
				for (let i=0;i<cdata.nds.length;i++) {
					if (cdata.nds[i]!=pdata.nds[i]) {
						isNodesChanged=true
						break
					}
				}
			}
			if (isNodesChanged) diff.geometry=MODIFY // TODO not actually a geometry
		} else if (etype=='relation') {
			let isMembersChanged=false
			if (cdata.members.length!=(pdata?pdata.members.length:0)) {
				isMembersChanged=true
			} else {
				for (let i=0;i<cdata.members.length;i++) {
					const [c1,c2,c3]=cdata.members[i]
					const [p1,p2,p3]=pdata.members[i]
					if (c1!=p1 || c2!=p2 || c3!=p3) {
						isMembersChanged=true
						break
					}
				}
			}
			if (isMembersChanged) diff.geometry=MODIFY // TODO not actually a geometry
		}
		for (const k of Object.keys({...cdata.tags,...pdata?.tags})) {
			const change=getChangeType(pdata?.tags[k],cdata.tags[k])
			if (!change) continue
			diff.tags=mergeChangeType(diff.tags,change)
			if (k=='name') {
				diff.nameTags=mergeChangeType(diff.nameTags,change)
			} else if (featureKeys.has(k)) {
				diff.featureTags=mergeChangeType(diff.featureTags,change) // TODO not entirely correct, if feature tag exists and another another one gets added - should get MODIFY
			} else {
				diff.otherTags=mergeChangeType(diff.otherTags,change)
			}
		}
		return diff
	}
	const compareFirstAndLastVersions=(etype,collapsedVersionTable)=>{
		if (collapsedVersionTable.length<=1) return {} // don't compare fully unknown element b/c currently assumes c-versions to be known
		const [cstate,cid,cv]=collapsedVersionTable[collapsedVersionTable.length-1]
		const [pstate,pid,pv]=collapsedVersionTable[0]
		const getData=(state,eid,ev)=>{
			if (state==UNKNOWN || state==NULL) return undefined
			return project.store[etype][eid][ev]
		}
		return compareVersions(etype,
			cstate,cid,cv,getData(cstate,cid,cv),
			pstate,pid,pv,getData(pstate,pid,pv)
		)
	}
	const makeElementFeature=(edata)=>{
		const makeKvLink=(k,v)=>'<code>'+osmLink.key(k).at(k)+'='+osmLink.tag(k,v).at(v)+'</code>'
		const makeVLink=(k,v)=>{
			if (v=='yes') return makeKvLink(k,v)
			return osmLink.tag(k,v).at(v.replace(/_/g,' '))
		}
		const features=[]
		for (const [k,v] of Object.entries(edata.tags)) {
			if (!featureKeys.has(k)) continue
			if (readableFeatureKeys.has(k)) {
				features.push(makeVLink(k,v))
			} else {
				features.push(makeKvLink(k,v))
			}
		}
		return features.join(' ')
	}
	const makeElementDescription=(etype,edata)=>{
		if (Object.keys(edata.tags).length==0) return 'untagged '+etype
		const feature=makeElementFeature(edata)
		if (feature=='') {
			if (edata.tags.name!=null) return `"${edata.tags.name}"`
			return 'tagged '+etype
		} else {
			if (edata.tags.name!=null) return `${feature} "${edata.tags.name}"`
			return feature
		}
	}
	const makeChangeSummary=(etype,collapsedVersionTable)=>{
		const changeSummary=[]
		iterateVersionTable(etype,collapsedVersionTable,(
			cstate,cid,cv,cdata,
			pstate,pid,pv,pdata
		)=>{
			const diff=compareVersions(etype,
				cstate,cid,cv,cdata,
				pstate,pid,pv,pdata
			)
			if (diff.visible==CREATE) {
				const desc=makeElementDescription(etype,cdata)
				changeSummary.push(cstate==IN?`created ${desc}`:`(later recreated as ${desc})`)
			} else if (diff.visible==DELETE) {
				changeSummary.push(cstate==IN?'deleted':'(later deleted)')
			} else {
				const mods=[]
				if (diff.geometry==MODIFY) {
					if (etype=='node') mods.push('moved')
					if (etype=='way') mods.push('nodes changed')
					if (etype=='relation') mods.push('members changed')
				}
				if (diff.nameTags==CREATE) mods.push(`named "${cdata.tags.name}"`)
				if (diff.nameTags==MODIFY) mods.push(`renamed to "${cdata.tags.name}"`)
				if (diff.nameTags==DELETE) mods.push(`unnamed`)
				if (diff.featureTags==CREATE) mods.push(`type added as ${makeElementFeature(cdata)}`)
				if (diff.featureTags==MODIFY) mods.push(`type changed to ${makeElementFeature(cdata)}`)
				if (diff.featureTags==DELETE) mods.push(`type removed`)
				let t='tags'
				if (diff.nameTags || diff.featureTags) t='other tags'
				if (diff.otherTags==CREATE) mods.push(`${t} added`)
				if (diff.otherTags==MODIFY) mods.push(`${t} changed`)
				if (diff.otherTags==DELETE) mods.push(`${t} removed`)
				let changed=''
				for (let i=0;i<mods.length;i++) {
					if (i==0) {
						changed=mods[i]
					} else if (i==mods.length-1) {
						changed+=' and '+mods[i]
					} else {
						changed+=', '+mods[i]
					}
				}
				if (changed=='') changed='modified'
				changeSummary.push(cstate==IN?changed:`(later ${changed})`)
			}
		})
		const fullDiff=compareFirstAndLastVersions(etype,collapsedVersionTable)
		if (Object.keys(fullDiff).length==0) changeSummary.push('(returned to the original state)')
		return changeSummary
	}
	const makeElementHeaderHtml=(type,id)=>osmLink.element(type,id).at(`${type} #${id}`)
	const makeElementTableHtml=(type,id,ver)=>id?osmLink.elementVersion(type,id,ver).at(`${type[0]}${id}v${ver}`):''
	const makeTimestampHtml=(timestamp)=>{
		if (timestamp==null) return 'unknown'
		const pad=n=>n.toString().padStart(2,'0')
		const format=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
		return e.h`<time>${format(new Date(timestamp))}</time>`
	}
	const makeChangeCell=(pdata,v1,v2,writer=v=>e.h`${v}`)=>{
		if (!pdata) return [writer(v2)]
		return [writer(v2),getChangeTypeString(v1,v2)]
	}
	const makeRcOrNoRcLink=(mainAttrs,title,data={})=>{
		let dataAttrs=``
		for (const [k,v] of Object.entries(data)) {
			dataAttrs+=e.h` data-${k}=${v}`
		}
		return `<a `+mainAttrs+dataAttrs+e.h`>${title}</a>`
	}
	const makeRcLink=(request,title,data={})=>makeRcOrNoRcLink(
		e.h`class=rc href=${'http://127.0.0.1:8111/'+request}`,title,data
	)
	const makeNoRcLink=(title,data={})=>makeRcOrNoRcLink(
		e.h`class=norc href=#`,title,data
	)
	const iterateVersionTableWritingTds=(etype,versionTable,fn)=>iterateVersionTable(etype,versionTable,(
		cstate,cid,cv,cdata,pstate,pid,pv,pdata
	)=>{
		const tdClasses=[]
		if (cstate==IN) tdClasses.push('selected-version')
		let output=fn(cstate,cid,cv,cdata,pstate,pid,pv,pdata)
		if (Array.isArray(output)) {
			let tdClass
			[output,tdClass]=output
			if (tdClass!=null) tdClasses.push(tdClass)
		}
		let tdClassAttr=tdClasses.join(' ')
		if (tdClassAttr=='') tdClassAttr=null
		response.write(e.h`<td class=${tdClassAttr}>`+output)
	})
	const writeTable=(etype,eid,versionTable)=>{
		const iterate=(fn)=>iterateVersionTableWritingTds(etype,versionTable,fn)
		response.write(`<table>`)
		response.write(`\n<tr><th>element`)
		iterate((cstate,cid,cv)=>makeElementTableHtml(etype,cid,cv))
		response.write(`<td><button class=reloader formaction=fetch-history>Update history</button>`)
		response.write(`\n<tr><th>changeset`)
		iterate((cstate,cid,cv,cdata)=>osmLink.changeset(cdata.changeset).at(cdata.changeset))
		response.write(`<th>last updated on`)
		response.write(`\n<tr><th>timestamp`)
		iterate((cstate,cid,cv,cdata)=>makeTimestampHtml(cdata.timestamp))
		response.write(`<td>`+makeTimestampHtml(project.store[etype][eid]?.top?.timestamp))
		response.write(`\n<tr class=visible><th>visible`)
		iterate((cstate,cid,cv,cdata,pstate,pid,pv,pdata)=>makeChangeCell(pdata,pdata?.visible,cdata.visible,v=>(v?'yes':'no')))
		response.write(`<td class=act>`+makeRcLink(
			e.u`load_object?objects=${etype[0]+eid}`,
			`[load]`
		))
		if (etype=='way') {
			const makeNodeCell=(pdata,pnid,cnid)=>makeChangeCell(pdata,pnid,cnid,nid=>{
				if (nid) {
					return osmLink.element('node',nid).at(nid)
				} else {
					return ''
				}
			})
			response.write(`\n<tr><th>first node`)
			iterate((cstate,cid,cv,cdata,pstate,pid,pv,pdata)=>makeNodeCell(pdata,pdata?.nds[0],cdata.nds[0]))
			response.write(`\n<tr><th>last node`)
			iterate((cstate,cid,cv,cdata,pstate,pid,pv,pdata)=>makeNodeCell(pdata,pdata?.nds[pdata?.nds.length-1],cdata.nds[cdata.nds.length-1]))
			response.write(`\n<tr><th>`)
			iterate((cstate,cid,cv,cdata,pstate,pid,pv,pdata)=>{
				if (cstate!=OUT) return ''
				if (!pdata?.visible || !cdata.visible) return ''
				if (
					cdata.nds[0]==pdata?.nds[0] &&
					cdata.nds[cdata.nds.length-1]==pdata?.nds[pdata?.nds.length-1]
				) return ''
				const href=e.u`/siblings/${eid}/${cdata.changeset}/cpe`
				return e.h`<a href=${href}>check siblings</a>`
			})
		}
		response.write(`\n<tr><th>tags`)
		const allTags={}
		iterate((cstate,cid,cv,cdata)=>{
			Object.assign(allTags,cdata.tags)
			return ''
		})
		const writeUndoCell=(tag,tagChangeTracker,canLoad)=>{
			if (project.getElementPendingRedactions(etype,eid).tags[tag]) {
				response.write(e.h`<td><input type=checkbox name=tag value=${tag} checked disabled>edited</label>`)
			} else if (project.store[etype][eid].top) {
				const getLinks=()=>{
					const data={versions:tagChangeTracker.versions}
					let rcHref=e.u`load_object?objects=${etype[0]+eid}`
					if (tagChangeTracker.action!='hide') {
						rcHref+=e.u`&addtags=${tag}=${tagChangeTracker.value}`
					}
					if (canLoad) {
						let links=makeRcLink(
							rcHref,`[${tagChangeTracker.action}]`,data
						)
						if (tagChangeTracker.action=='hide') {
							links+=`<small>`+makeNoRcLink(
								`[${tagChangeTracker.action} w/o load]`,data
							)+`</small>`
						}
						return links
					} else {
						if (tagChangeTracker.action=='hide') {
							return makeNoRcLink(
								`[${tagChangeTracker.action} w/o load]`,data
							)
						} else {
							return `<small>updating tag on deleted element</small> `+makeRcLink(
								rcHref,`[${tagChangeTracker.action}]`,data
							)
						}
					}
				}
				response.write(e.h`<td class=act>`+getLinks()+e.h` - <label><input type=checkbox name=tag value=${tag}>edited</label>`)
			} else {
				response.write(`<td>update to enable ${tagChangeTracker.action}`)
			}
		}
		for (const k in allTags) {
			const tagChangeTracker=new TagChangeTracker(k)
			let tagClasses='tag'
			if (k=='name') tagClasses+=' target' // TODO let configure target tags
			response.write(e.h`\n<tr class=${tagClasses}><td>${k}`)
			let haveVersionToLoad=false
			iterate((cstate,cid,cv,cdata,pstate,pid,pv,pdata)=>{
				tagChangeTracker.trackChange(cstate,cv,cdata,pstate,pv,pdata)
				haveVersionToLoad=cdata.visible
				return makeChangeCell(pdata,pdata?.tags[k],cdata.tags[k])
			})
			if (tagChangeTracker.action) {
				writeUndoCell(k,tagChangeTracker,haveVersionToLoad)
			}
		}
		response.write(`\n<tr><th>redacted`)
		iterate((cstate,cid,cv,cdata,pstate,pid,pv,pdata)=>{
			if (project.redacted[etype][cid]?.[cv]!=null) {
				return e.h`${project.redacted[etype][cid][cv]}`
			} else if (cstate==IN || cstate==OUT) {
				let t=''
				let checked=false
				if (project.getElementPendingRedactions(etype,eid).versions[cv]) {
					t+='pending '
					checked=true
				}
				t+=e.h`<input type=checkbox name=version value=${cv} checked=${checked}>`
				return t
			} else {
				return ''
			}
		})
		response.write(`<td>`)
		response.write(`<button class='reloader redactor' formaction=redact>Redact selected</button>`)
		response.write(`<button class='reloader redactor' formaction=unredact>Unredact</button>`)
		response.write(`\n</table>\n`)
	}
	const versionTable=getVersionTable(etype,eid,evs,parent)
	const collapsedVersionTable=collapseVersionTable(versionTable)
	response.write(e.h`<details class='element' open=${isInteresting(etype,versionTable)}><summary>\n`)
	response.write(e.h`<h3 id=${etype[0]+eid}>`+makeElementHeaderHtml(etype,eid)+`</h3>\n`)
	const elementLinks=osmLink.element(etype,eid)
	response.write(`: `+elementLinks.history.at('history')+`, `+elementLinks.deepHistory.at('deep history')+`, `+elementLinks.deepDiff.at('deep diff')+`\n`)
	const changeSummary=makeChangeSummary(etype,collapsedVersionTable)
	if (changeSummary.length>0) response.write(': '+changeSummary.join('; ')+'\n')
	response.write(`</summary>\n`)
	response.write(`<form method=post>\n`)
	response.write(e.h`<input type=hidden name=type value=${etype}>\n`)
	response.write(e.h`<input type=hidden name=id value=${eid}>\n`)
	writeTable(etype,eid,versionTable)
	response.write(`</form>\n`)
	response.write(`</details>\n`)
}

export class TagChangeTracker {
	constructor(tagKey) {
		this.tagKey=tagKey
		this.versions=[]
		this.cleanValues=new Set()
		this.dirtyValues=new Set()
		this.clean=true
	}
	trackChange(cstate,cv,cdata,pstate,pv,pdata) {
		const cvalue=cdata?.tags[this.tagKey] ?? ''
		const pvalue=pdata?.tags[this.tagKey] ?? ''
		if (pstate==NULL) {
			this.cleanValues.add('')
		} else if (pstate==UNKNOWN) {
			this.cleanValues.add(cvalue)
		}
		if (cstate==OUT) {
			if (!cdata.visible) {
				this.cleanValues.add('')
				this.dirtyValues.delete('')
				this.clean=true
			} else if (this.cleanValues.has(cvalue)) {
				this.clean=true
			} else if (this.clean && !this.dirtyValues.has(cvalue)) {
				this.cleanValues.add(cvalue)
			} else {
				this.clean=false
				this.dirtyValues.add(cvalue)
				this.versions.push(cv)
			}
		} else if (cstate==IN) {
			if (!cdata.visible) {
				this.cleanValues.add('')
				this.dirtyValues.delete('')
				this.clean=true
			} else if (!this.cleanValues.has(cvalue)) {
				this.clean=false
				this.dirtyValues.add(cvalue)
				if (this.value==null) {
					this.value=pvalue
					this.isDelete=pstate==NULL
				}
				this.versions.push(cv)
			}
		}
	}
	get action() {
		if (this.versions.length==0) return undefined
		if (this.clean) return 'hide'
		if (this.isDelete) return 'delete'
		return 'undo'
	}
}
