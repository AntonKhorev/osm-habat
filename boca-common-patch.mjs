export function accumulateRcHrefs(href1,href2) { // combines addtags param
	if (href1==null) return [true,href2]
	if (href2==null) return [true,href1]
	const targetParam='addtags='
	const splitHref=(href)=>{
		const match=href.match(new RegExp('^(http://127\.0\.0\.1:8111/[^?]*\?)(.*)$'))
		if (!match) return [false]
		const [,baseString,paramString]=match
		const params=[]
		let addtags
		for (const param of paramString.split('&')) {
			if (param.startsWith(targetParam)) {
				addtags=param.slice(targetParam.length)
			} else {
				params.push(param)
			}
		}
		return [true,baseString+params.join('&'),addtags]
	}
	const combineTargetParam=(tags1,tags2)=>{
		if (tags1==null && tags2==null) return ''
		if (tags1==null || tags2==null) return '&'+targetParam+(tags1??tags2)
		return '&'+targetParam+tags1+'%7C'+tags2 // https://josm.openstreetmap.de/wiki/Help/RemoteControlCommands#addtags
	}
	const [ok1,base1,tags1]=splitHref(href1)
	const [ok2,base2,tags2]=splitHref(href2)
	if (!ok1 || !ok2) return [false]
	if (base1!=base2) return [false]
	return [true,base1+combineTargetParam(tags1,tags2)]
}
export const escapeHtml=(s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
