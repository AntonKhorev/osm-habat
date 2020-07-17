const expat=require('node-expat')

const osm=require('./osm')

const id=process.argv[2]
main(id)

async function main(id) {
	console.log(`# Member changes in relation #${id}`)
	osm.apiGet(`/api/0.6/relation/${id}/history`,res=>{
		let oldMembers={}
		let newMembers={}
		res.pipe((new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='relation') {
				newMembers={}
				console.log()
				console.log(`## version ${attrs.version} - changeset ${attrs.changeset} - timestamp ${attrs.timestamp} - user ${attrs.user} (${attrs.uid})`)
				console.log()
			} else if (name=='member') {
				newMembers[`${attrs.type}-${attrs.ref}-${attrs.role}`]=1
			}
		}).on('endElement',(name)=>{
			if (name=='relation') {
				for (const k in oldMembers) {
					if (!(k in newMembers)) {
						console.log('-',k)
					}
				}
				for (const k in newMembers) {
					if (!(k in oldMembers)) {
						console.log('+',k)
					}
				}
				oldMembers=newMembers
			}
		}))
	})
}
