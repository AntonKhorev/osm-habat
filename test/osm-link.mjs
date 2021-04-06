import * as assert from 'assert'

import * as osmLink from '../osm-link.mjs'

{
	assert.equal(
		''+osmLink.username('FakeUser'),
		'https://www.openstreetmap.org/user/FakeUser'
	)
	assert.equal(
		''+osmLink.username('FakeUser').history,
		'https://www.openstreetmap.org/user/FakeUser/history'
	)
}

console.log('ran all osm-link tests')
