// node download2.js <osm path> [<store file>]
/*
	paths:                                 shorter paths:
	changeset/123                          c123
	changeset/123/previous                 c123p
	changeset/123/previous/relations       c123prs
	changeset/123/previous/relation/456    c123pr456
	changeset/123/previous/ways            c123pws
	changeset/123/previous/way/456
	changeset/123/previous/nodes
	changeset/123/previous/node/456        c123pn456
	bin search paths:
	changeset/123/previous/ways/relations  c123pwsrs
	or
	changeset/123/affected/relations
*/

const osm=require('./osm')

if (process.argv[2]===undefined) {
	console.log('invalid args')
	return process.exit(1)
}
main(process.argv[2],process.argv[3])

async function main(pathString,storeFilename) {
	const path=parsePath(pathString)
	const lead=path.shift()
	if (lead!='changeset') {
		console.log('non-changeset paths not implemented')
		return process.exit(1)
	}
	const changesetId=path.shift()
	if (storeFilename===undefined) {
		storeFilename=`c${changesetId}.json`
	}
	const store=osm.readStore(storeFilename)
	if (path.length==0) {
		console.log(`requested changeset ${changesetId}`)
		if (changesetId in store.changes) {
			console.log(`requested changeset ${changesetId} already downloaded`)
		} else {
			await downloadChangeset(changesetId,store)
			osm.writeStore(storeFilename,store)
		}
		return
	}
	console.log('changeset subpaths not implemented')
	return process.exit(1)
}

function parsePath(pathString) {
	const path=[]
	for (let i=0;i<100;i++) {
		let match
		if (match=pathString.match(/^(?:c|changeset)\/?(\d+)\/?(.*)/)) {
			const [,id,rest]=match
			path.push('changeset',Number(id))
			pathString=rest
		} else {
			break
		}
	}
	return path
}

async function downloadChangeset(changesetId,store) {
	return new Promise(resolve=>osm.apiGet(`/api/0.6/changeset/${changesetId}/download`,res=>{
		res.pipe(osm.makeParser(store).on('end',resolve))
	}))
}
