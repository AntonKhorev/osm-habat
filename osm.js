const fs=require('fs')
const https=require('https')
const expat=require('node-expat')

const osm=exports

exports.apiGet=(call,...args)=>{
	const apiUrl=`https://api.openstreetmap.org`
	const getUrl=apiUrl+call
	console.log(`GET ${getUrl}`)
	https.get(getUrl,...args)
}

exports.makeStore=()=>({
	changes:{},
	nodes:{},
	ways:{},
	relations:{},
})

exports.readStore=(storeFilename)=>{
	if (fs.existsSync(storeFilename)) {
		return JSON.parse(fs.readFileSync(storeFilename))
	} else {
		return osm.makeStore()
	}
}

exports.writeStore=(storeFilename,store)=>{
	fs.writeFileSync(storeFilename,JSON.stringify(store))
}

exports.makeParser=(store)=>{
	const put=(table,id,version,data)=>{
		if (!(id in table)) table[id]={}
		table[id][version]=data
	}
	let inOsmXml=0
	let inOsmChangeXml=0
	let changetype,changechangeset,chgs
	let inNodeXml=0, inWayXml=0, inRelationXml=0
	let id,version,changeset,timestamp,uid,visible,tags,lat,lon,nds,members
	const getCommonAttrs=attrs=>{
		id=Number(attrs.id)
		version=Number(attrs.version)
		changeset=Number(attrs.changeset)
		timestamp=Date.parse(attrs.timestamp)
		uid=Number(attrs.uid)
		visible=(attrs.visible=='true')
		tags={}
	}
	const combineChangeset=(elementtype)=>{
		if (changechangeset===undefined) {
			changechangeset=changeset
		} else if (changechangeset!=changeset) {
			changechangeset=-1
		}
		chgs.push([changetype,elementtype,id,version])
	}
	return (new expat.Parser()).on('startElement',(name,attrs)=>{
		if (name=='osm') {
			inOsmXml++
		} else if (name=='osmChange') {
			inOsmChangeXml++
			chgs=[]
		} else if (name=='create' || name=='modify' || name=='delete') {
			if (inOsmChangeXml>0) {
				changetype=name
				inOsmXml++
			}
		} else if (name=='node') {
			if (inOsmXml>0) {
				inNodeXml++
				getCommonAttrs(attrs)
				lat=attrs.lat
				lon=attrs.lon
			}
		} else if (name=='way') {
			if (inOsmXml>0) {
				inWayXml++
				getCommonAttrs(attrs)
				nds=[]
			}
		} else if (name=='relation') {
			if (inOsmXml>0) {
				inRelationXml++
				getCommonAttrs(attrs)
				members=[]
			}
		} else if (name=='tag') {
			if (inNodeXml>0 || inWayXml>0 || inRelationXml>0) {
				tags[attrs.k]=attrs.v
			}
		} else if (name=='nd') {
			if (inWayXml>0) {
				nds.push(Number(attrs.ref))
			}
		} else if (name=='member') {
			if (inRelationXml>0) {
				members.push([attrs.type,Number(attrs.ref)])
			}
		}
	}).on('endElement',(name)=>{
		if (name=='osm') {
			inOsmXml--
		} else if (name=='osmChange') {
			if (changechangeset!==undefined && changechangeset>=0) {
				store.changes[changechangeset]=chgs
			}
			changechangeset=chgs=undefined
			inOsmChangeXml--
		} else if (name=='create' || name=='modify' || name=='delete') {
			if (inOsmChangeXml>0) {
				changetype=undefined
				inOsmXml--
			}
		} else if (name=='node') {
			if (inOsmXml>0) {
				if (inOsmChangeXml>0) combineChangeset(name)
				put(store.nodes,id,version,{changeset,timestamp,uid,visible,tags,lat,lon})
				                id=version= changeset=timestamp=uid=visible=tags=lat=lon=undefined
				inNodeXml--
			}
		} else if (name=='way') {
			if (inOsmXml>0) {
				if (inOsmChangeXml>0) combineChangeset(name)
				put(store.ways,id,version,{changeset,timestamp,uid,visible,tags,nds})
				               id=version= changeset=timestamp=uid=visible=tags=nds=undefined
				inWayXml--
			}
		} else if (name=='relation') {
			if (inOsmXml>0) {
				if (inOsmChangeXml>0) combineChangeset(name)
				put(store.relations,id,version,{changeset,timestamp,uid,visible,tags,members})
				                    id=version= changeset=timestamp=uid=visible=tags=members=undefined
				inRelationXml--
			}
		}
	})
}
