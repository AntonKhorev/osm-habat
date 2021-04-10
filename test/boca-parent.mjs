import * as assert from 'assert'

import {ParentChecker,createParentQuery} from '../boca-parent.mjs'

{
	const pc=new ParentChecker()
	assert.throws(()=>{
		pc.getParentWay(123)
	},null,
		"Get parent of way that wasn't added"
	)
}
{
	const pc=new ParentChecker()
	pc.addPreviousWay(456,[1,2,3])
	assert.throws(()=>{
		pc.getParentWay(456)
	},null,
		"Get parent of previously existing way"
	)
}
{
	const pc=new ParentChecker()
	pc.addPreviousWay(456,[1,2,3])
	assert.throws(()=>{
		pc.addPreviousWay(456,[3,2,1])
	},null,
		"Add previous way twice"
	)
}
{
	const pc=new ParentChecker()
	pc.addCurrentWay(456,[1,2,3])
	assert.throws(()=>{
		pc.addCurrentWay(456,[3,2,1])
	},null,
		"Add current way twice"
	)
}
{
	const pc=new ParentChecker()
	pc.addCurrentWay(42,[1,2,3])
	assert.equal(
		pc.getParentWay(42),
		undefined,
		"Get parent of newly added way"
	)
}
//{
//	const pc=new ParentChecker()
//	pc.addPreviousWay(42,[1,2,3])
//	assert.strictEqual(
//		pc.getParentWay(42),
//		undefined,
//		"Get parent of deleted way"
//	)
//}
//{
//	const pc=new ParentChecker()
//	pc.addPreviousWay(42,[1,2,3])
//	pc.addCurrentWay(42,[1,2,3])
//	assert.strictEqual(
//		pc.getParentWay(42),
//		42,
//		"Get parent of previously existing way"
//	)
//}
{
	const pc=new ParentChecker()
	pc.addPreviousWay(100,[1,3])
	pc.addCurrentWay(100,[1,2])
	pc.addCurrentWay(101,[2,3])
	//assert.strictEqual(
	//	pc.getParentWay(100),
	//	100,
	//	"Get parent of split on new node - beginning segment"
	//)
	assert.strictEqual(
		pc.getParentWay(101),
		100,
		"Get parent of split on new node - ending segment"
	)
}
{
	const pc=new ParentChecker()
	pc.addPreviousWay(200,[1,2,3])
	pc.addCurrentWay(200,[1,2])
	pc.addCurrentWay(201,[2,3])
	//assert.strictEqual(
	//	pc.getParentWay(200),
	//	200,
	//	"Get parent of split on existing node - beginning segment"
	//)
	assert.strictEqual(
		pc.getParentWay(201),
		200,
		"Get parent of split on existing node - ending segment"
	)
}
/* can't handle this case b/c rely on connectivity from start to end node
{
	const pc=new ParentChecker()
	pc.addPreviousWay(300,[1,2,3,4])
	pc.addCurrentWay(300,[1,2])
	pc.addCurrentWay(301,[3,4])
	assert.strictEqual(
		pc.getParentWay(300),
		300,
		"Get parent of middle section cutout - beginning segment"
	)
	assert.strictEqual(
		pc.getParentWay(301),
		300,
		"Get parent of middle section cutout - ending segment"
	)
}
*/
{
	const pc=new ParentChecker()
	pc.addPreviousWay(100,[1,2,3])
	pc.addCurrentWay(100,[1,2,3])
	pc.addCurrentWay(101,[1,4])
	//assert.strictEqual(
	//	pc.getParentWay(100),
	//	100,
	//	"Get parent of unmodified way"
	//)
	assert.strictEqual(
		pc.getParentWay(101),
		undefined,
		"Get parent of new way joined with unmodified way"
	)
}
{
	const pc=new ParentChecker()
	pc.addPreviousWay(100,[1,2,3])
	pc.addCurrentWay(100,[3,2,1])
	pc.addCurrentWay(101,[1,4])
	//assert.strictEqual(
	//	pc.getParentWay(100),
	//	100,
	//	"Get parent of reversed way"
	//)
	assert.strictEqual(
		pc.getParentWay(101),
		undefined,
		"Get parent of new way joined with reversed way"
	)
}
{
	const pc=new ParentChecker()
	pc.addPreviousWay(100,[1,4])
	pc.addCurrentWay(100,[1,2])
	pc.addCurrentWay(101,[2,3])
	pc.addCurrentWay(102,[3,4])
	pc.addCurrentWay(103,[2,5])
	//assert.strictEqual(
	//	pc.getParentWay(100),
	//	100,
	//	"Get parent of 3-way split - original way"
	//)
	assert.strictEqual(
		pc.getParentWay(101),
		100,
		"Get parent of 3-way split - 2nd sement"
	)
	assert.strictEqual(
		pc.getParentWay(102),
		100,
		"Get parent of 3-way split - 3nd sement"
	)
	assert.strictEqual(
		pc.getParentWay(103),
		undefined,
		"Get parent of 3-way split - offshoot"
	)
}
{
	const pc=new ParentChecker()
	pc.addPreviousWay(100,[1,2,4,5])
	pc.addCurrentWay(100,[1,2,3,4,5])
	pc.addCurrentWay(101,[1,10,11,12])
	pc.addCurrentWay(102,[12,13,14,5])
	//assert.strictEqual(
	//	pc.getParentWay(100),
	//	100,
	//	"Get parent of triangle addition - old way"
	//)
	assert.strictEqual(
		pc.getParentWay(101),
		undefined,
		"Get parent of triangle addition - new way 1"
	)
	assert.strictEqual(
		pc.getParentWay(102),
		undefined,
		"Get parent of triangle addition - new way 2"
	)
}
{
	const pc=new ParentChecker()
	pc.addPreviousWay(23,[1,2,3])
	pc.addCurrentWay(42,[1,2,3])
	assert.strictEqual(
		pc.getParentWay(42),
		23,
		"Get parent of deleted and replaced way"
	)
}

{
	const way=(...nds)=>({nds,visible:true})
	const store={
		way:{
			201:{
				1:way(101,102,103),
				2:way(101,102),
			},
			202:{
				1:way(102,103),
			},
		}
	}
	const changes=[
		['modify','way',201,2],
		['create','way',202,1],
	]
	const eid=202
	const expectedParent=[201,1]
	const parentQuery=createParentQuery(store,changes)
	const parent=parentQuery(eid)
	assert.deepStrictEqual(parent,expectedParent)
}

console.log('ran all boca-parent tests')
