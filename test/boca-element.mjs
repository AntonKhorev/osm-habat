import {strict as assert} from 'assert'

import {IN,OUT,PARENT,UNKNOWN,NULL,TagChangeTracker} from '../boca-element.mjs'

const runTracker=(table,exactMode=false)=>{
	const tagKey='x'
	const adaptTableEntry=([state,version,tagValue,visible])=>{
		if (state==NULL || state==UNKNOWN) return [state,undefined,undefined]
		const data={
			visible:true,
			tags:{},
		}
		if (visible!=null) data.visible=visible
		if (tagValue) data.tags[tagKey]=tagValue
		return [state,version,data]
	}
	const tracker=new TagChangeTracker(tagKey,exactMode)
	for (let i=1;i<table.length;i++) {
		tracker.trackChange(
			...adaptTableEntry(table[i]),
			...adaptTableEntry(table[i-1])
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
		assert.equal(tracker.value,'')
		assert.deepEqual(tracker.versions,[1])
	})
	it("provides delete if the tag added to a new element and then other in-version edit is made",()=>{
		const tracker=runTracker([
			[NULL],
			[IN,1,'foo'],
			[IN,2,'foo'],
		])
		assert.equal(tracker.action,'delete')
		assert.equal(tracker.value,'')
		assert.deepEqual(tracker.versions,[1,2])
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
		assert.equal(tracker.value,'')
		assert.deepEqual(tracker.versions,[2])
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
		assert.equal(tracker.value,'foo')
		assert.deepEqual(tracker.versions,[2])
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
		assert.equal(tracker.value,'foo')
		assert.deepEqual(tracker.versions,[2,3,4])
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
		assert.deepEqual(tracker.versions,[2,3])
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
		assert.equal(tracker.value,'foo')
		assert.deepEqual(tracker.versions,[2,4,6])
	})
	it("provides undo for possibly tainted versions",()=>{
		const tracker=runTracker([
			[NULL],
			[OUT,1,'foo'],
			[IN, 2,'bar'],
			[OUT,3,'baz'],
		])
		assert.equal(tracker.action,'undo')
		assert.equal(tracker.value,'foo')
		assert.deepEqual(tracker.versions,[2,3])
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
		assert.equal(tracker.value,'foo')
		assert.deepEqual(tracker.versions,[2,4,5,6])
	})
	it("provides no action for a deletion in an in-version",()=>{
		const tracker=runTracker([
			[UNKNOWN],
			[OUT,5,'hush'],
			[IN,6,,false],
		])
		assert.equal(tracker.action,null)
	})
	it("provides hide for a change followed by a deletion in an in-version",()=>{
		const tracker=runTracker([
			[UNKNOWN],
			[OUT,5,'hush'],
			[IN,6,'push'],
			[IN,7,,false],
		])
		assert.equal(tracker.action,'hide')
		assert.deepEqual(tracker.versions,[6])
	})
	it("provides hide in exact mode",()=>{
		const tracker=runTracker([
			[NULL],
			[OUT,1,'foo'],
			[IN, 2,'bar'],
			[OUT,3,'burr'],
			[IN, 4,'bar'],
			[OUT,5,'burr'],
			[IN, 6,'burr'],
		],true)
		assert.equal(tracker.action,'hide')
		assert.deepEqual(tracker.versions,[2,4])
	})
})
