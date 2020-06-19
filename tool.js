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
				changesetStream.write('<osm version="0.6" generator="osm-habat">\n')
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

function updateUser(uid,callback) {
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
				if (changesets.length==0 || timestamp===undefined) {
					callback()
					return
				}
				requestChangesets(timestamp)
			})
		})
	}
	user.requestMetadata(()=>{
		console.log(`rewrote user #${uid} metadata`)
		requestChangesets()
	})
}

function downloadUser(uid,callback) {
	const user=new User(uid)
	const rec=i=>{
		if (i>=user.changesets.length) {
			callback()
			return
		}
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

function downloadPreviousUser(uid,callback) {
	const user=new User(uid)
	const availableVersions={n:{},w:{},r:{}}
	const requiredVersions={n:{},w:{},r:{}}
	const vCheck=(arr,element,id,version)=>{
		if (arr[element][id]===undefined) return false
		return arr[element][id][version]
	}
	const vSet=(arr,element,id,version)=>{
		if (arr[element][id]===undefined) {
			arr[element][id]={}
		}
		arr[element][id][version]=true
	}
	function downloadPreviousData() {
		const request=user.beginRequestPreviousData()
		for (const elementType of ['nodes','ways','relations']) {
			const elementVersions=requiredVersions[elementType[0]]
			for (const [id,versions] of Object.entries(elementVersions)) {
				for (const version of Object.keys(versions)) {
					request.add(elementType,id,version)
				}
			}
		}
		request.run(callback)
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
					if (mode!='c' && !vCheck(availableVersions,element,id,version-1)) {
						vSet(requiredVersions,element,id,version-1)
					}
					vSet(availableVersions,element,id,version)
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
					vSet(availableVersions,element,id,version)
				}
			})
		},processChangesetData)
	}
	processPreviousData()
}

function downloadReferencedUser(uid,callback) {
	const user=new User(uid)
	const existingNodes={}
	const wayNodes={}
	function downloadReferencedData() {
		// TODO check already downloaded
		const requiredNodes={}
		for (const [,nodes] of Object.entries(wayNodes)) {
			for (const node of nodes) {
				if (!existingNodes[node]) requiredNodes[node]=true
			}
		}
		const request=user.beginRequestReferencedData()
		for (const id in requiredNodes) request.add('nodes',id)
		request.run(callback)
	}
	function processReferencedData() {
		user.parseReferencedData(()=>{
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				if (name=='node') {
					existingNodes[attrs.id]=true
				}
			})
		},downloadReferencedData)
	}
	function processChangesetData() {
		user.parseChangesetData(()=>{
			let mode
			let id,nodes
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode=name
				} else if (name=='node') {
					if (mode!='delete') {
						existingNodes[attrs.id]=true
					}
				} else if (name=='way') { // TODO relation
					id=attrs.id
					nodes=[]
				} else if (name=='nd') {
					nodes.push(attrs.ref)
				}
			}).on('endElement',(name)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode=undefined
				} else if (name=='way') { // TODO relation
					if (mode=='delete') {
						delete wayNodes[id] // TODO keep whatever necessary for deletions.osm
					} else {
						wayNodes[id]=nodes
					}
					id=nodes=undefined
				}
			})
		},processReferencedData)
	}
	processChangesetData()
}

function downloadAllUser(uid,callback) {
	downloadUser(uid,
		()=>downloadPreviousUser(uid,
			()=>downloadReferencedUser(uid,callback)
		)
	)
}

const cmd=process.argv[2]
const dumbCommands={
	'update': updateUser,
	'download': downloadUser,
	'download-previous': downloadPreviousUser,
	'download-referenced': downloadReferencedUser,
	'download-all': downloadAllUser,
}
const handleDumbCmds=()=>{
	for (const [cmdName,cmdFn] of Object.entries(dumbCommands)) {
		if (cmd==cmdName) {
			const uid=process.argv[3]
			if (uid===undefined) {
				console.log(`missing ${cmd} argument`)
				return process.exit(1)
			}
			cmdFn(uid,()=>{})
			return
		}
	}
	console.log('invalid or missing command; available commands: add, '+Object.keys(dumbCommands).join(', '))
	return process.exit(1)
}
if (cmd=='add') {
	const userString=process.argv[3]
	if (userString===undefined) {
		console.log('missing add argument')
		return process.exit(1)
	}
	try {
		const userUrl=new URL(userString)
		if (userUrl.host=='www.openstreetmap.org') {
			const [,userPathDir,userPathEnd]=userUrl.pathname.split('/')
			if (userPathDir=='user') {
				const userName=decodeURIComponent(userPathEnd)
				console.log(`adding user ${userName}`)
				addUser(userName)
			} else {
				console.log('invalid url format')
				return process.exit(1)
			}
		} else if (userUrl.host=='hdyc.neis-one.org') {
			const userName=decodeURIComponent(userUrl.search).substr(1)
			console.log(`adding user ${userName}`)
			addUser(userName)
		} else {
			console.log(`unrecognized host ${userUrl.host}`)
			return process.exit(1)
		}
	} catch {
		console.log(`invalid add argument ${userString}`)
		return process.exit(1)
	}
} else {
	handleDumbCmds()
}
