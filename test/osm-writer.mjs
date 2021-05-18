import {strict as assert} from 'assert'
import expat from 'node-expat'

import writeOsmFile from '../osm-writer.mjs'

const expectNodes=(writer,expectedNodeActionsAndTags)=>{
	let metOsms=0
	let inOsm=0
	let nodeExpectedTags,nodeActualTags
	const parser=new expat.Parser().on('startElement',(name,attrs)=>{
		if (name=='osm') {
			metOsms++
			inOsm++
		} else if (name=='way' || name=='relation') {
			throw new Error("met unexpected element")
		} else if (name=='node') {
			if (!inOsm) throw new Error("met node outside of root")
			if (expectedNodeActionsAndTags.length==0) throw new Error("too many nodes")
			const [expectedAction,expectedTags]=expectedNodeActionsAndTags.shift()
			assert.equal(attrs.action,expectedAction)
			nodeExpectedTags=expectedTags
			nodeActualTags={}
		} else if (name=='tag') {
			if (nodeActualTags==null) throw new Error("met tag outside of node")
			if (nodeActualTags[attrs.k]!=null) throw new Error(`redefined tag "${attrs.k}"`)
			nodeActualTags[attrs.k]=attrs.v
		}
	}).on('endElement',(name)=>{
		if (name=='osm') {
			inOsm--
		} else if (name=='node') {
			assert.deepEqual(nodeActualTags,nodeExpectedTags)
			nodeExpectedTags=undefined
			nodeActualTags=undefined
		}
	}).on('error',(msg)=>{
		throw new Error(msg)
	})
	writer((s)=>parser.write(s))
	parser.end()
	assert(metOsms,"no osm root")
	if (expectedNodeActionsAndTags.length!=0) throw new Error("not enough nodes")
}

describe("writeOsmFile test functions",()=>{
	it("throws on rubbish xml",()=>assert.throws(()=>{
		const rubbishWriter=(write)=>write("junk<<")
		expectNodes(rubbishWriter,[])
	},/^Error: not well-formed/))
	it("throws on wrong root",()=>assert.throws(()=>{
		const rubbishWriter=(write)=>write(`<?xml version="1.0" encoding="UTF-8"?><lol></lol>`)
		expectNodes(rubbishWriter,[])
	},/no osm root$/))
	it("throws on redefined tag",()=>assert.throws(()=>{
		const rubbishWriter=(write)=>write(`<?xml version="1.0" encoding="UTF-8"?><osm><node id="12"><tag k="x" v="42" /><tag k="x" v="23" /></node></osm>`)
		expectNodes(rubbishWriter,[
			[undefined,{k:23}]
		])
	},/redefined tag "x"$/))
})

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
	it("writes empty file",()=>expectNodes(
		write=>writeOsmFile(write,store,[
		]),[]
	))
	it("writes single node",()=>expectNodes(
		write=>writeOsmFile(write,store,[
			['node',101,2]
		]),[
			[undefined,{name:"Approx SPb"}]
		]
	))
	it("writes single node with mod to earlier version",()=>expectNodes(
		write=>writeOsmFile(write,store,[
			['node',101,2,1]
		]),[
			['modify',{name:"Approx Piter"}]
		]
	))
	it("writes single node with tag modification",()=>expectNodes(
		write=>writeOsmFile(write,store,[
			['node',101,2,{name:"St. Petersburg"}]
		]),[
			['modify',{name:"St. Petersburg"}]
		]
	))
})
