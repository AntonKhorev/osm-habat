import * as assert from 'assert'

import {fetchTopVersions} from '../osm-fetcher.mjs'

describe("fetchTopVersions",()=>{
	const now=125000000
	const externalStore={
		node:{
			1001:[2,{visible:true}],
			1002:[3,{visible:true}],
			1003:[4,{visible:false}],
			1004:[2,{visible:false}],
		}
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
			},
			way:{},
			relation:{}
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
})
