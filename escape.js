// html template tag
// usage example for attributes: e.h`<input type=text value=${value}>`
// usage example for elements: e.h`<option>${option}</option>`
exports.h=(strings,...values)=>{
	return strings.reduce((r,s,i)=>{
		let v=values[i-1]
		if (r.slice(-1)=='=') {
			if (v===false) {
				return r.replace(/\s+[a-zA-Z0-9-]+=$/,'')+s // TODO more permitting attr name regexp
			} else if (v===true) {
				return r.replace(/=$/,'')+s
			}
			v=String(v).replace(/&/g,'&amp;')
			if (v=='') {
				return r.replace(/=$/,'')+s
			} else if (!/[\s"'=<>`]/.test(v)) {
				return r+v+s
			} else if (!/'/.test(v)) {
				return r+"'"+v+"'"+s
			} else {
				v=v.replace(/"/g,'&quot;')
				return r+'"'+v+'"'+s
			}
		} else {
			v=String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;')
			return r+v+s
		}
	})
}

function xmlEscape(text) { // https://github.com/Inist-CNRS/node-xml-writer
	return String(text)
		.replace(/&/g,'&amp;')
		.replace(/</g,'&lt;')
		.replace(/"/g,'&quot;')
		.replace(/\t/g,'&#x9;')
		.replace(/\n/g,'&#xA;')
		.replace(/\r/g,'&#xD;')
}

exports.x=(strings,...values)=>{
	let result=strings[0]
	for (let i=0;i<values.length;i++) {
		result+=xmlEscape(values[i])+strings[i+1]
	}
	return result
}
