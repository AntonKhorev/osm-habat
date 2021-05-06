import * as assert from 'assert'

import Filter from '../boca-filter.mjs'

describe("Filter.constructor",()=>{
	it("reads empty query",()=>{
		const query={}
		const expectedConditions={}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads single filter parameter",()=>{
		const query={
			'vs.type':'node',
		}
		const expectedConditions={
			vs:{
				type:'node',
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads two same versiondescriptor filter parameters",()=>{
		const query={
			'vs.type':'way',
			'vs.version':'2',
		}
		const expectedConditions={
			vs:{
				type:'way',
				version:2,
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads two different versiondescriptor filter parameters",()=>{
		const query={
			'vs.type':'way',
			'vp.version':'3',
		}
		const expectedConditions={
			vs:{
				type:'way',
			},
			vp:{
				version:3,
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads boolean true filter parameters",()=>{
		const query={
			'vs.visible':'true',
		}
		const expectedConditions={
			vs:{
				visible:true,
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads boolean true (1) filter parameters",()=>{
		const query={
			'vs.visible':'1',
		}
		const expectedConditions={
			vs:{
				visible:true,
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads boolean false filter parameters",()=>{
		const query={
			'vs.visible':'false',
		}
		const expectedConditions={
			vs:{
				visible:false,
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads boolean false (0) filter parameters",()=>{
		const query={
			'vs.visible':'0',
		}
		const expectedConditions={
			vs:{
				visible:false,
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads order parameter",()=>{
		const query={
			'order':'name',
		}
		const expectedConditions={}
		const expectedOrder=['name']
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads empty lines",()=>{
		const query={
			'filter':'',
		}
		const expectedConditions={}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads one filter line",()=>{
		const query={
			'filter':'vt.type=relation',
		}
		const expectedConditions={
			vt:{
				type:'relation',
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads two filter lines",()=>{
		const query={
			'filter':
				'vt.type=relation\n'+
				'vt.visible=0\n'
		}
		const expectedConditions={
			vt:{
				type:'relation',
				visible:false,
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads two filter lines with empty lines",()=>{
		const query={
			'filter':
				'vt.type=node\n'+
				'\n'+
				'vt.visible=1\n'+
				'\n'
		}
		const expectedConditions={
			vt:{
				type:'node',
				visible:true,
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads == operator line",()=>{
		const query={
			'filter':'vs.version==2',
		}
		const expectedConditions={
			vs:{
				version:2,
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads >= operator line",()=>{
		const query={
			'filter':'vs.version>=3',
		}
		const expectedConditions={
			vs:{
				version:['>=',3],
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads < operator line",()=>{
		const query={
			'filter':'vs.version<4',
		}
		const expectedConditions={
			vs:{
				version:['<',4],
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads order line",()=>{
		const query={
			'filter':'order=name',
		}
		const expectedConditions={}
		const expectedOrder=['name']
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("overrides text with a parameter",()=>{
		const query={
			'filter':'vs.type=node',
			'vs.type':'way',
		}
		const expectedConditions={
			vs:{
				type:'way',
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("overrides text line with a next line",()=>{
		const query={
			'filter':
				'vs.type=node\n'+
				'vs.type=relation\n'
		}
		const expectedConditions={
			vs:{
				type:'relation',
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads whitespace around filter opetator",()=>{
		const query={
			'filter':'vs.type = node',
		}
		const expectedConditions={
			vs:{
				type:'node',
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads whitespace around order opetator",()=>{
		const query={
			'filter':'order = name',
		}
		const expectedConditions={}
		const expectedOrder=['name']
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads whitespace around filter statement",()=>{
		const query={
			'filter':'    vs.type=node    ',
		}
		const expectedConditions={
			vs:{
				type:'node',
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads whitespace around order statement",()=>{
		const query={
			'filter':'    order=name    ',
		}
		const expectedConditions={}
		const expectedOrder=['name']
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads tag presence condition",()=>{
		const query={
			'filter':'vs[highway]',
		}
		const expectedConditions={
			vs:{
				tag:{
					highway:['=*']
				}
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads tag absence condition",()=>{
		const query={
			'filter':'vs[!highway]',
		}
		const expectedConditions={
			vs:{
				tag:{
					highway:['!=*']
				}
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads tag value condition",()=>{
		const query={
			'filter':'vs[highway=primary]',
		}
		const expectedConditions={
			vs:{
				tag:{
					highway:'primary'
				}
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads tag value condition with whitespace",()=>{
		const query={
			'filter':'vs[ highway  =   primary    ]',
		}
		const expectedConditions={
			vs:{
				tag:{
					highway:'primary'
				}
			}
		}
		const expectedOrder=[]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
})

describe("Filter.text",()=>{
	it("returns empty filters/order",()=>{
		const query={}
		const expectedText=''
		const filter=new Filter(query)
		assert.strictEqual(filter.text,expectedText)
	})
	it("returns one filter, no order",()=>{
		const query={
			'v1.type':'node',
		}
		const expectedText=
			'v1.type=node'
		const filter=new Filter(query)
		assert.strictEqual(filter.text,expectedText)
	})
	it("returns two filters, no order",()=>{
		const query={
			'vs.version':'10',
			'v1.type':'node',
		}
		const expectedText=
			'v1.type=node\n'+
			'vs.version=10'
		const filter=new Filter(query)
		assert.strictEqual(filter.text,expectedText)
	})
	it("returns two filters, name order",()=>{
		const query={
			'vs.version':'10',
			'v1.type':'node',
			'order':'name',
		}
		const expectedText=
			'v1.type=node\n'+
			'vs.version=10\n'+
			'order=name'
		const filter=new Filter(query)
		assert.strictEqual(filter.text,expectedText)
	})
	it("repeats anything",()=>{
		const query={
			'filter':
				'qwerty\n'+
				'asdfgh',
		}
		const expectedText=
			'qwerty\n'+
			'asdfgh'
		const filter=new Filter(query)
		assert.strictEqual(filter.text,expectedText)
	})
	it("repeats anything then adds filters and order",()=>{
		const query={
			'filter':
				'qwerty\n'+
				'asdfgh',
			'vs.version':'10',
			'v1.type':'node',
			'order':'name',
		}
		const expectedText=
			'qwerty\n'+
			'asdfgh\n'+
			'v1.type=node\n'+
			'vs.version=10\n'+
			'order=name'
		const filter=new Filter(query)
		assert.strictEqual(filter.text,expectedText)
	})
})

describe("Filter.filterElements",()=>{
	function *gen(changesetsArray) {
		yield* changesetsArray
	}
	context("when filter is empty",()=>{
		const project={
			store:{
				// TODO
			},
		}
		const changesets=[
			[124,[
				['modify','node',100001,3],
				['modify','node',100002,2],
				['modify','node',100008,7],
			]],
			[131,[
				['modify','node',100001,4],
				['modify','node',100012,8],
				['modify','node',100013,2],
			]],
		]
		const filter=new Filter({})
		it("passes through everything with detail level 2",()=>{
			const result=[...filter.filterElements(
				project,gen(changesets),2
			)]
			assert.deepStrictEqual(result,[
				['node',100001],
				['node',100002],
				['node',100008],
				['node',100012],
				['node',100013],
			])
		})
		it("passes through everything with detail level 3",()=>{
			const result=[...filter.filterElements(
				project,gen(changesets),3
			)]
			assert.deepStrictEqual(result,[
				['node',100001,[3,4]],
				['node',100002,[2]],
				['node',100008,[7]],
				['node',100012,[8]],
				['node',100013,[2]],
			])
		})
	})
	context("when testing count",()=>{
		const node=()=>({})
		const project={
			store:{
				node:{
					100001:{
						3:node(),
						4:node(),
					},
					100002:{
						2:node(),
						3:node(),
						4:node(),
					},
					100003:{
						7:node(),
					},
				}
			}
		}
		const changesets=[
			[101,[
				['modify','node',100001,3],
				['modify','node',100002,2],
				['modify','node',100003,7],
			]],
			[102,[
				['modify','node',100001,4],
				['modify','node',100002,3],
			]],
			[103,[
				['modify','node',100002,4],
			]],
		]
		it("seeks count equality",()=>{
			const filter1=new Filter({
				'vs.count':1
			})
			const result1=[...filter1.filterElements(
				project,gen(changesets),2
			)]
			assert.deepStrictEqual(result1,[
				['node',100003],
			])
			const filter2=new Filter({
				'vs.count':2
			})
			const result2=[...filter2.filterElements(
				project,gen(changesets),2
			)]
			assert.deepStrictEqual(result2,[
				['node',100001],
			])
			const filter3=new Filter({
				'vs.count':3
			})
			const result3=[...filter3.filterElements(
				project,gen(changesets),2
			)]
			assert.deepStrictEqual(result3,[
				['node',100002],
			])
		})
		it("seeks count inequality",()=>{
			const filter2plus=new Filter({
				filter:'vs.count>=2'
			})
			const result2plus=[...filter2plus.filterElements(
				project,gen(changesets),2
			)]
			assert.deepStrictEqual(result2plus,[
				['node',100001],
				['node',100002],
			])
		})
	})
	it("seeks tag presence",()=>{
		const node=(tags)=>({tags})
		const project={
			store:{
				node:{
					100001:{
						3:node({shop:'bakery'}),
						4:node({shop:'bakery',name:'Bread'}),
					},
					100002:{
						2:node({amenity:'pharmacy'}),
						3:node({amenity:'pharmacy',opening_hours:'24/7'}),
						4:node({amenity:'pharmacy',opening_hours:'08:00-23:00'}),
					},
					100003:{
						7:node({amenity:'bench'}),
					},
					100004:{
						6:node(),
					}
				}
			}
		}
		const changesets=[
			[101,[
				['modify','node',100001,3],
				['modify','node',100002,2],
				['modify','node',100003,7],
			]],
			[102,[
				['modify','node',100001,4],
				['modify','node',100002,3],
			]],
			[103,[
				['modify','node',100002,4],
			]],
		]
		const test=(text,expected)=>{
			const filter=new Filter({filter:text})
			const result=[...filter.filterElements(
				project,gen(changesets),2
			)]
			assert.deepStrictEqual(result,expected)
		}
		test('vs[amenity]',[
			['node',100002],
			['node',100003],
		])
		test('vs[!amenity]',[
			['node',100001],
		])
		test('vs[opening_hours]',[
			['node',100002],
		])
		test('vs.tagged=1',[
			['node',100001],
			['node',100002],
			['node',100003],
		])
	})
	it("tests tag value",()=>{
		const node=(ref)=>({tags:{ref}})
		const project={
			store:{
				node:{
					100001:{
						3:node(42),
						4:node(43),
					},
					100002:{
						2:node(23),
						3:node(22),
						4:node(23),
					},
					100003:{
						7:node(12),
					},
				}
			}
		}
		const changesets=[
			[101,[
				['modify','node',100001,3],
				['modify','node',100002,2],
				['modify','node',100003,7],
			]],
			[102,[
				['modify','node',100001,4],
				['modify','node',100002,3],
			]],
			[103,[
				['modify','node',100002,4],
			]],
		]
		const test=(text,expected)=>{
			const filter=new Filter({filter:text})
			const result=[...filter.filterElements(
				project,gen(changesets),2
			)]
			assert.deepStrictEqual(result,expected)
		}
		test('vs[ref>=23]',[
			['node',100001],
			['node',100002],
		])
		test('vs[ref>=24]',[
			['node',100001],
		])
		test('vs[ref<23]',[
			['node',100002],
			['node',100003],
		])
		test('vs[ref=12]',[
			['node',100003],
		])
	})
})
