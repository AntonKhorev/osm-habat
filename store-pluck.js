const osm=require('./osm')

if (process.argv[2]===undefined || process.argv[3]==undefined || process.argv[4]==undefined) {
	console.log('invalid args')
	return process.exit(1)
}
main(process.argv[2],process.argv[3],process.argv[4])

async function main(inputElementVersion,storeFilenameFrom,storeFilenameTo) {
	const storeFrom=osm.readStore(storeFilenameFrom)
	const storeTo=osm.readStore(storeFilenameTo)
	const [etype,eidRange,ev]=inputElementVersion.split('/')
	const [eid1str,eid2str]=eidRange.split('..')
	const eid1=Number(eid1str)
	const eid2=eid2str?Number(eid2str):eid1
	if (eid2<eid1) {
		console.log(`invalid element id range ${eid1}..${eid2}`)
		return
	}
	for (let eid=eid1;eid<=eid2;eid++) {
		const edata=storeFrom[etype]?.[eid]?.[ev]
		const etiv=`${etype}/${eid}/${ev}`
		if (!edata) {
			console.log(`can't find element ${etiv}`)
			continue
		}
		if (!storeTo[etype][eid]) storeTo[etype][eid]={}
		storeTo[etype][eid][ev]=edata
		console.log(`plucked element ${etiv}`)
	}
	osm.writeStore(storeFilenameTo,storeTo)
}
