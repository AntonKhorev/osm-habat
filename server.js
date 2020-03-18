const fs=require('fs')
const path=require('path')
const http=require('http')
const url=require('url')
const sanitize=require('sanitize-filename')
const expat=require('node-expat')
const open=require('open')

const e=require('./escape')
const User=require('./user')

function respondHead(response,title) {
	response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'})
	for (const line of [
		`<!DOCTYPE html>`,
		`<html lang=en>`,
		`<head>`,
		`<meta charset=utf-8>`,
		e.h`<title>${title}</title>`,
		`</head>`,
		`<body>`,
	]) {
		response.write(line)
		response.write('\n')
	}
}

function respondTail(response) {
	for (const line of [
		`</body>`,
		`</html>`,
	]) {
		response.write(line)
		response.write('\n')
	}
	response.end()
}

function parseUserChangesetMetadata(user,makeParser,callback) {
	const rec=(i)=>{
		if (i>=user.changesets.length) {
			callback()
			return
		}
		const id=user.changesets[i]
		const parser=makeParser(i).on('end',()=>{
			rec(i+1)
		})
		fs.createReadStream(path.join('changeset',sanitize(String(id)),'meta.xml')).pipe(parser)
	}
	rec(0)
}

function parseUserChangesetData(user,makeParser,callback) {
	const rec=(i)=>{
		if (i<0) {
			callback()
			return
		}
		const id=user.changesets[i]
		const filename=path.join('changeset',sanitize(String(id)),'data.xml')
		if (fs.existsSync(filename)) {
			const parser=makeParser(i).on('end',()=>{
				rec(i-1)
			})
			fs.createReadStream(filename).pipe(parser)
		} else {
			rec(i-1)
		}
	}
	rec(user.changesets.length-1) // have to go backwards because changesets are stored backwards
}

function reportUser(response,user,callback) {
	let currentYear,currentMonth
	const createdBys={}
	const sources={}
	const changesetsWithComments=[]
	const reportChanges=()=>{
		response.write(`<h2>Changes</h2>\n`)
		let mode='?'
		let nodeChanges={}
		let wayChanges={}
		let relationChanges={}
		let nodeVersions={}
		let wayVersions={}
		let relationVersions={}
		let nParsed=0
		const up=(ac,av,attrs)=>{
			const id=attrs.id
			const ver=Number(attrs.version)
			if (ac[id]===undefined) {
				ac[id]=mode
			} else {
				if (av[id]+1!=ver) ac[id]+='-'
				ac[id]+=mode
			}
			av[id]=ver
		}
		parseUserChangesetData(user,i=>{
			nParsed++
			return (new expat.Parser()).on('startElement',(name,attrs)=>{
				switch (name) {
				case 'create': mode='C'; break
				case 'modify': mode='M'; break
				case 'delete': mode='D'; break
				case 'node': up(nodeChanges,nodeVersions,attrs); break
				case 'way': up(wayChanges,wayVersions,attrs); break
				case 'relation': up(relationChanges,relationVersions,attrs); break
				}
			}).on('endElement',(name)=>{
				if (name=='create' || name=='modify' || name=='delete') {
					mode='?'
				}
			})
		},()=>{
			response.write(`<ul>\n`)
			response.write(e.h`<li>downloaded and parsed ${nParsed} changesets\n`)
			response.write(`<li><a href=changes.osm>changes josm file</a>\n`)
			response.write(`</ul>\n`)
			response.write(`<table>\n`)
			response.write(`<tr><th>change<th>nodes<th>ways<th>relations\n`)
			const changesTotal={}
			for (const [,c] of Object.entries(nodeChanges)) {
				if (changesTotal[c]===undefined) changesTotal[c]=[0,0,0]
				changesTotal[c][0]++
			}
			for (const [,c] of Object.entries(wayChanges)) {
				if (changesTotal[c]===undefined) changesTotal[c]=[0,0,0]
				changesTotal[c][1]++
			}
			for (const [,c] of Object.entries(relationChanges)) {
				if (changesTotal[c]===undefined) changesTotal[c]=[0,0,0]
				changesTotal[c][2]++
			}
			for (const change in changesTotal) {
				response.write(e.h`<tr><td>${change}<td>${changesTotal[change][0]}<td>${changesTotal[change][1]}<td>${changesTotal[change][2]}\n`)
			}
			response.write(`</table>\n`)
			callback()
		})
	}
	const reportEnd=()=>{
		response.write(`<h2>Editors</h2>\n`)
		response.write(`<dl>\n`)
		for (const editor in createdBys) {
			response.write(e.h`<dt>${editor} <dd>${createdBys[editor]} changesets\n`)
		}
		response.write(`</dl>\n`)
		response.write(`<h2>Sources</h2>\n`)
		response.write(`<dl>\n`)
		for (const source in sources) {
			response.write(e.h`<dt>${source} <dd>${sources[source]} changesets\n`)
		}
		response.write(`</dl>\n`)
		response.write(`<h2>Comments</h2>\n`)
		response.write(`<dl>\n`)
		response.write(`<dt>Changesets with comments <dd>`)
		if (changesetsWithComments.length==0) {
			response.write(`none`)
		}
		for (const id of changesetsWithComments) {
			response.write(e.h` <a href=${'https://www.openstreetmap.org/changeset/'+id}>${id}</a>`)
		}
		response.write(`\n`)
		response.write(`</dl>\n`)
		response.write(`<h2>Areas</h2>\n`)
		response.write(`<ul>\n`)
		response.write(`<li><a href=bbox.osm>bbox josm file</a>\n`)
		response.write(`</ul>\n`)
		reportChanges()
	}
	const encodedName=encodeURIComponent(user.displayName)
	const cEscapedName=user.displayName.replace(/\\/g,'\\\\').replace(/"/g,'\\"')
	response.write(e.h`<h1>User #${user.uid} <a href=${'https://www.openstreetmap.org/user/'+encodedName}>${user.displayName}</a></h1>\n`)
	response.write(e.h`<ul>\n`)
	response.write(e.h`<li>last update was on ${user.updateTimestamp}\n`)
	response.write(e.h`<li>downloaded metadata of ${user.changesets.length}/${user.changesetsCount} changesets\n`)
	const hdycHref=`http://hdyc.neis-one.org/?`+encodedName
	const osmchaHref=`https://osmcha.org/filters?filters=`+encodeURIComponent(`{"users":[{"label":"${cEscapedName}","value":"${cEscapedName}"}],"date__gte":[{"label":"","value":""}]}`)
	response.write(e.h`<li>external tools: <a href=${hdycHref}>hdyc</a> <a href=${osmchaHref}>osmcha</a></li>\n`)
	response.write(e.h`</ul>\n`)
	response.write(e.h`<h2>Changesets</h2>\n`)
	parseUserChangesetMetadata(user,i=>{
		const id=user.changesets[i]
		let dateString,createdBy,source
		return (new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='changeset') {
				dateString=attrs.created_at
				if (attrs.comments_count!='0') {
					changesetsWithComments.push(id)
				}
			} else if (name=='tag') {
				if (attrs.k=='created_by') createdBy=attrs.v
				if (attrs.k=='source') source=attrs.v
			}
		}).on('end',()=>{
			const date=new Date(dateString)
			if (i==0) {
				response.write(e.h`<dl>\n<dt>${dateString} <dd>last known changeset`)
			}
			if (currentYear!=date.getFullYear() || currentMonth!=date.getMonth()) {
				currentYear=date.getFullYear()
				currentMonth=date.getMonth()
				response.write(e.h`\n<dt>${currentYear}-${String(currentMonth+1).padStart(2,'0')} <dd>`)
			}
			response.write(e.h` <a href=${'https://www.openstreetmap.org/changeset/'+id}>${id}</a>`)
			if (!createdBy) createdBy='(unknown)'
			if (!source) source='(unknown)'
			createdBys[createdBy]=(createdBys[createdBy]||0)+1
			sources[source]=(sources[source]||0)+1
			if (i>=user.changesets.length-1) {
				response.write(e.h`\n<dt>${dateString} <dd>first known changeset`)
				response.write(`\n</dl>\n`)
			}
		})
	},reportEnd)
}

function respondBbox(response,user) {
	response.writeHead(200,{
		'Content-Type':'application/xml; charset=utf-8',
		'Content-Disposition':'attachment; filename="bbox.osm"',
	})
	response.write(`<?xml version="1.0" encoding="UTF-8"?>\n`)
	response.write(`<osm version="0.6" generator="osm-caser" download="never" upload="never">\n`)
	let k=0 // number of changesets with bbox
	parseUserChangesetMetadata(user,i=>(new expat.Parser()).on('startElement',(name,attrs)=>{
		if (name=='changeset' && attrs.min_lat && attrs.min_lon && attrs.max_lat && attrs.max_lon) {
			response.write(e.x`  <node id="-${k*4+1}" lat="${attrs.min_lat}" lon="${attrs.min_lon}" />\n`)
			response.write(e.x`  <node id="-${k*4+2}" lat="${attrs.max_lat}" lon="${attrs.min_lon}" />\n`)
			response.write(e.x`  <node id="-${k*4+3}" lat="${attrs.max_lat}" lon="${attrs.max_lon}" />\n`)
			response.write(e.x`  <node id="-${k*4+4}" lat="${attrs.min_lat}" lon="${attrs.max_lon}" />\n`)
			k++
		}
	}),()=>{
		for (let i=0;i<k;i++) {
			response.write(e.x`  <way id="-${i+1}">\n`)
			for (let j=0;j<=4;j++) {
				response.write(e.x`    <nd ref="-${i*4+1+j%4}" />\n`)
			}
			response.write(e.x`  </way>\n`)
		}
		response.end(`</osm>\n`)
	})
}

function respondChanges(response,user) {
	response.writeHead(200,{
		'Content-Type':'application/xml; charset=utf-8',
		'Content-Disposition':'attachment; filename="changes.osm"',
	})
	response.write(`<?xml version="1.0" encoding="UTF-8"?>\n`)
	response.write(`<osm version="0.6" generator="osm-caser">\n`)
	// id: [version,lat,lon,tags]
	let nodeData={}
	parseUserChangesetData(user,i=>{
		let mode='?'
		let inElement='?'
		let id,version,lat,lon
		let tags
		return (new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='create' || name=='modify' || name=='delete') {
				mode=name[0]
			} else if (name=='node') { // TODO way, relation
				inElement='n'
				id=attrs.id
				version=attrs.version
				lat=attrs.lat
				lon=attrs.lon
				tags={}
			} else if (name=='tag') {
				tags[attrs.k]=attrs.v
			}
		}).on('endElement',(name)=>{
			if (name=='create' || name=='modify' || name=='delete') {
				mode='?'
			} else if (name=='node') {
				if (mode=='d') {
					delete nodeData[id]
				} else if (mode=='c' || mode=='m') {
					nodeData[id]=[version,lat,lon,tags]
				}
				inElement='?'
			}
		})
	},()=>{
		for (const [id,[version,lat,lon,tags]] of Object.entries(nodeData)) {
			response.write(e.x`  <node id="${id}" version="${version}" lat="${lat}" lon="${lon}"`)
			let t=Object.entries(tags)
			if (t.length<=0) {
				response.write(`/>\n`)
			} else {
				response.write(`>\n`)
				for (const [k,v] of t) {
					response.write(e.x`    <tag k="${k}" v="${v}"/>\n`)
				}
				response.write(`  </node>\n`)
			}
		}
		response.end(`</osm>\n`)
	})
}

function matchUser(response,match) {
	const [,uid]=match
	if (!/^[1-9]\d*$/.test(uid)) {
		response.writeHead(404)
		response.end('User not found')
		return
	}
	const user=new User(uid)
	if (!user.exists) {
		response.writeHead(404)
		response.end('User not found')
		return
	}
	return user
}

const server=http.createServer((request,response)=>{
	const path=url.parse(request.url).pathname
	let match
	if (path=='/') {
		respondHead(response,'index')
		response.write(`<h1>Index</h1>\n`)
		response.write(`<ul>\n`)
		response.write(`<li><a href=/user/>users</a>\n`)
		response.write(`</ul>\n`)
		respondTail(response)
	} else if (path=='/user/') {
		respondHead(response,'users')
		response.write(`<h1>Users</h1>\n`)
		response.write(`<table>\n`)
		response.write(`<tr><th>id<th>name<th>changesets<th>updated on\n`)
		fs.readdir('user',(err,filenames)=>{
			for (const uid of filenames) {
				const user=new User(uid)
				response.write(e.h`<tr><td><a href=${'/user/'+uid+'/'}>${uid}</a><td>${user.displayName}<td>${user.changesets.length}/${user.changesetsCount}<td>${user.updateTimestamp}\n`)
			}
			response.write(`</table>\n`)
			respondTail(response)
		})
	} else if (match=path.match(new RegExp('^/user/([^/]*)/$'))) {
		const user=matchUser(response,match)
		if (!user) return
		respondHead(response,'user '+user.displayName)
		reportUser(response,user,()=>{
			respondTail(response)
		})
	} else if (match=path.match(new RegExp('^/user/([^/]*)/bbox.osm$'))) {
		const user=matchUser(response,match)
		if (!user) return
		respondBbox(response,user)
	} else if (match=path.match(new RegExp('^/user/([^/]*)/changes.osm$'))) {
		const user=matchUser(response,match)
		if (!user) return
		respondChanges(response,user)
	} else {
		response.writeHead(404)
		response.end('Route not defined')
	}
}).listen(process.env.PORT||0).on('listening',()=>{
	if (!process.env.PORT) open('http://localhost:'+server.address().port)
})
