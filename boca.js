// bunch-of-changesets analyser

const http=require('http')
const url=require('url')
const querystring=require('querystring')
const open=require('open')

const e=require('./escape')
const osm=require('./osm')

if (process.argv[2]===undefined) {
	console.log('need to supply store filename')
	return process.exit(1)
}
main(process.argv[2])

function main(storeFilename) {
	const store=osm.readStore(storeFilename)
	const server=http.createServer((request,response)=>{
		const path=url.parse(request.url).pathname
		if (path=='/') {
			serveRoot(response)
		} else if (path=='/load') {
			let body=''
			request.on('data',data=>{
				body+=data
				if (body.length>1e6) request.connection.destroy()
			}).on('end',()=>{
				const post=querystring.parse(body)
				serveLoad(response,store,storeFilename,post.changeset)
			})
		} else {
			response.writeHead(404)
			response.end('Route not defined')
		}
	}).listen(process.env.PORT||0).on('listening',()=>{
		if (!process.env.PORT) open('http://localhost:'+server.address().port)
	})
}

function serveRoot(response) {
	respondHead(response,'habat-boca')
	response.write(`<form method=post action=/load>\n`)
	response.write(`<label>Changeset to load: <input type=text name=changeset></label>\n`)
	response.write(`<button type=submit>Load from OSM</button>\n`)
	response.write(`</form>\n`)
	respondTail(response)
}

async function serveLoad(response,store,storeFilename,changesetId) {
	try {
		await downloadChangeset(store,changesetId)
	} catch {
		respondHead(response,'changeset request error')
		response.write(e.h`<p>cannot load changeset ${changesetId}\n`)
		response.write(e.h`<p><a href=/>return to main page</a></p>\n`)
		respondTail(response)
		return
	}
	osm.writeStore(storeFilename,store)
	response.writeHead(301,{'Location':'/'})
	response.end()
}

function respondHead(response,title) {
	response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'})
	response.write(
`<!DOCTYPE html>
<html lang=en>
<head>
<meta charset=utf-8>
<title>${title}</title>
</head>
<body>
`
	)
}

function respondTail(response) {
	response.write(
`</body>
</html>`
	)
	response.end()
}

async function downloadChangeset(store,changesetId) {
	return new Promise((resolve,reject)=>osm.apiGet(`/api/0.6/changeset/${changesetId}/download`,res=>{
		if (res.statusCode!=200) reject()
		res.pipe(osm.makeParser(store).on('end',resolve))
	}))
}
