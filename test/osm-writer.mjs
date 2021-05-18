import {strict as assert} from 'assert'
import expat from 'node-expat'

import writeOsmFile from '../osm-writer.mjs'

const expectNodes=(writer,expectedNodes)=>{
	let inOsm=0
	let metOsms=0
	let metNodes=0
	const parser=new expat.Parser().on('startElement',(name,attrs)=>{
		if (name=='osm') {
			metOsms++
			inOsm++
		} else if (name=='way' || name=='relation') {
			throw new Error("met unexpected element")
		} else if (name=='node') {
			if (!inOsm) throw new Error("met node outside of root")
			metNodes++
		}
	}).on('endElement',(name)=>{
		if (name=='osm') {
			inOsm--
		}
	}).on('error',(msg)=>{
		throw new Error(msg)
	})
	writer((s)=>parser.write(s))
	parser.end()
	assert(metOsms,"no osm root")
	assert.equal(metNodes,expectedNodes,"unexpected number of nodes")
}

describe("writeOsmFile test functions",()=>{
	it("throws on rubbish xml",()=>assert.throws(()=>{
		const rubbishWriter=(write)=>write("junk<<")
		expectNodes(rubbishWriter,0)
	}))
	it("throws on wrong root",()=>assert.throws(()=>{
		const rubbishWriter=(write)=>write(`<?xml version="1.0" encoding="UTF-8"?><lol></lol>`)
		expectNodes(rubbishWriter,0)
	}))
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
		]),0
	))
	it("writes single node",()=>expectNodes(
		write=>writeOsmFile(write,store,[
			['node',101,2]
		]),1
	))
})
