import * as assert from 'assert'

import {IN,OUT,PARENT,UNKNOWN,NULL,TagChangeTracker} from '../boca-element.mjs'

const runTracker=(table)=>{
	const tracker=new TagChangeTracker()
	for (let i=1;i<table.length;i++) {
		tracker.trackChange(
			table[i][0],table[i][1],table[i][2],
			table[i-1][0],table[i-1][1],table[i-1][2]
		)
	}
	return tracker
}

{ // no in-version
	const tracker=runTracker([
		[NULL],
		[OUT,1],
	])
	assert.equal(tracker.action,null)
}
{ // tag not added for new element
	const tracker=runTracker([
		[NULL],
		[IN,1],
	])
	assert.equal(tracker.action,null)
}
{ // tag added for new element
	const tracker=runTracker([
		[NULL],
		[IN,1,'foo'],
	])
	assert.equal(tracker.action,'delete')
	assert.strictEqual(tracker.value,'')
	assert.deepStrictEqual(tracker.versions,[1])
}
{ // can't do anything b/c previous state is unknown
	const tracker=runTracker([
		[UNKNOWN],
		[IN,11,'foo'],
	])
	assert.equal(tracker.action,null)
}
{ // tag not added for modified element
	const tracker=runTracker([
		[NULL],
		[OUT,1],
		[IN ,2],
	])
	assert.equal(tracker.action,null)
}
{ // tag added for new element
	const tracker=runTracker([
		[NULL],
		[OUT,1],
		[IN ,2,'boo!'],
	])
	assert.equal(tracker.action,'undo')
	assert.strictEqual(tracker.value,'')
	assert.deepStrictEqual(tracker.versions,[2])
}
{ // tag not modified
	const tracker=runTracker([
		[NULL],
		[OUT,1,'foo'],
		[IN, 2,'foo'],
	])
	assert.equal(tracker.action,null)
}
{ // tag modified
	const tracker=runTracker([
		[NULL],
		[OUT,1,'foo'],
		[IN, 2,'bar'],
	])
	assert.equal(tracker.action,'undo')
	assert.strictEqual(tracker.value,'foo')
	assert.deepStrictEqual(tracker.versions,[2])
}
{ // tag modified and kept in multiple versions
	const tracker=runTracker([
		[NULL],
		[OUT,1,'foo'],
		[IN, 2,'bar'],
		[OUT,3,'bar'],
		[OUT,4,'bar'],
	])
	assert.equal(tracker.action,'undo')
	assert.strictEqual(tracker.value,'foo')
	assert.deepStrictEqual(tracker.versions,[2,3,4])
}
{ // tag modified, kept in multiple versions then undone
	const tracker=runTracker([
		[NULL],
		[OUT,1,'foo'],
		[IN, 2,'bar'],
		[OUT,3,'bar'],
		[OUT,4,'foo'],
	])
	assert.equal(tracker.action,'hide')
	assert.deepStrictEqual(tracker.versions,[2,3])
}
{ // tag editwar
	const tracker=runTracker([
		[NULL],
		[OUT,1,'foo'],
		[IN, 2,'bar'],
		[OUT,3,'foo'],
		[IN, 4,'bar'],
		[OUT,5,'foo'],
		[IN, 6,'bar'],
	])
	assert.equal(tracker.action,'undo')
	assert.strictEqual(tracker.value,'foo')
	assert.deepStrictEqual(tracker.versions,[2,4,6])
}
{ // multiple tainted versions
	const tracker=runTracker([
		[NULL],
		[OUT,1,'foo'],
		[IN, 2,'bar'],
		[OUT,3,'foo'],
		[IN, 4,'baz'],
		[OUT,5,'baz'],
		[OUT,6,'bar'],
	])
	assert.equal(tracker.action,'undo')
	assert.strictEqual(tracker.value,'foo')
	assert.deepStrictEqual(tracker.versions,[2,4,5,6])
}
{ // changes after tainting
	const tracker=runTracker([
		[NULL],
		[OUT,1,'foo'],
		[IN, 2,'bar'],
		[OUT,3,'baz'],
	])
	assert.equal(tracker.action,'undo')
	assert.strictEqual(tracker.value,'foo')
	assert.deepStrictEqual(tracker.versions,[2,3])
}

console.log('ran all boca-element tests')
