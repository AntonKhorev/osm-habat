/*
nodes={
	id1:{
		version1:{changeset,timestamp,visible,uid,lat,lon,tags:{k1:v1,k2:v2,...},
		version2:{changeset,timestamp,visible,uid,lat,lon,tags:{k1:v1,k2:v2,...},
		...
	},
	id2...
}

*/
// old storage:
// user/**/*.osm

const fs=require('fs')
const glob=require('glob')
const expat=require('node-expat')

const nodes={} // TODO load stuff instead

if (process.argv[2]===undefined || process.argv[3]==undefined) {
	console.log('invalid args')
	return process.exit(1)
}
main(process.argv[2],process.argv[3])

async function main(inputGlob,outputDirectory) {
	for (const filename of glob.sync(inputGlob)) {
		await parseFile(filename)
	}
	fs.mkdirSync(outputDirectory,{recursive:true})
	fs.writeFileSync(outputDirectory+'/nodes.json',JSON.stringify(nodes))
}

async function parseFile(filename) {
	return new Promise(resolve=>{
		fs.createReadStream(filename).pipe(makeParser().on('end',resolve))
	})
}

function makeParser() {
	const put=(table,id,version,data)=>{
		if (!(id in table)) table[id]={}
		table[id][version]=data
	}
	let inOsmXml=0
	//let inOsmChangeXml=0 // TODO
	return (new expat.Parser()).on('startElement',(name,attrs)=>{
		if (name=='osm') inOsmXml++
		if (inOsmXml>0) {
			if (name=='node') {
				put(nodes,attrs.id,attrs.version,{
					changeset:Number(attrs.changeset),
					timestamp:Date.parse(attrs.timestamp),
					visible:(attrs.visible=='true'),
					uid:Number(attrs.uid),
					lat:attrs.lat,
					lon:attrs.lon,
				})
			}
			// TODO tags
		}
	}).on('endElement',(name)=>{
		if (name=='osm') inOsmXml--
	})
}
