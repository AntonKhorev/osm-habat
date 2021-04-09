import * as assert from 'assert'

import * as osmRef from '../osm-ref.mjs'

{
	assert.throws(()=>{
		osmRef.element('https://www.openstreetmap.org/')
	},null,
		"osm link with no element"
	)
	assert.throws(()=>{
		osmRef.element('node')
	},null,
		"missing node id"
	)
	assert.throws(()=>{
		osmRef.element('jeonnsdlkglk;sjeji')
	},null,
		"gibberish"
	)
	assert.deepStrictEqual(
		osmRef.element('https://www.openstreetmap.org/node/4861913871'),
		['node',4861913871],
		'node osm link'
	)
	assert.deepStrictEqual(
		osmRef.element('https://www.openstreetmap.org/way/231825092'),
		['way',231825092],
		'way osm link'
	)
	assert.deepStrictEqual(
		osmRef.element('https://www.openstreetmap.org/relation/421007'),
		['relation',421007],
		'relation osm link'
	)
	assert.deepStrictEqual(
		osmRef.element('https://www.openstreetmap.org/way/263157243#map=18/59.85437/30.21591'),
		['way',263157243],
		'way osm link with anchor'
	)
	assert.deepStrictEqual(
		osmRef.element('https://www.openstreetmap.org/node/4861913872/history'),
		['node',4861913872],
		'node history osm link'
	)
	assert.deepStrictEqual(
		osmRef.element('node 12345'),
		['node',12345],
		'plaintext node'
	)
	assert.deepStrictEqual(
		osmRef.element('n67890'),
		['node',67890],
		'shorthand node'
	)
	assert.deepStrictEqual(
		osmRef.element('WAY: 123654'),
		['way',123654],
		'copypaste from osmcha popup'
	)
}

console.log('ran all osm-ref tests')
