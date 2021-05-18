import {strict as assert} from 'assert'

import {accumulateRcHrefs} from '../boca-common-patch.mjs'

describe("accumulateRcHrefs",()=>{
	it("joins 1st arg with undefined",()=>{
		assert.deepEqual(
			accumulateRcHrefs("whatever",undefined),
			[true,"whatever"]
		)
	})
	it("joins 2nd arg with undefined",()=>{
		assert.deepEqual(
			accumulateRcHrefs("who cares",undefined),
			[true,"who cares"]
		)
	})
	it("refuses to join unknown urls",()=>{
		assert.deepEqual(
			accumulateRcHrefs(
				"https://josm.openstreetmap.de/wiki/Help/RemoteControlCommands",
				"https://wiki.openstreetmap.org/wiki/Main_Page"
			),
			[false]
		)
	})
	it("joins addtags request with no-addtags request",()=>{
		assert.deepEqual(
			accumulateRcHrefs(
				"http://127.0.0.1:8111/load_object?objects=n8376569678",
				"http://127.0.0.1:8111/load_object?objects=n8376569678&addtags=name=Hello"
			),
			[true,
				"http://127.0.0.1:8111/load_object?objects=n8376569678&addtags=name=Hello"
			]
		)
	})
	it("joins two addtags requests",()=>{
		assert.deepEqual(
			accumulateRcHrefs(
				"http://127.0.0.1:8111/load_object?objects=n8376569678&addtags=name=Hello",
				"http://127.0.0.1:8111/load_object?objects=n8376569678&addtags=ref=42"
			),
			[true,
				"http://127.0.0.1:8111/load_object?objects=n8376569678&addtags=name=Hello%7Cref=42"
			]
		)
	})
})
