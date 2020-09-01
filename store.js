/*
nodes:{
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
const osm=require('./osm')

if (process.argv[2]===undefined || process.argv[3]==undefined) {
	console.log('invalid args')
	return process.exit(1)
}
main(process.argv[2],process.argv[3])

async function main(inputGlob,storeFilename) {
	const store=osm.readStore(storeFilename)
	for (const filename of glob.sync(inputGlob)) {
		await parseFile(filename,store)
	}
	osm.writeStore(storeFilename,store)
}

async function parseFile(filename,store) {
	return new Promise(resolve=>{
		fs.createReadStream(filename).pipe(osm.makeParser(store).on('end',resolve))
	})
}
