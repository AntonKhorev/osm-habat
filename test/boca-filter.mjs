import * as assert from 'assert'

import filterElements from '../boca-filter.mjs'

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
	const result2=[...filterElements(
		project,gen(changesets),{},undefined,2
	)]
	assert.deepStrictEqual(result2,[
		['node',100001],
		['node',100002],
		['node',100008],
		['node',100012],
		['node',100013],
	])
	const result3=[...filterElements(
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
