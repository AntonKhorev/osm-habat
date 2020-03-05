const http=require('http')
const url=require('url')
const open=require('open')

const makeHtmlPage=(title,contentLines)=>[
	`<!DOCTYPE html>`,
	`<html lang=en>`,
	`<head>`,
	`<meta charset=utf-8>`,
	`<title>${title}</title>`,
	`</head>`,
	`<body>`,
	...contentLines,
	`</body>`,
	`</html>`,
].join('\n')

function respondHead(response,title) {
	response.writeHead(200,{'Content-Type':'text/html'})
	for (const line of [
		`<!DOCTYPE html>`,
		`<html lang=en>`,
		`<head>`,
		`<meta charset=utf-8>`,
		`<title>${title}</title>`, // TODO escape
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
		respondTail(response)
	}
}).listen(process.env.PORT||0).on('listening',()=>{
	if (!process.env.PORT) open('http://localhost:'+server.address().port)
})
