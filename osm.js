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
	changeset:{},
	node:{},
	way:{},
	relation:{},
})

exports.readStore=(storeFilename)=>{
	if (!fs.existsSync(storeFilename)) return osm.makeStore()
	const store=JSON.parse(fs.readFileSync(storeFilename))
	for (const [k1,k2] of [
		['changes','changeset'],
		['change','changeset'],
		['nodes','node'],
		['ways','way'],
		['relations','relation'],
	]) {
		if ((k1 in store) && !(k2 in store)) {
			store[k2]=store[k1]
			delete store[k1]
		}
	}
	return store
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
	let changeType,changesetId,changesetChanges
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
	const combineChangeset=(elementType)=>{
		if (changesetId===undefined) {
			changesetId=changeset
		} else if (changesetId!=changeset) {
			changesetId=-1
		}
		changesetChanges.push([changeType,elementType,id,version])
	}
	return (new expat.Parser()).on('startElement',(name,attrs)=>{
		if (name=='osm') {
			inOsmXml++
		} else if (name=='osmChange') {
			inOsmChangeXml++
			changesetChanges=[]
		} else if (name=='create' || name=='modify' || name=='delete') {
			if (inOsmChangeXml>0) {
				changeType=name
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
			if (changesetId!==undefined && changesetId>=0) {
				store.changeset[changesetId]=changesetChanges
			}
			changesetId=changesetChanges=undefined
			inOsmChangeXml--
		} else if (name=='create' || name=='modify' || name=='delete') {
			if (inOsmChangeXml>0) {
				changeType=undefined
				inOsmXml--
			}
		} else if (name=='node') {
			if (inOsmXml>0) {
				if (inOsmChangeXml>0) combineChangeset(name)
				put(store.node,id,version,{changeset,timestamp,uid,visible,tags,lat,lon})
				               id=version= changeset=timestamp=uid=visible=tags=lat=lon=undefined
				inNodeXml--
			}
		} else if (name=='way') {
			if (inOsmXml>0) {
				if (inOsmChangeXml>0) combineChangeset(name)
				put(store.way,id,version,{changeset,timestamp,uid,visible,tags,nds})
				              id=version= changeset=timestamp=uid=visible=tags=nds=undefined
				inWayXml--
			}
		} else if (name=='relation') {
			if (inOsmXml>0) {
				if (inOsmChangeXml>0) combineChangeset(name)
				put(store.relation,id,version,{changeset,timestamp,uid,visible,tags,members})
				                   id=version= changeset=timestamp=uid=visible=tags=members=undefined
				inRelationXml--
			}
		}
	})
}

exports.fetchToStore=(store,call)=>new Promise((resolve,reject)=>osm.apiGet(call,res=>{
	if (res.statusCode!=200) return reject(new Error('failed single fetch: '+call))
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

exports.fetchUserToStore=(userStore,uid)=>new Promise((resolve,reject)=>osm.apiGet(`/api/0.6/user/${uid}.json`,res=>{
	const updateTimestamp=Date.now()
	if (res.statusCode!=200 && res.statusCode!=410) {
		return reject(new Error(`failed user fetch uid ${uid}`))
	}
	if (!(uid in userStore)) {
		userStore[uid]={
			changesets:[],
			id:uid,
			updateTimestamp,
		}
	}
	if (res.statusCode==410) {
		Object.assign(userStore[uid],{
			gone:true,
			displayName:'user_'+uid,
			updateTimestamp,
			// changeset count is impossible to get this way
		})
		return resolve()
	}
	let json=''
	res.on('data',chunk=>{
		json+=chunk
	}).on('end',()=>{
		const parsed=JSON.parse(json)
		Object.assign(userStore[uid],{
			//id:parsed.user.id,
			displayName:parsed.user.display_name,
			changesetsCount:parsed.user.changesets.count,
			updateTimestamp,
		})
		resolve()
	})
}))

exports.fetchChangesetsToStore=(changesetStore,call)=>new Promise((resolve,reject)=>osm.apiGet(call,res=>{
	if (res.statusCode!=200) return reject(new Error(`failed changesets fetch`))
	let uid,lastCreatedAt
	const changesets=[]
	let changeset
	res.pipe((new expat.Parser()).on('startElement',(name,attrs)=>{
		if (name=='changeset' && attrs.open=='false') { // ignore open changesets b/c they may change
			changeset={tags:{}}
			for (const k of ['id','comments_count','changes_count','uid']) changeset[k]=Number(attrs[k])
			for (const k of ['created_at','closed_at']) changeset[k]=Date.parse(attrs[k])
			for (const k of ['min_lat','min_lon','max_lat','max_lon']) changeset[k]=attrs[k]
			uid=Number(attrs.uid)
			lastCreatedAt=attrs.created_at
		} else if (name=='tag') {
			if (changeset) {
				changeset.tags[attrs.k]=attrs.v
			}
		}
	}).on('endElement',(name)=>{
		if (name=='changeset') {
			changesets.push(changeset.id)
			changesetStore[changeset.id]=changeset
			changeset=undefined
		}
	}).on('end',()=>{
		resolve([changesets,uid,lastCreatedAt])
	}))
}))

exports.topVersion=(elementStore)=>{
	let maxVersion=undefined
	for (const k in elementStore) {
		const n=Number(k)
		if (n && (maxVersion==undefined || n>maxVersion)) maxVersion=n
	}
	return maxVersion
}
