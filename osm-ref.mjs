export function element(s) {
	let match
	if (match=s.match(/(node|way|relation)[/:]?\s*(\d+)/i)) {
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
	if (match=s.match(/changeset[/:]?\s*(\d+)/i)) {
		const [,cidString]=match
		return Number(cidString)
	}
	throw new Error(`Invalid changeset reference "${s}"`)
}
