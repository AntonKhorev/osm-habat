import * as assert from 'assert'
import expat from 'node-expat'

import writeOsmFile from '../osm-writer.mjs'

describe("writeOsmFile",()=>{
	const store={
		node:{
			101:{
				1:{
					changeset:1001,
					timestamp:123000000,
					uid:100001,
					visible:true,
					lat:"60",
					lon:"30",
					tags:{name:"Approx Piter"},
				},
				2:{
					changeset:1002,
					timestamp:124000000,
					uid:100001,
					visible:true,
					lat:"59",
					lon:"30",
					tags:{name:"Approx SPb"},
				},
			},
		},
		way:{},
		relation:{},
	}
	const expectNode=(elements)=>{
		let inOsm=0
		let metOsm=false
		let metNode=false
		const parser=new expat.Parser().on('startElement',(name,attrs)=>{
			if (name=='osm') {
				metOsm=true
				inOsm++
			} else if (name=='way' || name=='relation') {
				throw new Error("met unexpected element")
			} else if (name=='node') {
				if (!inOsm) throw new Error("met node outside of root")
				if (metNode) throw new Error("met more than one node")
				metNode=true
			}
		}).on('endElement',(name)=>{
			if (name=='osm') {
				inOsm--
			}
		})
		writeOsmFile((s)=>parser.write(s),store,elements)
		parser.end()
		if (!metOsm) throw new Error("met no root")
		if (!metNode) throw new Error("met no nodes")
	}
	it("writes single node",()=>expectNode(
		[['node',101,2]]
	))
})
