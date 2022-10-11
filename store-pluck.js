const osm=require('./osm')

if (process.argv[2]===undefined || process.argv[3]==undefined || process.argv[4]==undefined) {
	console.log('invalid args')
	return process.exit(1)
}
main(process.argv[2],process.argv[3],process.argv[4])

async function main(inputElementVersion,storeFilenameFrom,storeFilenameTo) {
	const storeFrom=osm.readStore(storeFilenameFrom)
	const [etype,eid,ev]=inputElementVersion.split('/')
	const edata=storeFrom[etype]?.[eid]?.[ev]
	if (!edata) {
		console.log(`can't find element ${inputElementVersion}`)
		return
	}
	const storeTo=osm.readStore(storeFilenameTo)
	if (!storeTo[etype][eid]) storeTo[etype][eid]={}
	storeTo[etype][eid][ev]=edata
	osm.writeStore(storeFilenameTo,storeTo)
}
