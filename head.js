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
			if (!$tr.nextSibling) break
			const key=$tr.nextSibling.dataset.key
			if (key===undefined) break
			$tr=$tr.nextSibling
			const $latestValue=document.createElement('td')
			if (data.tags[key]===undefined) {
				$latestValue.innerText=''
			} else {
				$latestValue.innerText=data.tags[key]
				doneKeys[key]=true
			}
			$tr.appendChild($latestValue)
		}
		for (const [key,value] of Object.entries(data.tags)) {
			if (doneKeys[key]) continue
			const $newTr=document.createElement('tr')
			const $newKey=document.createElement('td')
			$newTr.dataset.key=key
			$newKey.innerText=key
			$newTr.appendChild($newKey)
			for (let i=0;i<3;i++) $newTr.appendChild(document.createElement('td'))
			const $newValue=document.createElement('td')
			$newValue.innerText=value
			$newTr.appendChild($newValue)
			$tr.after($newTr)
			$tr=$newTr
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
