import assert from 'assert'

import Redaction from '../boca-redaction.mjs'

describe("Redaction",()=>{
	context("when no targets specified",()=>{
		const redaction=new Redaction()
		it("doesn't match any keys",()=>{
			assert.equal(
				redaction.isTagKeyInTargets('name'),
				false
			)
			assert.equal(
				redaction.isTagKeyInTargets('ref'),
				false
			)
			assert.equal(
				redaction.isTagKeyInTargets('addr:street'),
				false
			)
		})
	})
	context("when one target specified",()=>{
		const redaction=new Redaction()
		redaction.targets['name']=1
		it("matches target key",()=>{
			assert.equal(
				redaction.isTagKeyInTargets('name'),
				true
			)
		})
		it("doesn't match other keys",()=>{
			assert.equal(
				redaction.isTagKeyInTargets('ref'),
				false
			)
			assert.equal(
				redaction.isTagKeyInTargets('addr:street'),
				false
			)
		})
	})
	context("when two target specified",()=>{
		const redaction=new Redaction()
		redaction.targets['name']=1
		redaction.targets['ref']=1
		it("matches both target keys",()=>{
			assert.equal(
				redaction.isTagKeyInTargets('name'),
				true
			)
			assert.equal(
				redaction.isTagKeyInTargets('ref'),
				true
			)
		})
		it("doesn't match other keys",()=>{
			assert.equal(
				redaction.isTagKeyInTargets('addr:street'),
				false
			)
		})
	})
	context("when wildcard target specified",()=>{
		const redaction=new Redaction()
		redaction.targets['addr:*']=1
		it("doesn't match other keys",()=>{
			assert.equal(
				redaction.isTagKeyInTargets('name'),
				false
			)
			assert.equal(
				redaction.isTagKeyInTargets('ref'),
				false
			)
		})
		it("matches target wildcard",()=>{
			assert.equal(
				redaction.isTagKeyInTargets('addr:street'),
				true
			)
			assert.equal(
				redaction.isTagKeyInTargets('addr:city'),
				true
			)
		})
	})
})
