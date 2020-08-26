const fs=require('fs')
const expat=require('node-expat')

const e=require('./escape')

const inputFilename=process.argv[2] // gpx or osm
const outputFilename=process.argv[3] // kml

const inputStream=fs.createReadStream(inputFilename)
const outputStream=fs.createWriteStream(outputFilename)

outputStream.write(`<?xml version="1.0" encoding="UTF-8"?>\n`)
outputStream.write(`<kml xmlns="http://earth.google.com/kml/2.2">\n`)
outputStream.write(`<Document>\n`)

let markLat,markLon,markName
let inGpx=0
let inGpxWpt=0
let inGpxWptName=0
let inOsm=0
let inOsmNode=0
const writeMark=()=>{
	outputStream.write(`  <Placemark>\n`)
	if (markName!==undefined) {
		outputStream.write(e.x`    <name>${markName}</name>\n`)
	}
	outputStream.write(e.x`    <Point><coordinates>${markLon},${markLat}</coordinates></Point>\n`)
	outputStream.write(`  </Placemark>\n`)
}
const parser=(new expat.Parser()).on('startElement',(name,attrs)=>{
	if (name=='gpx') {
		inGpx++
	} else if (inGpx>0 && name=='wpt') {
		inGpxWpt++
		markLat=attrs.lat
		markLon=attrs.lon
		markName=undefined
	} else if (inGpxWpt>0 && name=='name') {
		inGpxWptName++
		markName=''
	} else if (name=='osm') {
		inOsm++
	} else if (inOsm>0 && name=='node') {
		inOsmNode++
		markLat=attrs.lat
		markLon=attrs.lon
		markName=undefined
	} else if (inOsmNode>0 && name=='tag') {
		if (attrs.k=='name') markName=attrs.v
	}
}).on('endElement',(name)=>{
	if (name=='gpx') {
		inGpx--
	} else if (inGpx>0 && name=='wpt') {
		writeMark()
		markLat=markLon=markName=undefined
		inGpxWpt--
	} else if (inGpxWpt>0 && name=='name') {
		inGpxWptName--
	} else if (name=='osm') {
		inOsm--
	} else if (inOsm>0 && name=='node') {
		writeMark()
		markLat=markLon=markName=undefined
		inOsmNode--
	}
}).on('text',(text)=>{
	if (inGpxWptName>0) {
		markName+=text
	}
}).on('end',()=>{
	outputStream.write(`</Document>\n`)
	outputStream.write(`</kml>\n`)
})

inputStream.pipe(parser)
