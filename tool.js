// get changeset metadata w/ discussion
// https://api.openstreetmap.org/api/0.6/changeset/80065151?include_discussion=true

// may need to get besides changesets:
// * previous versions of modified/deleted elements
// * current versions of changes elements
// * nodes in modified/deleted way - maybe their full histories
// * same for relation members

const fs=require('fs')
const path=require('path')
const sanitize=require('sanitize-filename')
const expat=require('node-expat')

const e=require('./escape')
const osm=require('./osm')
const User=require('./user')

function processUserChangesetsMetadata(inputStream,endCallback) {
	let changesetStream
	let uid,lastCreatedAt
	const changesetIds=[]
	inputStream.pipe(
		(new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='changeset' && attrs.id) {
				const dirName=path.join('changeset',sanitize(attrs.id))
				fs.mkdirSync(dirName,{recursive:true})
				changesetStream=fs.createWriteStream(path.join(dirName,'meta.xml'))
				changesetStream.write('<?xml version="1.0" encoding="UTF-8"?>\n')
				changesetStream.write('<osm version="0.6" generator="osm-caser">\n')
				changesetStream.write("<changeset")
				for (const attr in attrs) {
					changesetStream.write(e.x` ${attr}="${attrs[attr]}"`)
				}
				changesetStream.write(">\n")
				if (attrs.uid) uid=attrs.uid // TODO fail somehow if not present
				if (attrs.created_at) lastCreatedAt=attrs.created_at
				changesetIds.push(Number(attrs.id))
			}
			if (!changesetStream) return
			if (name=='tag') {
				changesetStream.write("  <tag")
				for (const attr in attrs) {
					changesetStream.write(e.x` ${attr}="${attrs[attr]}"`)
				}
				changesetStream.write("/>\n")
			}
		}).on('endElement',(name)=>{
			if (name=='changeset') {
				changesetStream.end("</changeset>\n</osm>\n")
				changesetStream=undefined
			}
		}).on('end',()=>{
			endCallback(uid,changesetIds,lastCreatedAt)
		})
	)
}

function addUser(userName) {
	// only doable by fetching changesets by display_name
	osm.apiGet(`/api/0.6/changesets?display_name=${encodeURIComponent(userName)}`,res=>{
		if (res.statusCode!=200) {
			console.log(`cannot find user ${userName}`)
			return process.exit(1)
		}
		processUserChangesetsMetadata(res,(uid,changesets)=>{
			const user=new User(uid)
			console.log(`about to add user #${uid} with currently read ${changesets.length} changesets metadata`)
			user.mergeChangesets(changesets)
			user.requestMetadata(()=>{
				console.log(`wrote user #${uid} metadata`)
			})
		})
	})
}

function updateUser(uid) {
	const user=new User(uid)
	const requestChangesets=(timestamp)=>{
		const nChangesetsToRequest=user.changesetsCount-user.changesets.length
		if (nChangesetsToRequest<=0) {
			console.log('got all changesets metadata')
			return
		}
		let requestPath=`/api/0.6/changesets?user=${encodeURIComponent(uid)}`
		if (timestamp!==undefined) {
			requestPath+=`&time=2001-01-01,${encodeURIComponent(timestamp)}`
		}
		osm.apiGet(requestPath,res=>{
			if (res.statusCode!=200) {
				console.log(`cannot read changesets metadata for user ${uid}`)
				return process.exit(1)
			}
			processUserChangesetsMetadata(res,(uid,changesets,timestamp)=>{
				user.mergeChangesets(changesets)
				if (changesets.length==0 || timestamp===undefined) return
				requestChangesets(timestamp)
			})
		})
	}
	user.requestMetadata(()=>{
		console.log(`rewrote user #${uid} metadata`)
		requestChangesets()
	})
}

function downloadUser(uid) {
	const user=new User(uid)
	const rec=i=>{
		if (i>=user.changesets.length) return
		const id=user.changesets[i]
		const dirName=path.join('changeset',sanitize(String(id)))
		const filename=path.join(dirName,'data.xml')
		if (fs.existsSync(filename)) { // TODO re-request if along with metadata if changeset wasn't closed
			rec(i+1)
		} else {
			osm.apiGet(`/api/0.6/changeset/${encodeURIComponent(id)}/download`,res=>{
				fs.mkdirSync(dirName,{recursive:true})
				res.pipe(fs.createWriteStream(filename)).on('finish',()=>rec(i+1))
			})
		}
	}
	rec(0)
}

function downloadPreviousUser(uid) {
	const user=new User(uid)
	const currentVersions={n:{},w:{},r:{}}
	const requiredVersions={n:{},w:{},r:{}}
	function downloadPreviousData() {
		// get previous versions with known numbers for a list of elements
		// /api/0.6/nodes?nodes=421586779v1,421586779v2
		// what if they are redacted? - shouldn't happen
		// uri has to be <8000 chars, <700 elements
		const queryQueue=[]
		for (const elementType of ['nodes','ways','relations']) {
			let query=''
			let queryCount=0
			const runQuery=()=>{
				if (queryCount<=0) return
				const fullQuery=`/api/0.6/${elementType}?${elementType}=${query}`
				queryQueue.push([elementType,fullQuery])
				query=''
				queryCount=0
			}
			const addToQuery=(id,version)=>{
				if (queryCount>700 || query.length>7500) runQuery()
				if (queryCount++) query+=','
				query+=`${id}v${version}`
			}
			const elementVersions=requiredVersions[elementType[0]]
			for (const [id,versions] of Object.entries(elementVersions)) {
				for (const version of Object.keys(versions)) {
					addToQuery(id,version)
				}
			}
			runQuery()
		}
		user.requestPreviousDataMultiple(queryQueue,()=>{})
	}
	function processChangesetData() {
		user.parseChangesetData(()=>{
			let mode='?'
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode=name[0]
				} else if (name=='node' || name=='way' || name=='relation') {
					const element=name[0]
					const id=attrs.id
					const version=Number(attrs.version)
					if (mode!='c' && currentVersions[element][id]!=version-1) {
						if (requiredVersions[element][id]===undefined) {
							requiredVersions[element][id]={}
						}
						requiredVersions[element][id][version-1]=true
					}
					currentVersions[element][id]=version
				}
			}).on('endElement',(name)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode='?'
				}
			})
		},downloadPreviousData)
	}
	function processPreviousData() {
		user.parsePreviousData(()=>{
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				if (name=='node' || name=='way' || name=='relation') {
					const element=name[0]
					const id=attrs.id
					const version=Number(attrs.version)
					currentVersions[element][id]=version
				}
			})
		},processChangesetData)
	}
	processPreviousData()
}

const cmd=process.argv[2]
if (cmd=='add') {
	const userString=process.argv[3]
	if (userString===undefined) {
		console.log('missing add argument')
		return process.exit(1)
	}
	try {
		const userUrl=new URL(userString)
		if (userUrl.host!='www.openstreetmap.org') {
			console.log(`unrecognized host ${userUrl.host}`)
			return process.exit(1)
		}
		const [,userPathDir,userPathEnd]=userUrl.pathname.split('/')
		if (userPathDir=='user') {
			const userName=decodeURIComponent(userPathEnd)
			console.log(`adding user ${userName}`)
			addUser(userName)
		} else {
			console.log('invalid url format')
			return process.exit(1)
		}
	} catch {
		console.log(`invalid add argument ${userString}`)
		return process.exit(1)
	}
} else if (cmd=='update') {
	const uid=process.argv[3]
	if (uid===undefined) {
		console.log('missing update argument')
		return process.exit(1)
	}
	updateUser(uid)
} else if (cmd=='download') {
	const uid=process.argv[3]
	if (uid===undefined) {
		console.log('missing download argument')
		return process.exit(1)
	}
	downloadUser(uid)
} else if (cmd=='download-previous') {
	const uid=process.argv[3]
	if (uid===undefined) {
		console.log('missing download argument')
		return process.exit(1)
	}
	downloadPreviousUser(uid)
} else {
	console.log('invalid or missing command; available commands: add')
	return process.exit(1)
}
