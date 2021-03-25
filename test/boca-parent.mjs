import * as assert from 'assert'

import ParentChecker from '../boca-parent.mjs'

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
//	assert.equal(
//		pc.getParentWay(42),
//		undefined,
//		"Get parent of deleted way"
//	)
//}
//{
//	const pc=new ParentChecker()
//	pc.addPreviousWay(42,[1,2,3])
//	pc.addCurrentWay(42,[1,2,3])
//	assert.equal(
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
	//assert.equal(
	//	pc.getParentWay(100),
	//	100,
	//	"Get parent of split on new node - beginning segment"
	//)
	assert.equal(
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
	//assert.equal(
	//	pc.getParentWay(200),
	//	200,
	//	"Get parent of split on existing node - beginning segment"
	//)
	assert.equal(
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
	assert.equal(
		pc.getParentWay(300),
		300,
		"Get parent of middle section cutout - beginning segment"
	)
	assert.equal(
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
	//assert.equal(
	//	pc.getParentWay(100),
	//	100,
	//	"Get parent of unmodified way"
	//)
	assert.equal(
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
	//assert.equal(
	//	pc.getParentWay(100),
	//	100,
	//	"Get parent of reversed way"
	//)
	assert.equal(
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
	//assert.equal(
	//	pc.getParentWay(100),
	//	100,
	//	"Get parent of 3-way split - original way"
	//)
	assert.equal(
		pc.getParentWay(101),
		100,
		"Get parent of 3-way split - 2nd sement"
	)
	assert.equal(
		pc.getParentWay(102),
		100,
		"Get parent of 3-way split - 3nd sement"
	)
	assert.equal(
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
	//assert.equal(
	//	pc.getParentWay(100),
	//	100,
	//	"Get parent of triangle addition - old way"
	//)
	assert.equal(
		pc.getParentWay(101),
		undefined,
		"Get parent of triangle addition - new way 1"
	)
	assert.equal(
		pc.getParentWay(102),
		undefined,
		"Get parent of triangle addition - new way 2"
	)
}
{
	const pc=new ParentChecker()
	pc.addPreviousWay(23,[1,2,3])
	pc.addCurrentWay(42,[1,2,3])
	assert.equal(
		pc.getParentWay(42),
		23,
		"Get parent of deleted and replaced way"
	)
}

console.log('ran all boca-parent tests')
