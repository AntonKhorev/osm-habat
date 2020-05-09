const fs=require('fs')
const path=require('path')
const expat=require('node-expat')

const e=require('./escape')

const inputFilename=process.argv[2] // gpx
const outputFilename=process.argv[3] // kml

const inputStream=fs.createReadStream(inputFilename)
const outputStream=fs.createWriteStream(outputFilename)

outputStream.write(`<?xml version="1.0" encoding="UTF-8"?>\n`)
outputStream.write(`<kml xmlns="http://earth.google.com/kml/2.2">\n`)
outputStream.write(`<Document>\n`)

let lat,lon,markName
let inMark=false
let inMarkName=false
const parser=(new expat.Parser()).on('startElement',(name,attrs)=>{
	if (name=='wpt') {
		inMark=true
		lat=attrs.lat
		lon=attrs.lon
		markName=undefined
	} else if (inMark && name=='name') {
		inMarkName=true
		markName=''
	}
}).on('endElement',(name)=>{
	if (name=='wpt') {
		outputStream.write(`  <Placemark>\n`)
		if (markName!==undefined) {
			outputStream.write(e.x`    <name>${markName}</name>\n`)
		}
		outputStream.write(e.x`    <Point><coordinates>${lon},${lat}</coordinates></Point>\n`)
		outputStream.write(`  </Placemark>\n`)
		lat=lon=markName=undefined
		inMark=false
	} else if (inMark && name=='name') {
		inMarkName=false
	}
}).on('text',(text)=>{
	if (inMarkName) {
		markName+=text
	}
}).on('end',()=>{
	outputStream.write(`</Document>\n`)
	outputStream.write(`</kml>\n`)
})

inputStream.pipe(parser)
