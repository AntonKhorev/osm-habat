import * as assert from 'assert'

import * as filter from '../boca-filter.mjs'

// parseQuery()

{ // empty query
	const query={}
	const expectedFilters={}
	const expectedOrder=undefined
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // single filter parameter
	const query={
		'vs.type':'node',
	}
	const expectedFilters={
		vs:{
			type:'node',
		}
	}
	const expectedOrder=undefined
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // single filter parameter
	const query={
		'vs.type':'node',
	}
	const expectedFilters={
		vs:{
			type:'node',
		}
	}
	const expectedOrder=undefined
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // two same versiondescriptor filter parameters
	const query={
		'vs.type':'way',
		'vs.version':'2',
	}
	const expectedFilters={
		vs:{
			type:'way',
			version:2,
		}
	}
	const expectedOrder=undefined
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // two different versiondescriptor filter parameters
	const query={
		'vs.type':'way',
		'vp.version':'3',
	}
	const expectedFilters={
		vs:{
			type:'way',
		},
		vp:{
			version:3,
		}
	}
	const expectedOrder=undefined
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // boolean true filter parameters
	const query={
		'vs.visible':'true',
	}
	const expectedFilters={
		vs:{
			visible:true,
		}
	}
	const expectedOrder=undefined
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // boolean true (1) filter parameters
	const query={
		'vs.visible':'1',
	}
	const expectedFilters={
		vs:{
			visible:true,
		}
	}
	const expectedOrder=undefined
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // boolean false filter parameters
	const query={
		'vs.visible':'false',
	}
	const expectedFilters={
		vs:{
			visible:false,
		}
	}
	const expectedOrder=undefined
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // boolean false (0) filter parameters
	const query={
		'vs.visible':'0',
	}
	const expectedFilters={
		vs:{
			visible:false,
		}
	}
	const expectedOrder=undefined
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // order parameter
	const query={
		'order':'name',
	}
	const expectedFilters={}
	const expectedOrder='name'
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // no filter lines
	const query={
		'filters':'',
	}
	const expectedFilters={}
	const expectedOrder=undefined
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // one filter line
	const query={
		'filters':'vt.type=relation',
	}
	const expectedFilters={
		vt:{
			type:'relation',
		}
	}
	const expectedOrder=undefined
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // two filter lines
	const query={
		'filters':
			'vt.type=relation\n'+
			'vt.visible=0\n'
	}
	const expectedFilters={
		vt:{
			type:'relation',
			visible:false,
		}
	}
	const expectedOrder=undefined
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // two filter lines with empty lines
	const query={
		'filters':
			'vt.type=node\n'+
			'\n'+
			'vt.visible=1\n'+
			'\n'
	}
	const expectedFilters={
		vt:{
			type:'node',
			visible:true,
		}
	}
	const expectedOrder=undefined
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}
{ // order line
	const query={
		'filters':'order=name',
	}
	const expectedFilters={}
	const expectedOrder='name'
	assert.deepStrictEqual(
		filter.parseQuery(query),
		[expectedFilters,expectedOrder]
	)
}

// filterElements()

const project={
	store:{
		// TODO
	},
}

function *gen(changesetsArray) {
	yield* changesetsArray
}

{
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
	const result2=[...filter.filterElements(
		project,gen(changesets),{},undefined,2
	)]
	assert.deepStrictEqual(result2,[
		['node',100001],
		['node',100002],
		['node',100008],
		['node',100012],
		['node',100013],
	])
	const result3=[...filter.filterElements(
		project,gen(changesets),{},undefined,3
	)]
	assert.deepStrictEqual(result3,[
		['node',100001,[3,4]],
		['node',100002,[2]],
		['node',100008,[7]],
		['node',100012,[8]],
		['node',100013,[2]],
	])
}

console.log('ran all boca-filter tests')
