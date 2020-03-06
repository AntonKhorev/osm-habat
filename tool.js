// get changeset metadata w/ discussion
// https://api.openstreetmap.org/api/0.6/changeset/80065151?include_discussion=true

// get changeset metadata w/o discussion
// https://api.openstreetmap.org/api/0.6/changeset/80065151

// get changeset data
// https://api.openstreetmap.org/api/0.6/changeset/80065151/download

const fs=require('fs')
const path=require('path')
const expat=require('node-expat')
const sanitize=require('sanitize-filename')

function xmlEscape(text) { // https://github.com/Inist-CNRS/node-xml-writer
	return String(text)
		.replace(/&/g,'&amp;')
		.replace(/</g,'&lt;')
		.replace(/"/g,'&quot;')
		.replace(/\t/g,'&#x9;')
		.replace(/\n/g,'&#xA;')
		.replace(/\r/g,'&#xD;')
}

function x(strings,...unescapedStrings) {
	let result=strings[0]
	for (let i=0;i<unescapedStrings.length;i++) {
		result+=xmlEscape(unescapedStrings[i])+strings[i+1]
	}
	return result
}

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
					changesetStream.write(` ${attr}="${xmlEscape(attrs[attr])}"`)
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
					changesetStream.write(` ${attr}="${xmlEscape(attrs[attr])}"`)
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
	apiGet(`/api/0.6/changesets?display_name=${encodeURIComponent(userName)}`,res=>{
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
		apiGet(requestPath,res=>{
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
} else {
	console.log('invalid or missing command; available commands: add')
	return process.exit(1)
}
