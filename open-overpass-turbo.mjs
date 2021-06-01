// open overpass turbo at specified location
// for overpass url parameters see: https://github.com/tyrasd/overpass-turbo/blob/master/js/urlParameters.js

import open from 'open'
import * as e from './escape.js'
import * as osm from './osm.js'

if (process.argv[2]===undefined) {
	console.log('need to supply location url')
	process.exit(1)
} else {
	main(process.argv[2])
}

async function main(href) {
	let zoom,lat,lon
	const dates=new Map()
	let match
	if (match=href.match(new RegExp('#map=([0-9.]+)/(-?[0-9.]+)/(-?[0-9.]+)'))) {
		;[,zoom,lat,lon]=match
	}
	if (match=href.match(new RegExp('^'+e.escapeRegex('https://www.openstreetmap.org/note/')+'([0-9]+)'))) {
		const [,noteId]=match
		const note=await fetchNote(noteId)
		;[lon,lat]=note.geometry.coordinates
		const addDate=(prop,name)=>{
			const date=note.properties[prop]
			if (date==null) return
			dates.set(name,date)
		}
		addDate('date_created',"note created")
		addDate('closed_at',"note closed")
	}
	if (match=href.match(new RegExp('^'+e.escapeRegex('https://www.openstreetmap.org/changeset/')+'([0-9]+)'))) {
		const [,changesetId]=match
		const changeset=await fetchChangeset(changesetId)
		if (lat==null && changeset.minlat!=null && changeset.maxlat!=null) lat=(changeset.minlat+changeset.maxlat)/2
		if (lon==null && changeset.minlon!=null && changeset.maxlon!=null) lon=(changeset.minlon+changeset.maxlon)/2
		const addDate=(prop,name)=>{
			const date=changeset[prop]
			if (date==null) return
			dates.set(name,date)
		}
		addDate('created_at',"changeset created")
		addDate('closed_at',"changeset closed")
	}
	if (zoom==null) zoom=18
	if (lat==null || lon==null) throw new Error(`unknown format of url ${href}`)
	let openUrl=e.u`https://overpass-turbo.eu?C=${lat};${lon};${zoom}`
	if (dates.size>0) {
		let query=''
		for (const [name,date] of dates) {
			query+=`// ${name}\n`
			query+=`// [date:"${date}"]\n`
		}
		query+=`[out:json][timeout:25];\n`
		query+=`nwr({{bbox}});\n`
		query+=`out body;\n`
		query+=`>;\n`
		query+=`out skel qt;`
		openUrl+=e.u`&Q=${query}`
	}
	open(openUrl)
}

async function fetchNote(noteId) {
	return fetchApiJson(e.u`/api/0.6/notes/${noteId}.json`)
}

async function fetchChangeset(changesetId) {
	return (await fetchApiJson(e.u`/api/0.6/changeset/${changesetId}.json`)).elements[0]
}

async function fetchApiJson(call) {
	return new Promise((resolve,reject)=>osm.apiGet(call,res=>{
		if (res.statusCode!=200) reject(`json fetch error`)
		let unparsed=''
		res.on('data',chunk=>{
			unparsed+=chunk
		}).on('end',()=>{
			const parsed=JSON.parse(unparsed)
			resolve(parsed)
		})
	}))
}
