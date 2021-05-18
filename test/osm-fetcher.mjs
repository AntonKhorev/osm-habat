import {strict as assert} from 'assert'

import {fetchTopVersions,fetchTopVisibleVersions} from '../osm-fetcher.mjs'

const makeExternalStoreNodes=(nodeIds,timestamps=[123000000])=>{
	const result={}
	for (const nodeId of nodeIds) {
		for (let v0=0;v0<timestamps.length;v0++) {
			result[nodeId]=[v0+1,{timestamp:timestamps[v0],visible:true}]
		}
	}
	return result
}
const makeInternalStoreNodes=(nodeIds,timestamps=[123000000])=>{
	const result={}
	for (const nodeId of nodeIds) {
		result[nodeId]={}
		for (let v0=0;v0<timestamps.length;v0++) {
			result[nodeId][v0+1]={timestamp:timestamps[v0],visible:true}
			result[nodeId].top={timestamp:timestamps[v0],version:v0+1}
		}
	}
	return result
}
const makeExternalStoreWay=(nodeIds,timestamp=123000000)=>[1,{
	timestamp,
	visible:true,
	nds:nodeIds,
}]
const makeInternalStoreWay=(nodeIds,timestamp=123000000)=>({
	1:{
		timestamp,
		visible:true,
		nds:nodeIds,
	},
	top:{timestamp:123000000,version:1},
})

describe("osm fetcher common code",()=>{
	it("doesn't call multifetch if there's nothing to fetch",async()=>{
		const store={node:{},way:{},relation:{}}
		const multifetch=async(store,multifetchList,lenient=false)=>{
			throw new Error("called multifetch when not supposed to")
		}
		const result=await fetchTopVersions(multifetch,store,[])
		assert.deepEqual(result,[])
	})
})

describe("fetchTopVersions",()=>{
	const now=125000000
	const externalStore={
		node:{
			1001:[2,{timestamp:123000000,visible:true}],
			1002:[3,{timestamp:123000000,visible:true}],
			1003:[4,{timestamp:123000000,visible:false}],
			1004:[2,{timestamp:123000000,visible:false}],
			...makeExternalStoreNodes([1101,1102,1103,1104,1105,1106]),
			...makeExternalStoreNodes([1111,1112,1113,1114]),
			...makeExternalStoreNodes([1201,1202,1203],[123000000,124000000]),
		},
		way:{
			101:[2,{timestamp:123000000,visible:false}],
			102:makeExternalStoreWay([1101,1102,1103,1104]),
			103:makeExternalStoreWay([1101,1102,1103,1104,1101]),
			104:makeExternalStoreWay([1105,1103,1106]),
			111:makeExternalStoreWay([1111,1112]),
			113:makeExternalStoreWay([1113,1114]),
			121:makeExternalStoreWay([1201,1202,1203],124000000)
		},
		relation:{
			11:[1,{timestamp:123000000,visible:true}],
		},
	}
	let store,multifetchLog
	beforeEach(()=>{
		store={
			node:{
				1001:{
					1:{timestamp:123000000,visible:true},
					2:{timestamp:123000000,visible:true},
					top:{timestamp:123000000,version:2},
				},
				1002:{
					1:{timestamp:123000000,visible:true},
					2:{timestamp:123000000,visible:true},
				},
				1003:{
					1:{timestamp:123000000,visible:true},
					2:{timestamp:123000000,visible:true},
					3:{timestamp:123000000,visible:true},
					4:{timestamp:123000000,visible:false},
					top:{timestamp:123000000,version:4},
				},
				1004:{
					1:{timestamp:123000000,visible:true},
					2:{timestamp:123000000,visible:false},
				},
				...makeInternalStoreNodes([1101,1102,1103,1104,1105,1106]),
				...makeInternalStoreNodes([1201,1202,1203],[123000000]), // last version not included
			},
			way:{
				101:{
					1:{timestamp:123000000,visible:true,nds:[1001,1002]},
					2:{timestamp:123000000,visible:false},
					top:{timestamp:123000000,version:2},
				},
				102:makeInternalStoreWay([1101,1102,1103,1104]),
				103:makeInternalStoreWay([1101,1102,1103,1104,1101]),
				104:makeInternalStoreWay([1105,1103,1106]),
				111:makeInternalStoreWay([1111,1112]),
				121:makeInternalStoreWay([1201,1202,1203],124000000)
			},
			relation:{
				11:{
					1:{timestamp:123000000,visible:true},
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
		assert.deepEqual(result,[])
		assert.deepEqual(multifetchLog,[])
	})
	it("returns requested and already fetched node",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['node',1001],
		])
		assert.deepEqual(result,[
			['node',1001,2],
		])
		assert.deepEqual(multifetchLog,[])
	})
	it("fetches requested node without top version",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['node',1002],
		])
		assert.deepEqual(result,[
			['node',1002,3],
		])
		assert.deepEqual(multifetchLog,[
			['node',1002],
		])
	})
	it("fetches node without top version and returns one with",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['node',1002],
			['node',1001],
		])
		assert.deepEqual(result,[
			['node',1001,2],
			['node',1002,3],
		])
		assert.deepEqual(multifetchLog,[
			['node',1002],
		])
	})
	it("returns nothing because requested node is deleted",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['node',1003],
		])
		assert.deepEqual(result,[])
		assert.deepEqual(multifetchLog,[])
	})
	it("fetches and returns nothing because requested node is deleted",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['node',1004],
		])
		assert.deepEqual(result,[])
		assert.deepEqual(multifetchLog,[
			['node',1004],
		])
	})
	it("returns already fetched relation",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['relation',11],
		])
		assert.deepEqual(result,[
			['relation',11,1],
		])
		assert.deepEqual(multifetchLog,[])
	})
	it("returns nothing b/c requested way is deleted",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['way',101],
		])
		assert.deepEqual(result,[])
		assert.deepEqual(multifetchLog,[])
	})
	it("returns already fetched way",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['way',102],
		])
		assert.deepEqual(result,[
			['node',1101,1],
			['node',1102,1],
			['node',1103,1],
			['node',1104,1],
			['way',102,1],
		])
		assert.deepEqual(multifetchLog,[])
	})
	it("returns already fetched looped way",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['way',103],
		])
		assert.deepEqual(result,[
			['node',1101,1],
			['node',1102,1],
			['node',1103,1],
			['node',1104,1],
			['way',103,1],
		])
		assert.deepEqual(multifetchLog,[])
	})
	it("returns already fetched intersecting ways",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['way',102],
			['way',104],
		])
		assert.deepEqual(result,[
			['node',1101,1],
			['node',1102,1],
			['node',1103,1],
			['node',1104,1],
			['node',1105,1],
			['node',1106,1],
			['way',102,1],
			['way',104,1],
		])
		assert.deepEqual(multifetchLog,[])
	})
	it("fetches unfetched way nodes",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['way',111],
		])
		assert.deepEqual(result,[
			['node',1111,1],
			['node',1112,1],
			['way',111,1],
		])
		assert.deepEqual(multifetchLog,[
			['node',1111],
			['node',1112],
		])
	})
	it("fetches unfetched way and its unfetched nodes",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['way',113],
		])
		assert.deepEqual(result,[
			['node',1113,1],
			['node',1114,1],
			['way',113,1],
		])
		assert.deepEqual(multifetchLog,[
			['way',113],
			['node',1113],
			['node',1114],
		])
	})
	it("fetches outdated way nodes",async()=>{
		const result=await fetchTopVersions(multifetch,store,[
			['way',121],
		])
		assert.deepEqual(result,[
			['node',1201,2],
			['node',1202,2],
			['node',1203,2],
			['way',121,1],
		])
		assert.deepEqual(multifetchLog,[
			['node',1201],
			['node',1202],
			['node',1203],
		])
	})
})

describe("fetchTopVisibleVersions",()=>{
	const now=125000000
	const externalStore={
		node:{
			1000:{
				1:{timestamp:120000000,visible:true},
				top:1,
			},
			1001:{
				1:{timestamp:120000000,visible:true},
				2:{timestamp:121000000,visible:true},
				top:2,
			},
			1002:{
				1:{timestamp:120000000,visible:true},
				2:{timestamp:121000000,visible:true},
				3:{timestamp:122000000,visible:true},
				4:{timestamp:123000000,visible:false},
				top:4,
			},
			1003:{
				1:{timestamp:122000000,visible:true},
				2:{timestamp:123000000,visible:false},
				top:2,
			},
			1010:{
				1:{timestamp:122000000,visible:true},
				2:{timestamp:123000000,visible:false},
				top:2,
			},
			1020:{
				1:{timestamp:122000000,visible:true},
				2:{timestamp:123000000,visible:false},
				3:{timestamp:123500000,visible:false},
				top:3,
			}
		},
		way:{
			10:{
				1:{timestamp:121000000,visible:true,nds:[1000,1001]},
				top:1,
			},
			11:{
				1:{timestamp:121000000,visible:true,nds:[1000,1001]},
				2:{timestamp:123000000,visible:false},
				top:2,
			},
			12:{
				1:{timestamp:121000000,visible:true,nds:[1002,1003]},
				2:{timestamp:123000000,visible:false},
				top:2,
			},
		},
		relation:{},
	}
	let store,multifetchLog
	beforeEach(()=>{
		store={
			node:{
				1010:{
					1:{timestamp:122000000,visible:true},
					2:{timestamp:123000000,visible:false},
					top:{timestamp:124000000,version:2},
				}
			},
			way:{},
			relation:{},
		}
		multifetchLog=[]
	})
	afterEach(()=>{
		store=undefined
		multifetchLog=undefined
	})
	const multifetch=async(store,multifetchList,lenient=false)=>{
		if (lenient) throw new Error("called multifetch in lenient mode")
		let topMode=false
		let versionedMode=false
		for (const [etype,eid,ev] of multifetchList) {
			if (ev==null) {
				topMode=true
				if (versionedMode) throw new Error("called multifetch with both top and versioned args")
				multifetchLog.push([etype,eid])
				const topVersion=externalStore[etype][eid].top
				const topData=externalStore[etype][eid][topVersion]
				if (store[etype][eid]==null) store[etype][eid]={}
				store[etype][eid][topVersion]=topData
				store[etype][eid].top={timestamp:now,version:topVersion}
			} else if (externalStore[etype][eid][ev]) {
				versionedMode=true
				if (topMode) throw new Error("called multifetch with both top and versioned args")
				multifetchLog.push([etype,eid,ev])
				if (store[etype][eid]==null) store[etype][eid]={}
				store[etype][eid][ev]=externalStore[etype][eid][ev]
			} else {
				throw new Error("called multifetch to get a version that doesn't exist")
			}

		}
	}
	it("fetches a visible node",async()=>{
		const result=await fetchTopVisibleVersions(multifetch,store,[
			['node',1001],
		])
		assert.deepEqual(result,[
			['node',1001,2],
		])
		assert.deepEqual(multifetchLog,[
			['node',1001],
		])
	})
	it("fetches an invisible node",async()=>{
		const result=await fetchTopVisibleVersions(multifetch,store,[
			['node',1002],
		])
		assert.deepEqual(result,[
			['node',1002,4,3],
		])
		assert.deepEqual(multifetchLog,[
			['node',1002],
			['node',1002,3],
		])
	})
	it("fetches a fully visible way",async()=>{
		const result=await fetchTopVisibleVersions(multifetch,store,[
			['way',10],
		])
		assert.deepEqual(result,[
			['node',1000,1],
			['node',1001,2],
			['way',10,1],
		])
		assert.deepEqual(multifetchLog,[
			['way',10],
			['node',1000],
			['node',1001],
		])
	})
	it("fetches a deleted way with visible nodes",async()=>{
		const result=await fetchTopVisibleVersions(multifetch,store,[
			['way',11],
		])
		assert.deepEqual(result,[
			['node',1000,1],
			['node',1001,2],
			['way',11,2,1],
		])
		assert.deepEqual(multifetchLog,[
			['way',11],
			['way',11,1],
			['node',1000],
			['node',1001],
		])
	})
	it("fetches a deleted way with deleted nodes",async()=>{
		const result=await fetchTopVisibleVersions(multifetch,store,[
			['way',12],
		])
		assert.deepEqual(result,[
			['node',1002,4,3],
			['node',1003,2,1],
			['way',12,2,1],
		])
		assert.deepEqual(multifetchLog,[
			['way',12],
			['way',12,1],
			['node',1002],
			['node',1003],
			['node',1002,3],
			['node',1003,1],
		])
	})
	it("returns deleted but already fetched node",async()=>{
		const result=await fetchTopVisibleVersions(multifetch,store,[
			['node',1010],
		])
		assert.deepEqual(result,[
			['node',1010,2,1],
		])
		assert.deepEqual(multifetchLog,[])
	})
	it("fetches a doubly-deleted node",async()=>{
		const result=await fetchTopVisibleVersions(multifetch,store,[
			['node',1020],
		])
		assert.deepEqual(result,[
			['node',1020,3,1],
		])
		assert.deepEqual(multifetchLog,[
			['node',1020],
			['node',1020,2],
			['node',1020,1],
		])
	})
})
