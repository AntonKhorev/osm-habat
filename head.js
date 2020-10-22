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
	fetch(ev.target.href).then((response)=>{
		$status.innerHTML=response.ok?'[COMPLETED]':'[FAILED]'
	}).catch((er)=>{
		$status.innerHTML='[NETWORK ERROR]'
	})
}
</script>
</head>
<body>
`
