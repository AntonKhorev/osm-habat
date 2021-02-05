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
				members.push([attrs.type,Number(attrs.ref),attrs.role])
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

exports.fetchToStore=(store,call)=>new Promise((resolve,reject)=>osm.apiGet(call,res=>{
	if (res.statusCode!=200) reject(new Error('failed single fetch: '+call))
	res.pipe(osm.makeParser(store).on('end',resolve))
}))

exports.multifetchToStore=async(store,multifetchList)=>{
	// get previous versions with known numbers for a list of elements
	// /api/0.6/nodes?nodes=123456v1,654321v2
	// uri has to be <8000 chars, <700 elements
	// will fail if requested version of any element is redacted
	const queries={}
	const queryCounts={}
	const fullQuery=(elementType)=>`/api/0.6/${elementType}s?${elementType}s=${queries[elementType]}`
	for (const [elementType,elementId,elementVersion] of multifetchList) {
		if (!queries[elementType]) {
			queries[elementType]=''
			queryCounts[elementType]=0
		}
		if (queryCounts[elementType]++) queries[elementType]+=','
		queries[elementType]+=elementId
		if (elementVersion!==undefined) queries[elementType]+='v'+elementVersion
		if (queryCounts[elementType]>700 || queries[elementType].length>7500) {
			await osm.fetchToStore(store,fullQuery(elementType))
			delete queries[elementType]
			delete queryCounts[elementType]
		}
	}
	for (const elementType of Object.keys(queries)) {
		await osm.fetchToStore(store,fullQuery(elementType))
	}
}
