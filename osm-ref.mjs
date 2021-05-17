export function element(s) {
	let match
	if (match=plaintextMatch(s,'(node|way|relation)')) {
		const [,etype,eidString]=match
		return [etype.toLowerCase(),Number(eidString)]
	} else if (match=s.match(/([nwr])(\d+)/)) {
		const [,etypeLetter,eidString]=match
		return [{
			n:'node',
			w:'way',
			r:'relation',
		}[etypeLetter],Number(eidString)]
	}
	throw new Error(`Invalid element reference "${s}"`)
}

export function changeset(s) {
	const n=Number(s)
	if (Number.isInteger(n)) return n
	let match
	if (match=plaintextMatch(s,'c(?:hange)?set')) {
		const [,cidString]=match
		return Number(cidString)
	}
	throw new Error(`Invalid changeset reference "${s}"`)
}

export function user(s) {
	const n=Number(s)
	if (Number.isInteger(n)) return ["id",n]
	let match
	if (match=s.match(/(['"])(.*)\1/)) {
		const [,,username]=match
		return ["name",username]
	} else if (match=plaintextMatch(s,'(?:user|uid)')) {
		const [,uidString]=match
		return ["id",Number(uidString)]
	}
	try {
		const url=new URL(s)
		if (url.host=='www.openstreetmap.org') {
			const [,userPathDir,userPathEnd]=url.pathname.split('/')
			if (userPathDir=='user') {
				const username=decodeURIComponent(userPathEnd)
				return ["name",username]
			}
		} else if (url.host=='hdyc.neis-one.org') {
			if (url.search.length>1) {
				const username=decodeURIComponent(url.search).substr(1)
				return ["name",username]
			}
		} else if (url.host=='resultmaps.neis-one.org') {
			const uid=Number(url.searchParams.get('uid'))
			return ["id",uid]
		}
	} catch {}
	throw new Error(`Invalid user reference "${s}"`)
}

function plaintextMatch(s,regExpStart) {
	return s.match(new RegExp(regExpStart+'[/:]?\\s*#?(\\d+)','i'))
}
