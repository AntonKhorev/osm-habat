import * as assert from 'assert'

import Filter from '../boca-filter.mjs'

// constructor

{ // empty query
	const query={}
	const expectedConditions={}
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // single filter parameter
	const query={
		'vs.type':'node',
	}
	const expectedConditions={
		vs:{
			type:'node',
		}
	}
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // single filter parameter
	const query={
		'vs.type':'node',
	}
	const expectedConditions={
		vs:{
			type:'node',
		}
	}
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // two same versiondescriptor filter parameters
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
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // two different versiondescriptor filter parameters
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
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // boolean true filter parameters
	const query={
		'vs.visible':'true',
	}
	const expectedConditions={
		vs:{
			visible:true,
		}
	}
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // boolean true (1) filter parameters
	const query={
		'vs.visible':'1',
	}
	const expectedConditions={
		vs:{
			visible:true,
		}
	}
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // boolean false filter parameters
	const query={
		'vs.visible':'false',
	}
	const expectedConditions={
		vs:{
			visible:false,
		}
	}
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // boolean false (0) filter parameters
	const query={
		'vs.visible':'0',
	}
	const expectedConditions={
		vs:{
			visible:false,
		}
	}
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // order parameter
	const query={
		'order':'name',
	}
	const expectedConditions={}
	const expectedOrder='name'
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // no filter lines
	const query={
		'filter':'',
	}
	const expectedConditions={}
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // one filter line
	const query={
		'filter':'vt.type=relation',
	}
	const expectedConditions={
		vt:{
			type:'relation',
		}
	}
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // two filter lines
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
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // two filter lines with empty lines
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
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // == operator line
	const query={
		'filter':'vs.version==2',
	}
	const expectedConditions={
		vs:{
			version:2,
		}
	}
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // >= operator line
	const query={
		'filter':'vs.version>=3',
	}
	const expectedConditions={
		vs:{
			version:[3,'>='],
		}
	}
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // < operator line
	const query={
		'filter':'vs.version<4',
	}
	const expectedConditions={
		vs:{
			version:[4,'<'],
		}
	}
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // order line
	const query={
		'filter':'order=name',
	}
	const expectedConditions={}
	const expectedOrder='name'
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // override text with a parameter
	const query={
		'filter':'vs.type=node',
		'vs.type':'way',
	}
	const expectedConditions={
		vs:{
			type:'way',
		}
	}
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}
{ // override text line with a next line
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
	const expectedOrder=undefined
	const filter=new Filter(query)
	assert.deepStrictEqual(filter.conditions,expectedConditions)
	assert.deepStrictEqual(filter.order,expectedOrder)
}

// query text

{ // empty filters/order
	const query={}
	const expectedText=''
	const filter=new Filter(query)
	assert.strictEqual(filter.text,expectedText)
}
{ // one filter, no order
	const query={
		'v1.type':'node',
	}
	const expectedText=
		'v1.type=node\n'
	const filter=new Filter(query)
	assert.strictEqual(filter.text,expectedText)
}
{ // two filters, no order
	const query={
		'vs.version':'10',
		'v1.type':'node',
	}
	const expectedText=
		'v1.type=node\n'+
		'vs.version=10\n'
	const filter=new Filter(query)
	assert.strictEqual(filter.text,expectedText)
}
{ // two filters, name order
	const query={
		'vs.version':'10',
		'v1.type':'node',
		'order':'name',
	}
	const expectedText=
		'v1.type=node\n'+
		'vs.version=10\n'+
		'order=name\n'
	const filter=new Filter(query)
	assert.strictEqual(filter.text,expectedText)
}
{ // repeat anything
	const query={
		'filter':
			'qwerty\n'+
			'asdfgh',
	}
	const expectedText=
		'qwerty\n'+
		'asdfgh\n'
	const filter=new Filter(query)
	assert.strictEqual(filter.text,expectedText)
}
{ // repeat anything + filters and order
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
		'order=name\n'
	const filter=new Filter(query)
	assert.strictEqual(filter.text,expectedText)
}

// filterElements()

function *gen(changesetsArray) {
	yield* changesetsArray
}

{
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
	const result2=[...filter.filterElements(
		project,gen(changesets),2
	)]
	assert.deepStrictEqual(result2,[
		['node',100001],
		['node',100002],
		['node',100008],
		['node',100012],
		['node',100013],
	])
	const result3=[...filter.filterElements(
		project,gen(changesets),3
	)]
	assert.deepStrictEqual(result3,[
		['node',100001,[3,4]],
		['node',100002,[2]],
		['node',100008,[7]],
		['node',100012,[8]],
		['node',100013,[2]],
	])
}
{ // count
	const makeDummyNode=()=>({})
	const project={
		store:{
			node:{
				100001:{
					3:makeDummyNode(),
					4:makeDummyNode(),
				},
				100002:{
					2:makeDummyNode(),
					3:makeDummyNode(),
					4:makeDummyNode(),
				},
				100003:{
					7:makeDummyNode(),
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
}

console.log('ran all boca-filter tests')
