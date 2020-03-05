const https=require('https')

exports.apiGet=(call,...args)=>{
	const apiUrl=`https://api.openstreetmap.org`
	const getUrl=apiUrl+call
	console.log(`GET ${getUrl}`)
	https.get(getUrl,...args)
}
