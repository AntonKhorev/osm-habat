const fs=require('fs')
const glob=require('glob')

const getFileLines=(filename)=>String(fs.readFileSync(filename)).split(/\r\n|\r|\n/)

if (process.argv[2]===undefined) {
	console.log('invalid args, glob pattern required')
	return process.exit(1)
}
main(process.argv[2])

async function main(inputGlob) {
	const counts={node:new Set,way:new Set,relation:new Set}
	for (const filename of glob.sync(inputGlob)) {
		for (const line of getFileLines(filename)) {
			const [etype,eid]=line.split('/')
			if (!etype || !eid) continue
			counts[etype].add(eid)
		}
	}
	console.log(counts.node.size+counts.way.size+counts.relation.size)
}
