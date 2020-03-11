// get changeset metadata w/ discussion
// https://api.openstreetmap.org/api/0.6/changeset/80065151?include_discussion=true

// get changeset metadata w/o discussion
// https://api.openstreetmap.org/api/0.6/changeset/80065151

// get changeset data
// https://api.openstreetmap.org/api/0.6/changeset/80065151/download

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
} else {
	console.log('invalid or missing command; available commands: add')
	return process.exit(1)
}
