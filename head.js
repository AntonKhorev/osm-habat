const e=require('./escape')
module.exports=(title)=>e.h`<!DOCTYPE html>
<html lang=en>
<head>
<meta charset=utf-8>
<title>${title}</title>
<style>
.create {background: #CFC}
.modify {background: #FFC}
.delete {background: #FCC}
</style>
<script>
function openRcLink(ev) {
	ev.preventDefault()
	let $status=document.createElement('span')
	$status.innerHTML='[INITIATED]'
	ev.target.after($status)
	fetch(ev.target.href).then(response=>{
		$status.innerHTML=response.ok?'[COMPLETED]':'[FAILED]'
	}).catch((er)=>{
		$status.innerHTML='[NETWORK ERROR]'
	})
}
function openOverpassLink(ev) {
	ev.preventDefault()
	let $tr=ev.target.parentNode.parentNode
	const $latestVersion=document.createElement('td')
	fetch(ev.target.href).then(response=>{
		if (!response.ok) throw new Error()
		return response.json()
	}).then(allData=>{
		const data=allData.elements[0]
		$latestVersion.innerText=data.version
		$tr.appendChild($latestVersion)
		const doneKeys={}
		while (true) {
			$tr=$tr.nextSibling
			if (!$tr) break
			const key=$tr.dataset.key
			if (key===undefined) break
			const $latestValue=document.createElement('td')
			if (data.tags[key]===undefined) {
				$latestValue.innerText=''
			} else {
				$latestValue.innerText=data.tags[key]
				doneKeys[key]=true
			}
			$tr.appendChild($latestValue)
		}
	}).catch((er)=>{
		$latestVersion.innerHTML='[ERROR]'
		$tr.appendChild($latestVersion)
	})
}
</script>
</head>
<body>
`
