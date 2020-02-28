// get changeset metadata w/ discussion
// https://api.openstreetmap.org/api/0.6/changeset/80065151?include_discussion=true

// get changeset metadata w/o discussion
// https://api.openstreetmap.org/api/0.6/changeset/80065151

// get changeset data
// https://api.openstreetmap.org/api/0.6/changeset/80065151/download

// get 100 latest changesets by user
// contains changeset metadata w/o comments
// https://api.openstreetmap.org/api/0.6/changesets?user=10659315

// get next 100 changesets                                                        vvvvvvvvvvvvvvvvvvvv this is created_at="2020-01-23T18:32:43Z" value of last returned changeset
// https://api.openstreetmap.org/api/0.6/changesets?user=10659315&time=2001-01-01,2020-01-23T18:32:43Z

// repeat until get empty result

// get user details by user id
// https://api.openstreetmap.org/api/0.6/user/10659315

const fs=require('fs')
const path=require('path')
const https=require('https')
const expat=require('node-expat')
const sanitize=require('sanitize-filename')

function apiGet(call,...args) {
	const apiUrl=`https://api.openstreetmap.org`
	const getUrl=apiUrl+call
	console.log(`GET ${getUrl}`)
	https.get(getUrl,...args)
}

function processUserChangesetsMetadata(inputStream,endCallback) {
	function xmlEscape(text) { // https://github.com/Inist-CNRS/node-xml-writer
		return text
			.replace(/&/g,'&amp;')
			.replace(/</g,'&lt;')
			.replace(/"/g,'&quot;')
			.replace(/\t/g,'&#x9;')
			.replace(/\n/g,'&#xA;')
			.replace(/\r/g,'&#xD;')
	}
	const parser=new expat.Parser()
	let changesetStream
	let uid
	const changesetIds=[]
	parser.on('startElement',(name,attrs)=>{
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
			if (attrs.uid) uid=attrs.uid
			changesetIds.push(attrs.id)
		}
		if (!changesetStream) return
		if (name=='tag') {
			changesetStream.write("  <tag")
			for (const attr in attrs) {
				changesetStream.write(` ${attr}="${xmlEscape(attrs[attr])}"`)
			}
			changesetStream.write("/>\n")
		}
	})
	parser.on('endElement',(name)=>{
		if (name=='changeset') {
			changesetStream.end("</changeset>\n</osm>\n")
			changesetStream=undefined
		}
	})
	parser.on('end',()=>{
		endCallback(uid,changesetIds)
	})
	inputStream.pipe(parser)
}

function addUser(userName) {
	// TODO check if already added
	// only doable by fetching changesets by display_name
	apiGet(`/api/0.6/changesets?display_name=${encodeURIComponent(userName)}`,res=>{
		if (res.statusCode!=200) {
			console.log(`cannot find user ${userName}`)
			return process.exit(1)
		}
		processUserChangesetsMetadata(res,(uid,changesetIds)=>{
			console.log(`about to add user #${uid} with currently read ${changesetIds.length} changesets metadata`)
			const dirName=path.join('user',sanitize(uid))
			fs.mkdirSync(dirName,{recursive:true})
			fs.writeFileSync(path.join(dirName,'changesets.txt'),changesetIds.join('\n')+'\n')
			apiGet(`/api/0.6/user/${uid}`,res=>{
				const userStream=fs.createWriteStream(path.join(dirName,'meta.xml'))
				res.pipe(userStream).on('finish',()=>{
					console.log(`wrote user #${uid} metadata`)
				})
			})
		})
	})
	//https.get(url,function(response){
	//	response.pipe(fs.createWriteStream(filename)).on('finish',singleCallback)
	//})
}

function reportUser(uid) {
	const dirName=path.join('user',sanitize(uid))
	const metaFilename=path.join(dirName,'meta.xml')
	const changesetsString=fs.readFileSync(path.join(dirName,'changesets.txt'),'utf8')
	const changesets=[]
	for (const id of changesetsString.split('\n')) {
		if (id!='') changesets.push(id)
	}
	const parser=new expat.Parser()
	let displayName
	let changesetsCount
	parser.on('startElement',(name,attrs)=>{
		if (name=='user') {
			displayName=attrs.display_name
		} else if (name=='changesets') {
			changesetsCount=attrs.count
		}
	})
	parser.on('end',()=>{
		console.log(`# User #${uid} [${displayName}](https://www.openstreetmap.org/user/${encodeURIComponent(displayName)})`)
		console.log()
		console.log(`* last update was on ${fs.statSync(metaFilename).mtime}`)
		console.log(`* downloaded metadata of ${changesets.length}/${changesetsCount} changesets`)
	})
	fs.createReadStream(metaFilename).pipe(parser)
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
} else if (cmd=='report') {
	const uid=process.argv[3]
	if (uid===undefined) {
		console.log('missing report argument')
		return process.exit(1)
	}
	reportUser(uid)
} else {
	console.log('invalid or missing command; available commands: add')
	return process.exit(1)
}
