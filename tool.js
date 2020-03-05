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

function apiGet(call,...args) {
	const apiUrl=`https://api.openstreetmap.org`
	const getUrl=apiUrl+call
	console.log(`GET ${getUrl}`)
	https.get(getUrl,...args)
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

class User {
	constructor(uid) {
		this.uid=uid
		this.dirName=path.join('user',sanitize(uid))
		fs.mkdirSync(this.dirName,{recursive:true})
	}
	get changesets() {
		if (this._changesets!==undefined) return this._changesets
		const filename=path.join(this.dirName,'changesets.txt')
		if (!fs.existsSync(filename)) return this._changesets=[]
		const changesetsString=fs.readFileSync(filename,'utf8')
		this._changesets=[]
		for (const id of changesetsString.split('\n')) {
			if (id!='') this._changesets.push(Number(id))
		}
		return this._changesets
	}
	mergeChangesets(changesets2) {
		const changesets1=this.changesets
		const resultingChangesets=[]
		for (let i1=0,i2=0;i1<changesets1.length||i2<changesets2.length;) {
			if (i1>=changesets1.length) {
				resultingChangesets.push(changesets2[i2++])
			} else if (i2>=changesets2.length) {
				resultingChangesets.push(changesets1[i1++])
			} else if (changesets1[i1]>changesets2[i2]) {
				resultingChangesets.push(changesets1[i1++])
			} else if (changesets1[i1]<changesets2[i2]) {
				resultingChangesets.push(changesets2[i2++])
			} else {
				resultingChangesets.push(changesets1[i1++])
				i2++
			}
		}
		this._changesets=resultingChangesets
		fs.writeFileSync(path.join(this.dirName,'changesets.txt'),this._changesets.join('\n')+'\n')
	}
	requestMetadata(callback) {
		apiGet(`/api/0.6/user/${this.uid}`,res=>{
			const userStream=fs.createWriteStream(path.join(this.dirName,'meta.xml'))
			res.pipe(userStream).on('finish',callback)
		})
	}
	readMetadata() {
		(new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='user') {
				this._displayName=attrs.display_name
			} else if (name=='changesets') {
				this._changesetsCount=Number(attrs.count)
			}
		}).parse(fs.readFileSync(path.join(this.dirName,'meta.xml'),'utf8'))
	}
	get displayName() {
		if (this._displayName!==undefined) return this._displayName
		this.readMetadata()
		return this._displayName
	}
	get changesetsCount() {
		if (this._changesetsCount!==undefined) return this._changesetsCount
		this.readMetadata()
		return this._changesetsCount
	}
	get updateTimestamp() {
		if (this._updateTimestamp!==undefined) return this._updateTimestamp
		this._updateTimestamp=fs.statSync(path.join(this.dirName,'meta.xml')).mtime
		return this._updateTimestamp
	}
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

function reportUser(uid) {
	const user=new User(uid)
	let currentYear,currentMonth
	let dateString
	const createdBys={}
	const reportEditors=()=>{
		console.log(x`<h2>Editors</h2>\n`)
		console.log(x`<dl>`)
		for (const editor in createdBys) {
			console.log(x`<dt>${editor} <dd>${createdBys[editor]} changesets`)
		}
		console.log(x`</dl>`)
	}
	const reportChangeset=(i)=>{
		if (i==0) {
			process.stdout.write(x`<dl>`)
		}
		if (i>=user.changesets.length) {
			process.stdout.write(x`\n<dt>${dateString} <dd> first known changeset`)
			process.stdout.write(x`\n</dl>\n`)
			reportEditors()
			return
		}
		const id=user.changesets[i]
		let createdBy
		fs.createReadStream(path.join('changeset',String(id),'meta.xml')).pipe(
			(new expat.Parser()).on('startElement',(name,attrs)=>{
				if (name=='changeset') {
					dateString=attrs.created_at
				} else if (name=='tag') {
					if (attrs.k=='created_by') createdBy=attrs.v
				}
			}).on('end',()=>{
				const date=new Date(dateString)
				if (i==0) {
					process.stdout.write(x`\n<dt>${dateString} <dd> last known changeset`)
				}
				if (currentYear!=date.getFullYear() || currentMonth!=date.getMonth()) {
					currentYear=date.getFullYear()
					currentMonth=date.getMonth()
					process.stdout.write(x`\n<dt>${currentYear}-${String(currentMonth+1).padStart(2,'0')} <dd>`)
				}
				process.stdout.write(x` <a href="https://www.openstreetmap.org/changeset/${id}">${id}</a>`)
				if (!createdBy) createdBy='unknown'
				createdBys[createdBy]=(createdBys[createdBy]||0)+1
				reportChangeset(i+1)
			})
		)
	}
	console.log(x`<h1>User #${user.uid} <a href="https://www.openstreetmap.org/user/${encodeURIComponent(user.displayName)}">${user.displayName}</a></h1>`)
	console.log(x`<ul>`)
	console.log(x`<li>last update was on ${user.updateTimestamp}`)
	console.log(x`<li>downloaded metadata of ${user.changesets.length}/${user.changesetsCount} changesets`)
	console.log(x`</ul>`)
	console.log(x`<h2>Changesets</h2>`)
	reportChangeset(0)
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
