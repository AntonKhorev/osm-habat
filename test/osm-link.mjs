import * as assert from 'assert'

import * as osmLink from '../osm-link.mjs'

describe("osmLink.username",()=>{
	it("returns osm profile url",()=>assert.equal(
		''+osmLink.username('FakeUser'),
		'https://www.openstreetmap.org/user/FakeUser'
	))
	it("returns osm history url",()=>assert.equal(
		''+osmLink.username('FakeUser').history,
		'https://www.openstreetmap.org/user/FakeUser/history'
	))
})
