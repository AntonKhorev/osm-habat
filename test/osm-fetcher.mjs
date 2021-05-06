import * as assert from 'assert'

import {fetchTopVersions} from '../osm-fetcher.mjs'

const makeExternalStoreNodes=(nodeIds)=>{
	const result={}
	for (const nodeId of nodeIds) {
		result[nodeId]=[1,{visible:true}]
	}
	return result
}
const makeInternalStoreNodes=(nodeIds)=>{
	const result={}
	for (const nodeId of nodeIds) {
		result[nodeId]={
			1:{visible:true},
			top:{timestamp:123000000,version:1},
		}
	}
	return result
}
const makeExternalStoreWay=(nodeIds)=>[1,{
	visible:true,
	nds:nodeIds,
}]
const makeInternalStoreWay=(nodeIds)=>({
	1:{
		visible:true,
		nds:nodeIds,
	},
	top:{timestamp:123000000,version:1},
})

describe("fetchTopVersions",()=>{
	const now=125000000
	const downloadedWayNodeIds=[1101,1102,1103,1104,1105,1106]
	const externalStore={
		node:{
			1001:[2,{visible:true}],
			1002:[3,{visible:true}],
			1003:[4,{visible:false}],
			1004:[2,{visible:false}],
			...makeExternalStoreNodes(downloadedWayNodeIds),
		},
		way:{
			101:[2,{visible:false}],
			102:makeExternalStoreWay([1101,1102,1103,1104]),
			103:makeExternalStoreWay([1101,1102,1103,1104,1101]),
			104:makeExternalStoreWay([1105,1103,1106]),
		},
		relation:{
			11:[1,{visible:true}],
		},
	}
	let store,multifetchLog
	beforeEach(()=>{
		store={
			node:{
				1001:{
					1:{visible:true},
					2:{visible:true},
					top:{timestamp:123000000,version:2},
				},
				1002:{
					1:{visible:true},
					2:{visible:true},
				},
				1003:{
					1:{visible:true},
					2:{visible:true},
					3:{visible:true},
					4:{visible:false},
					top:{timestamp:123000000,version:4},
				},
				1004:{
					1:{visible:true},
					2:{visible:false},
				},
				...makeInternalStoreNodes(downloadedWayNodeIds)
			},
			way:{
				101:{
					1:{visible:true,nds:[1001,1002]},
					2:{visible:false},
					top:{timestamp:123000000,version:2},
				},
				102:makeInternalStoreWay([1101,1102,1103,1104]),
				103:makeInternalStoreWay([1101,1102,1103,1104,1101]),
				104:makeInternalStoreWay([1105,1103,1106]),
			},
			relation:{
				11:{
					1:{visible:true},
					top:{timestamp:124000000,version:1},
				},
			}
		}
		multifetchLog=[]
	})
	afterEach(()=>{
		store=undefined
		multifetchLog=undefined
	})
	const multifetch=async(store,multifetchList,lenient=false)=>{
		if (lenient) throw new Error("called multifetch in lenient mode")
		for (const [etype,eid,ev] of multifetchList) {
			if (ev!=null) throw new Error("called multifetch with an element version")
			multifetchLog.push([etype,eid])
			const [topVersion,topData]=externalStore[etype][eid]
			if (store[etype][eid]==null) store[etype][eid]={}
			store[etype][eid][topVersion]=topData
			store[etype][eid].top={timestamp:now,version:topVersion}
		}
	}
	it("does nothing if nothing is requested",async()=>{
		const result=await fetchTopVersions(multifetch,store,[])
		assert.deepStrictEqual(result,[])
		assert.deepStrictEqual(multifetchLog,[])
	})
	it("returns requested and already fetched node",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['node',1001],
		])
		assert.deepStrictEqual(result,[
			['node',1001,2],
		])
		assert.deepStrictEqual(multifetchLog,[])
	})
	it("fetches requested node without top version",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['node',1002],
		])
		assert.deepStrictEqual(result,[
			['node',1002,3],
		])
		assert.deepStrictEqual(multifetchLog,[
			['node',1002],
		])
	})
	it("fetches node without top version and returns one with",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['node',1002],
			['node',1001],
		])
		assert.deepStrictEqual(result,[
			['node',1001,2],
			['node',1002,3],
		])
		assert.deepStrictEqual(multifetchLog,[
			['node',1002],
		])
	})
	it("returns nothing because requested node is deleted",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['node',1003],
		])
		assert.deepStrictEqual(result,[])
		assert.deepStrictEqual(multifetchLog,[])
	})
	it("fetches and returns nothing because requested node is deleted",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['node',1004],
		])
		assert.deepStrictEqual(result,[])
		assert.deepStrictEqual(multifetchLog,[
			['node',1004],
		])
	})
	it("returns already fetched relation",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['relation',11],
		])
		assert.deepStrictEqual(result,[
			['relation',11,1],
		])
		assert.deepStrictEqual(multifetchLog,[])
	})
	it("returns nothing b/c requested way is deleted",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['way',101],
		])
		assert.deepStrictEqual(result,[])
		assert.deepStrictEqual(multifetchLog,[])
	})
	it("returns already fetched way",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['way',102],
		])
		assert.deepStrictEqual(result,[
			['node',1101,1],
			['node',1102,1],
			['node',1103,1],
			['node',1104,1],
			['way',102,1],
		])
		assert.deepStrictEqual(multifetchLog,[])
	})
	it("returns already fetched looped way",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['way',103],
		])
		assert.deepStrictEqual(result,[
			['node',1101,1],
			['node',1102,1],
			['node',1103,1],
			['node',1104,1],
			['way',103,1],
		])
		assert.deepStrictEqual(multifetchLog,[])
	})
	it("returns already fetched intersecting ways",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['way',102],
			['way',104],
		])
		assert.deepStrictEqual(result,[
			['node',1101,1],
			['node',1102,1],
			['node',1103,1],
			['node',1104,1],
			['node',1105,1],
			['node',1106,1],
			['way',102,1],
			['way',104,1],
		])
		assert.deepStrictEqual(multifetchLog,[])
	})
})
