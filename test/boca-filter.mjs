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
	it("reads topological order parameter",()=>{
		const query={
			'order':'ends',
		}
		const expectedConditions={}
		const expectedOrder=[['ends']]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads tag order parameter",()=>{
		const query={
			'order':'[name]',
		}
		const expectedConditions={}
		const expectedOrder=[['tag','name']]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads comma-separated order parameters",()=>{
		const query={
			'order':'[name],ends',
		}
		const expectedConditions={}
		const expectedOrder=[['tag','name'],['ends']]
		const filter=new Filter(query)
		assert.deepStrictEqual(filter.conditions,expectedConditions)
		assert.deepStrictEqual(filter.order,expectedOrder)
	})
	it("reads comma-separated order parameters with whitespace",()=>{
		const query={
			'order':'   [  name   ] , ends   , [ ref ]',
		}
		const expectedConditions={}
		const expectedOrder=[['tag','name'],['ends'],['tag','ref']]
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
			'filter':'order=[name]',
		}
		const expectedConditions={}
		const expectedOrder=[['tag','name']]
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
			'filter':'order = [name]',
		}
		const expectedConditions={}
		const expectedOrder=[['tag','name']]
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
			'filter':'    order=[name]    ',
		}
		const expectedConditions={}
		const expectedOrder=[['tag','name']]
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
			'order':'[name]',
		}
		const expectedText=
			'v1.type=node\n'+
			'vs.version=10\n'+
			'order=[name]'
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
			'order':'[name]',
		}
		const expectedText=
			'qwerty\n'+
			'asdfgh\n'+
			'v1.type=node\n'+
			'vs.version=10\n'+
			'order=[name]'
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
	it("tests tag value with inequality operators",()=>{
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
	context("when testing string compares",()=>{
		const node=(name)=>({1:{tags:{name}}})
		const project={
			store:{
				node:{
					100001:node('google'),
					100002:node('Google'),
					100003:node('Google maps'),
					100004:node('copied from google maps'),
				}
			}
		}
		const changesets=[
			[101,[
				['create','node',100001,1],
				['create','node',100002,1],
				['create','node',100003,1],
				['create','node',100004,1],
			]],
		]
		const test=(text,expected)=>{
			const filter=new Filter({filter:text})
			const result=[...filter.filterElements(
				project,gen(changesets),2
			)]
			assert.deepStrictEqual(result,expected)
		}
		it("finds exact match",()=>test("vs[name=google]",[
			['node',100001],
		]))
		it("finds inexact substring match",()=>test("vs[name~=google]",[
			['node',100001],
			['node',100002],
			['node',100003],
			['node',100004],
		]))
		it("doesn't find inexact substring match b/c the tag is missing",()=>test("vs[source~=google]",[
		]))
	})
	context("when testing tag order",()=>{
		const node=(a,b)=>({1:{tags:{a,b}}})
		const project={
			store:{
				node:{
					100001:node('a','b'),
					100002:node('b','a'),
					100003:node('b','c'),
					100004:node('a','a'),
					100005:node('b','a'),
				}
			}
		}
		const changesets=[
			[101,[
				['create','node',100001,1],
				['create','node',100002,1],
				['create','node',100003,1],
				['create','node',100004,1],
				['create','node',100005,1],
			]],
		]
		const test=(maxSeparatorLevel,order,expected)=>{
			const filter=new Filter({order})
			const result=[...filter.filterElements(
				project,gen(changesets),2,maxSeparatorLevel
			)]
			assert.deepStrictEqual(result,expected)
		}
		it("orders by one tag",()=>test(0,"[a]",[
			['node',100001],
			['node',100004],
			['node',100002],
			['node',100003],
			['node',100005],
		]))
		it("orders by one tag with separators",()=>test(1,"[a]",[
			['node',100001],
			['node',100004],
			['separator',1],
			['node',100002],
			['node',100003],
			['node',100005],
		]))
		it("orders by two tags",()=>test(0,"[a],[b]",[
			['node',100004],
			['node',100001],
			['node',100002],
			['node',100005],
			['node',100003],
		]))
		it("orders by two tags with separators up to level 1",()=>test(1,"[a],[b]",[
			['node',100004],
			['node',100001],
			['separator',1],
			['node',100002],
			['node',100005],
			['node',100003],
		]))
		it("orders by two tags with separators up to level 2",()=>test(2,"[a],[b]",[
			['node',100004],
			['separator',2],
			['node',100001],
			['separator',1],
			['node',100002],
			['node',100005],
			['separator',2],
			['node',100003],
		]))
	})
	context("when testing combination of two tags and topological order",()=>{
		const node=()=>({1:{tags:{}}})
		const way=(a,b,nds)=>({1:{nds,tags:{a:String(a),b:String(b)}}})
		//    /3\
		// 1-2   4-5
		//    \6/
		const project={
			store:{
				node:{
					100001:node(),
					100002:node(),
					100003:node(),
					100004:node(),
					100005:node(),
					100006:node(),
				},
				way:{
					1001:way(1,1,[100001,100002]),
					1002:way(1,2,[100002,100003]),
					1003:way(1,2,[100003,100004]),
					1004:way(1,1,[100004,100005]),
					1005:way(2,1,[100002,100006]),
					1006:way(2,1,[100006,100004]),
				},
			}
		}
		const changesets=[
			[11,[
				['create','way',1001,1],
				['create','way',1002,1],
				['create','way',1003,1],
				['create','way',1004,1],
				['create','way',1005,1],
				['create','way',1006,1],
			]],
		]
		const test=(maxSeparatorLevel,text,expected)=>{
			const filter=new Filter({filter:text})
			const result=[...filter.filterElements(
				project,gen(changesets),2,maxSeparatorLevel
			)]
			assert.deepStrictEqual(result,expected)
		}
		it("filters path a, orders by way ends",()=>test(0,`vs[a=1]\norder=ends`,[
			['way',1001],
			['way',1002],
			['way',1003],
			['way',1004],
		]))
		it("filters path b, orders by way ends",()=>test(0,`vs[b=1]\norder=ends`,[
			['way',1001],
			['way',1005],
			['way',1006],
			['way',1004],
		]))
		it("orders by way ends",()=>test(0,`order=ends`,[
			['way',1001],
			['way',1002],
			['way',1003],
			['way',1004],
			['way',1006],
			['way',1005],
		]))
		it("orders by tag a, then by way ends",()=>test(0,`order=[a],ends`,[
			['way',1001],
			['way',1002],
			['way',1003],
			['way',1004],
			['way',1005],
			['way',1006],
		]))
		it("orders by tag b, then by way ends",()=>test(0,`order=[b],ends`,[
			['way',1001],
			['way',1005],
			['way',1006],
			['way',1004],
			['way',1002],
			['way',1003],
		]))
	})
	context("when testing combination of name and topological order",()=>{
		const node=()=>({1:{tags:{}}})
		const way=(name,nds)=>({1:{nds,tags:{name}}})
		//            A.X
		// (1)----(3)----(6)----(2)
		//         |      |
		//     C.1 |      | C.2
		//         |      |
		//        (4)----(5)
		//            C.A
		const project={
			store:{
				node:{
					1:node(),
					2:node(),
					3:node(),
					4:node(),
					5:node(),
					6:node(),
				},
				way:{
					13:way('Avenida X',[1,3]),
					36:way('Avenida X',[3,6]),
					62:way('Avenida X',[6,2]),
					34:way('Calle 1',[3,4]),
					65:way('Calle 2',[6,5]),
					45:way('Calle A',[4,5]),
				},
			}
		}
		const changesets=[
			[11,[
				['create','way',13,1],
				['create','way',62,1],
				['create','way',36,1],
				['create','way',34,1],
				['create','way',45,1],
				['create','way',65,1],
			]],
		]
		const test=(maxSeparatorLevel,order,expected)=>{
			const filter=new Filter({order})
			const result=[...filter.filterElements(
				project,gen(changesets),2,maxSeparatorLevel
			)]
			assert.deepStrictEqual(result,expected)
		}
		it("orders by name",()=>test(0,`[name]`,[
			['way',13],
			['way',62],
			['way',36],
			['way',34],
			['way',65],
			['way',45],
		]))
		it("orders by name with separators",()=>test(1,`[name]`,[
			['way',13],
			['way',62],
			['way',36],
			['separator',1],
			['way',34],
			['separator',1],
			['way',65],
			['separator',1],
			['way',45],
		]))
		it("orders by way ends",()=>test(0,`ends`,[
			['way',13],
			['way',34],
			['way',45],
			['way',65],
			['way',62],
			['way',36],
		]))
		it("orders by name, then by way ends",()=>test(0,`[name],ends`,[
			['way',13],
			['way',36],
			['way',62],
			['way',34],
			['way',65],
			['way',45],
		]))
	})
})
