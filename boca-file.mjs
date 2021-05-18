import * as fs from 'fs'

import writeOsmFile from './osm-writer.mjs'

export function serveStaticFile(response,pathname,contentType) {
	fs.readFile(new URL('.'+pathname,import.meta.url),(err,data)=>{
		response.writeHead(200,{
			'Content-Type':contentType,
			'Cache-Control':'public, max-age=604800, immutable',
		})
		response.end(data)
	})
}

export function servePatchedJsFile(response,pathname,patchPathname) {
	const contentType='text/javascript; charset=utf-8'
	fs.readFile(new URL('.'+pathname,import.meta.url),(err,data)=>{
		fs.readFile(new URL('.'+patchPathname,import.meta.url),(err,patchData)=>{
			response.writeHead(200,{
				'Content-Type':contentType,
				'Cache-Control':'public, max-age=604800, immutable',
			})
			response.write(data)
			response.write(`\n// patch from ${patchPathname}\n`)
			response.write(
				String(patchData).replace(/^export\s+/gm,'')
			)
			response.end()
		})
	})
}

export function servePatchedCssFile(response,pathname,patchModule) {
	const contentType='text/css; charset=utf-8'
	fs.readFile(new URL('.'+pathname,import.meta.url),(err,data)=>{
		response.writeHead(200,{
			'Content-Type':contentType,
			'Cache-Control':'public, max-age=604800, immutable',
		})
		response.end(
			String(data).replace(/\${(.*?)}/g,(_,s)=>patchModule[s])
		)
	})
}

export function serveOsmFile(response,store,elements) {
	response.writeHead(200,{'Content-Type':'application/xml; charset=utf-8'})
	writeOsmFile(s=>response.write(s),store,elements)
	response.end()
}
