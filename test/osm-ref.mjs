import * as assert from 'assert'

import * as osmRef from '../osm-ref.mjs'

describe("osmRef.element",()=>{
	const fn=(...args)=>osmRef.element(...args)
	it("throws on osm link with no element",()=>assert.throws(()=>{
		fn('https://www.openstreetmap.org/')
	}))
	it("throws on missing node id",()=>assert.throws(()=>{
		fn('node')
	}))
	it("throws on gibberish",()=>assert.throws(()=>{
		fn('jeonnsdlkglk;sjeji')
	}))
	it("parses node osm link",()=>assert.deepStrictEqual(
		fn('https://www.openstreetmap.org/node/4861913871'),
		['node',4861913871]
	))
	it("parses way osm link",()=>assert.deepStrictEqual(
		fn('https://www.openstreetmap.org/way/231825092'),
		['way',231825092]
	))
	it("parses relation osm link",()=>assert.deepStrictEqual(
		fn('https://www.openstreetmap.org/relation/421007'),
		['relation',421007]
	))
	it("parses way osm link with anchor",()=>assert.deepStrictEqual(
		fn('https://www.openstreetmap.org/way/263157243#map=18/59.85437/30.21591'),
		['way',263157243]
	))
	it("parses node history osm link",()=>assert.deepStrictEqual(
		fn('https://www.openstreetmap.org/node/4861913872/history'),
		['node',4861913872]
	))
	it("parses plaintext node",()=>assert.deepStrictEqual(
		fn('node 12345'),
		['node',12345]
	))
	it("parses plaintext node with hash",()=>assert.deepStrictEqual(
		fn('node #12354'),
		['node',12354]
	))
	it("parses shorthand node",()=>assert.deepStrictEqual(
		fn('n67890'),
		['node',67890]
	))
	it("parses copypaste from osmcha popup",()=>assert.deepStrictEqual(
		fn('WAY: 123654'),
		['way',123654]
	))
})

describe("osmRef.changeset",()=>{
	const fn=(...args)=>osmRef.changeset(...args)
	it("throws on osm link with no changeset",()=>assert.throws(()=>{
		fn('https://www.openstreetmap.org/')
	}))
	it("throws on missing changeset id",()=>assert.throws(()=>{
		fn('changeset')
	}))
	it("throws on gibberish",()=>assert.throws(()=>{
		fn('jeonnsdlkglk;sjeji')
	}))
	it("throws on fractional number",()=>assert.throws(()=>{
		fn('12.5')
	}))
	it("parses id",()=>assert.deepStrictEqual(
		fn('111222333'),
		111222333
	))
	it("parses plaintext",()=>assert.deepStrictEqual(
		fn('changeset 100500'),
		100500
	))
	it("parses shorter plaintext",()=>assert.deepStrictEqual(
		fn('cset 500500'),
		500500
	))
	it("parses plaintext with hash",()=>assert.deepStrictEqual(
		fn('changeset #500100'),
		500100
	))
	it("throws on user plaintext",()=>assert.throws(()=>{
		fn('user 100501')
	}))
	it("parses osm link",()=>assert.deepStrictEqual(
		fn('https://www.openstreetmap.org/changeset/123456'),
		123456
	))
	it("parses osm link subpage",()=>assert.deepStrictEqual(
		fn('https://www.openstreetmap.org/changeset/234567?way_page=2'),
		234567
	))
	it("parses osm link with anchor",()=>assert.deepStrictEqual(
		fn('https://www.openstreetmap.org/changeset/345678#map=13/40.7254/-73.4899'),
		345678
	))
	it("parses download api call",()=>assert.deepStrictEqual(
		fn('https://www.openstreetmap.org/api/0.6/changeset/1234567/download'),
		1234567
	))
})

describe("osmRef.user",()=>{
	const fn=(...args)=>osmRef.user(...args)
	it("throws on hdyc url with no user",()=>assert.throws(()=>{
		fn('http://hdyc.neis-one.org/')
	}))
	it("parses osm url",()=>assert.deepStrictEqual(
		fn("https://www.openstreetmap.org/user/testing%20testing"),
		["name","testing testing"]
	))
	it("parses osm url with extras",()=>assert.deepStrictEqual(
		fn("https://www.openstreetmap.org/user/blabla/history#map=3/33.55/-18.30"),
		["name","blabla"]
	))
	it("parses https hdyc url",()=>assert.deepStrictEqual(
		fn("https://hdyc.neis-one.org/?Another%20user"),
		["name","Another user"]
	))
	it("parses double-quoted username",()=>assert.deepStrictEqual(
		fn('"hello world"'),
		["name","hello world"]
	))
	it("parses double-quoted username with quote inside",()=>assert.deepStrictEqual(
		fn('"oops " hehe"'),
		["name",'oops " hehe']
	))
	it("parses single-quoted username",()=>assert.deepStrictEqual(
		fn("'h e l l o'"),
		["name","h e l l o"]
	))
	it("parses id",()=>assert.deepStrictEqual(
		fn("937929348"),
		["id",937929348]
	))
	it("parses resultmaps uid comments url",()=>assert.deepStrictEqual(
		fn("https://resultmaps.neis-one.org/osm-discussion-comments?uid=892374972"),
		["id",892374972],
	))
	it("parses plaintext",()=>assert.deepStrictEqual(
		fn('user 1020304'),
		["id",1020304],
	))
})
