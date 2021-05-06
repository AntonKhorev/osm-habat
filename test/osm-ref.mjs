import * as assert from 'assert'

import * as osmRef from '../osm-ref.mjs'

describe("osmRef.element",()=>{
	it("throws on osm link with no element",()=>assert.throws(()=>{
		osmRef.element('https://www.openstreetmap.org/')
	}))
	it("throws on missing node id",()=>assert.throws(()=>{
		osmRef.element('node')
	}))
	it("throws on gibberish",()=>assert.throws(()=>{
		osmRef.element('jeonnsdlkglk;sjeji')
	}))
	it("parses node osm link",()=>assert.deepStrictEqual(
		osmRef.element('https://www.openstreetmap.org/node/4861913871'),
		['node',4861913871]
	))
	it("parses way osm link",()=>assert.deepStrictEqual(
		osmRef.element('https://www.openstreetmap.org/way/231825092'),
		['way',231825092]
	))
	it("parses relation osm link",()=>assert.deepStrictEqual(
		osmRef.element('https://www.openstreetmap.org/relation/421007'),
		['relation',421007]
	))
	it("parses way osm link with anchor",()=>assert.deepStrictEqual(
		osmRef.element('https://www.openstreetmap.org/way/263157243#map=18/59.85437/30.21591'),
		['way',263157243]
	))
	it("parses node history osm link",()=>assert.deepStrictEqual(
		osmRef.element('https://www.openstreetmap.org/node/4861913872/history'),
		['node',4861913872]
	))
	it("parses plaintext node",()=>assert.deepStrictEqual(
		osmRef.element('node 12345'),
		['node',12345]
	))
	it("parses shorthand node",()=>assert.deepStrictEqual(
		osmRef.element('n67890'),
		['node',67890]
	))
	it("parses copypaste from osmcha popup",()=>assert.deepStrictEqual(
		osmRef.element('WAY: 123654'),
		['way',123654]
	))
})

describe("osmRef.changeset",()=>{
	it("throws on osm link with no changeset",()=>assert.throws(()=>{
		osmRef.changeset('https://www.openstreetmap.org/')
	}))
	it("throws on missing changeset id",()=>assert.throws(()=>{
		osmRef.changeset('changeset')
	}))
	it("throws on gibberish",()=>assert.throws(()=>{
		osmRef.changeset('jeonnsdlkglk;sjeji')
	}))
	it("throws on fractional number",()=>assert.throws(()=>{
		osmRef.changeset('12.5')
	}))
	it("parses id",()=>assert.deepStrictEqual(
		osmRef.changeset('111222333'),
		111222333
	))
	it("parses osm link",()=>assert.deepStrictEqual(
		osmRef.changeset('https://www.openstreetmap.org/changeset/123456'),
		123456
	))
	it("parses osm link subpage",()=>assert.deepStrictEqual(
		osmRef.changeset('https://www.openstreetmap.org/changeset/234567?way_page=2'),
		234567
	))
	it("parses osm link with anchor",()=>assert.deepStrictEqual(
		osmRef.changeset('https://www.openstreetmap.org/changeset/345678#map=13/40.7254/-73.4899'),
		345678
	))
	it("parses download api call",()=>assert.deepStrictEqual(
		osmRef.changeset('https://www.openstreetmap.org/api/0.6/changeset/1234567/download'),
		1234567
	))
})
