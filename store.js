/*
nodes={
	id1:{
		version1:{changeset,timestamp,uid,visible,lat,lon,tags:{k1:v1,k2:v2,...},
		version2:{changeset,timestamp,uid,visible,lat,lon,tags:{k1:v1,k2:v2,...},
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

// TODO load stuff instead
const nodes={}
const ways={}

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
	fs.writeFileSync(outputDirectory+'/ways.json',JSON.stringify(ways))
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
	let inNodeXml=0, inWayXml=0
	let id,version,changeset,timestamp,uid,visible,tags,lat,lon,nds
	return (new expat.Parser()).on('startElement',(name,attrs)=>{
		if (name=='osm') {
			inOsmXml++
		} else if (name=='node') {
			if (inOsmXml>0) {
				inNodeXml++
				id=Number(attrs.id)
				version=Number(attrs.version)
				changeset=Number(attrs.changeset)
				timestamp=Date.parse(attrs.timestamp)
				uid=Number(attrs.uid)
				visible=(attrs.visible=='true')
				tags={}
				lat=attrs.lat
				lon=attrs.lon
			}
		} else if (name=='way') {
			if (inOsmXml>0) {
				inWayXml++
				id=Number(attrs.id)
				version=Number(attrs.version)
				changeset=Number(attrs.changeset)
				timestamp=Date.parse(attrs.timestamp)
				uid=Number(attrs.uid)
				visible=(attrs.visible=='true')
				tags={}
				nds=[]
			}
		} else if (name=='tag') {
			if (inNodeXml>0 || inWayXml>0) {
				tags[attrs.k]=attrs.v
			}
		} else if (name=='nd') {
			if (inWayXml>0) {
				nds.push(Number(attrs.ref))
			}
		}
	}).on('endElement',(name)=>{
		if (name=='osm') {
			inOsmXml--
		} else if (name=='node') {
			if (inOsmXml>0) {
				put(nodes,id,version,{changeset,timestamp,uid,visible,tags,lat,lon})
				          id=version= changeset=timestamp=uid=visible=tags=lat=lon
				inNodeXml--
			}
		} else if (name=='way') {
			if (inOsmXml>0) {
				put(ways,id,version,{changeset,timestamp,uid,visible,tags,nds})
				         id=version= changeset=timestamp=uid=visible=tags=nds
				inNodeXml--
			}
		}
	})
}
