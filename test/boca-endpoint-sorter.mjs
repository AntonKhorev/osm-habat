import assert from 'assert'

import EndpointSorter from '../boca-endpoint-sorter.mjs'

describe("EndPointSorter",()=>{
	it("returns empty iterator on empty input",()=>{
		const sorter=new EndpointSorter()
		const expected=[]
		assert.deepStrictEqual([...sorter],expected)
	})
	it("returns no-endpoint entries in original order",()=>{
		const sorter=new EndpointSorter()
		sorter.add('a')
		sorter.add('c')
		sorter.add('b')
		const expected=['a','c','b']
		assert.deepStrictEqual([...sorter],expected)
	})
	it("sorts simple chain",()=>{
		const sorter=new EndpointSorter()
		sorter.add('middle',2,3)
		sorter.add('begin',1,2)
		sorter.add('end',3,4)
		const expected=['begin','middle','end']
		assert.deepStrictEqual([...sorter],expected)
	})
	it("sorts simple chain keeping unsortable entries",()=>{
		const sorter=new EndpointSorter()
		sorter.add('before')
		sorter.add('middle',2,3)
		sorter.add('begin',1,2)
		sorter.add('end',3,4)
		sorter.add('after')
		const expected=['before','begin','middle','end','after']
		assert.deepStrictEqual([...sorter],expected)
	})
	it("sorts two chains",()=>{
		const sorter=new EndpointSorter()
		// a: 1-3-5-7
		// b: 2-4-6
		sorter.add('a35',3,5)
		sorter.add('b24',2,4)
		sorter.add('a13',1,3)
		sorter.add('b46',4,6)
		sorter.add('a57',5,7)
		const expected=['a13','a35','a57','b24','b46']
		assert.deepStrictEqual([...sorter],expected)
	})
	it("sorts 3-ended star",()=>{
		const sorter=new EndpointSorter()
		// 1-2-3-9-8
		//     `7-6
		sorter.add('12',1,2)
		sorter.add('89',8,9)
		sorter.add('67',6,7)
		sorter.add('23',2,3)
		sorter.add('73',7,3)
		sorter.add('93',9,3)
		const expected=['12','23','73','67','93','89']
		assert.deepStrictEqual([...sorter],expected)
	})
	it("sorts chain with multiple edges",()=>{
		const sorter=new EndpointSorter()
		// 2-1-3
		//   `-'
		sorter.add('31',3,1)
		sorter.add('12',1,2)
		sorter.add('13',1,3)
		const expected=['12','31','13']
		assert.deepStrictEqual([...sorter],expected)
	})
})
