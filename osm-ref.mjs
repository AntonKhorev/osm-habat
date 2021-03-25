export function element(s) {
	let match
	if (match=s.match(/(node|way|relation)[ /]?(\d+)/)) {
		const [,etype,eidString]=match
		return [etype,Number(eidString)]
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
