// open overpass turbo at specified location

import open from 'open'

if (process.argv[2]===undefined) {
	console.log('need to supply location url')
	process.exit(1)
} else {
	main(process.argv[2])
}

async function main(href) {
	let match
	if (match=href.match(new RegExp('#map=([0-9.]+)/([0-9.]+)/([0-9.]+)'))) {
		const [,zoom,lat,lon]=match
		open(`https://overpass-turbo.eu?C=${lat};${lon};${zoom}`) // https://github.com/tyrasd/overpass-turbo/blob/master/js/urlParameters.js
	} else {
		throw new Error(`unknown format of url ${href}`)
	}
}
