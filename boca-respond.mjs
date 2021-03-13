import * as e from './escape.js'

export function head(response,title,httpCode=200) {
	headNoMain(response,title,httpCode=200)
	response.write(`<main>\n`)
}

export function headNoMain(response,title,httpCode=200) {
	response.writeHead(httpCode,{'Content-Type':'text/html; charset=utf-8'})
	response.write(
e.h`<!DOCTYPE html>
<html lang=en>
<head>
<meta charset=utf-8>
<title>${title}</title>
<style>
body {
	margin: 0;
}
main {
	margin: .5em;
}
footer {
	position: sticky;
	bottom: 0;
	padding: .5em;
	background: Canvas;
	box-shadow: 0 0 .5em;
}
table td { text-align: right }
.create {background: #CFC}
.modify {background: #FFC}
.delete {background: #FCC}
details.element {
	margin: .5em 0;
}
details.element[open] {
	margin-bottom: 1.5em;
}
details.element h3 {
	display: inline-block;
	margin: 0;
}
details.element table {
	border-collapse: collapse;
	margin-top: .5em;
}
details.element td.target {
	border-left: solid 3px #004;
	border-right: solid 3px #004;
}
details.element tr:first-child td.target {
	border-top: solid 3px #004;
}
details.element tr:last-child td.target {
	border-bottom: solid 3px #004;
}
</style>
</head>
<body>
`
	)
}

export function tail(response) {
	response.write(`</main>\n`)
	tailNoMain(response)
}

export function tailNoMain(response) {
	response.end(
`<script>
function checkVersions($link) {
	if (!$link.dataset.version) return
	const minVersion=Number($link.dataset.version)
	const $form=$link.closest('form')
	if (!$form) return
	for (const $checkbox of $form.querySelectorAll('input[type=checkbox][name=version]')) {
		if (minVersion<=Number($checkbox.value)) $checkbox.checked=true
	}
}
function openRcLink(ev) {
	ev.preventDefault()
	let $status=document.createElement('span')
	$status.innerHTML='[INITIATED]'
	ev.target.after($status)
	fetch(ev.target.href).then(response=>{
		$status.innerHTML=response.ok?'[COMPLETED]':'[FAILED]'
		if (response.ok) checkVersions(ev.target)
	}).catch((er)=>{
		$status.innerHTML='[NETWORK ERROR]'
	})
}
for (const $rcLink of document.querySelectorAll('a.rc')) {
	$rcLink.addEventListener('click',openRcLink)
}
</script>
</body>
</html>`
	)
}

export function fetchError(response,ex,pageTitle,pageBody) {
	head(response,pageTitle,500)
	response.write(pageBody)
	response.write(e.h`<p>the error was <code>${ex.message}</code>\n`)
	response.write(`<p><a href=/>return to main page</a>\n`)
	tail(response)
}
