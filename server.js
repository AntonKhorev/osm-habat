const fs=require('fs')
const http=require('http')
const url=require('url')
const open=require('open')

const e=require('./escape')
const User=require('./user')

function respondHead(response,title) {
	response.writeHead(200,{'Content-Type':'text/html'})
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

const server=http.createServer((request,response)=>{
	const path=url.parse(request.url).pathname
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
				response.write(e.h`<tr><td><a href=${'/user/'+uid}>${uid}</a><td>${user.displayName}<td>${user.changesets.length+'/'+user.changesetsCount}<td>${user.updateTimestamp}\n`)
			}
			response.write(`</table>\n`)
			respondTail(response)
		})
	} else {
		response.writeHead(404)
		response.end('Route not defined')
	}
}).listen(process.env.PORT||0).on('listening',()=>{
	if (!process.env.PORT) open('http://localhost:'+server.address().port)
})
