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

describe("TagChangeTracker",()=>{
	it("provides no action if there's no in-version",()=>{
		const tracker=runTracker([
			[NULL],
			[OUT,1],
		])
		assert.equal(tracker.action,null)
	})
	it("provides no action if the tag is not added to a new element",()=>{
		const tracker=runTracker([
			[NULL],
			[IN,1],
		])
		assert.equal(tracker.action,null)
	})
	it("provides delete if the tag added to a new element",()=>{
		const tracker=runTracker([
			[NULL],
			[IN,1,'foo'],
		])
		assert.equal(tracker.action,'delete')
		assert.strictEqual(tracker.value,'')
		assert.deepStrictEqual(tracker.versions,[1])
	})
	it("refrains from providing an action if the previous state is unknown",()=>{
		const tracker=runTracker([
			[UNKNOWN],
			[IN,11,'foo'],
		])
		assert.equal(tracker.action,null)
	})
	it("provides no action if the tag is not added to an existing element",()=>{
		const tracker=runTracker([
			[NULL],
			[OUT,1],
			[IN ,2],
		])
		assert.equal(tracker.action,null)
	})
	it("provides undo if the tag added to an existing element",()=>{
		const tracker=runTracker([
			[NULL],
			[OUT,1],
			[IN ,2,'boo!'],
		])
		assert.equal(tracker.action,'undo')
		assert.strictEqual(tracker.value,'')
		assert.deepStrictEqual(tracker.versions,[2])
	})
	it("provides no action if the tag is not modified on an existing element",()=>{
		const tracker=runTracker([
			[NULL],
			[OUT,1,'foo'],
			[IN, 2,'foo'],
		])
		assert.equal(tracker.action,null)
	})
	it("provides undo if the tag is modified on an existing element",()=>{
		const tracker=runTracker([
			[NULL],
			[OUT,1,'foo'],
			[IN, 2,'bar'],
		])
		assert.equal(tracker.action,'undo')
		assert.strictEqual(tracker.value,'foo')
		assert.deepStrictEqual(tracker.versions,[2])
	})
	it("provides undo if the tag is modified on an existing element and kept in later out-versions",()=>{
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
	})
	it("provides hide if the tag change is undone in an out-version",()=>{
		const tracker=runTracker([
			[NULL],
			[OUT,1,'foo'],
			[IN, 2,'bar'],
			[OUT,3,'bar'],
			[OUT,4,'foo'],
		])
		assert.equal(tracker.action,'hide')
		assert.deepStrictEqual(tracker.versions,[2,3])
	})
	it("provides undo if the in-version change won an edit war",()=>{
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
	})
	it("provides undo for possibly tainted versions",()=>{
		const tracker=runTracker([
			[NULL],
			[OUT,1,'foo'],
			[IN, 2,'bar'],
			[OUT,3,'baz'],
		])
		assert.equal(tracker.action,'undo')
		assert.strictEqual(tracker.value,'foo')
		assert.deepStrictEqual(tracker.versions,[2,3])
	})
	it("provides undo for possibly tainted versions but skips untainted ones",()=>{
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
	})
})
