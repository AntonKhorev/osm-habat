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
function openRcLink(element) {
	(new Image()).src=element.href
	return false
}
</script>
</head>
<body>
`
