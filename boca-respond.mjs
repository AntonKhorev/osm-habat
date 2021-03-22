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
	let targetHref=ev.target.href
	const url=new URL(targetHref)
	if (url.host!='127.0.0.1:8111') {
		targetHref='http://127.0.0.1:8111/import?new_layer=true'
		if (ev.target.title) targetHref+='&layer_name='+encodeURIComponent(ev.target.title)
		if (ev.target.dataset.uploadPolicy) targetHref+='&upload_policy='+encodeURIComponent(ev.target.dataset.uploadPolicy)
		targetHref+='&url='+encodeURIComponent(ev.target.href)
	}
	fetch(targetHref).then(response=>{
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

export function mapHead(response,title,httpCode=200) {
	response.writeHead(httpCode,{'Content-Type':'text/html; charset=utf-8'})
	const titleHtml=e.h`${title}`
	const makeSvgMarker=(insides)=>
		`<svg xmlns='http://www.w3.org/2000/svg' version='1.1' height='1em' width='1em' viewBox='-1 -1 2 2'>`+
		`<rect x='-1' y='-1' width='2' height='2' fill='white' stroke='black' stroke-width='0.5' />`+
		insides+
		`</svg>`
	const svgInsidesMinus=
		`<line x1='-0.5' x2='0.5' y1='0' y2='0' stroke='black' stroke-width='0.25' />`
	const svgInsidesPlus=svgInsidesMinus+
		`<line y1='-0.5' y2='0.5' x1='0' x2='0' stroke='black' stroke-width='0.25' />`
	response.write(
`<!DOCTYPE html>
<html lang=en>
<head>
<meta charset=utf-8>
<title>${titleHtml}</title>
<link rel=stylesheet href=https://unpkg.com/leaflet@1.7.1/dist/leaflet.css>
<script src=https://unpkg.com/leaflet@1.7.1/dist/leaflet.js></script>
<style>
body {
	margin: 0;
}
.map {
	position: fixed;
	width: 80%;
	height: 100%;
	right: 0;
}
.items {
	position: fixed;
	width: 20%;
	height: 100%;
	left: 0;
	overflow-y: scroll;
	box-sizing: border-box;
	padding-left: 1em;
}
.item {
	clear:both;
}
.item button {
	float:right;
}
.item summary {
	list-style-position: outside;
}
.item > summary::marker {
	content: url("data:image/svg+xml;charset=UTF-8,${makeSvgMarker(svgInsidesPlus)}")
}
.item[open] > summary::marker {
	content: url("data:image/svg+xml;charset=UTF-8,${makeSvgMarker(svgInsidesMinus)}")
}
</style>
</head>
<body>
<div class=items>
`
	)
}

export function mapTail(response) {
	response.end(
`</div>
<div class=map>
Please enable javascript to see the map.
</div>
<script>
addMapAndControls(document.querySelector('div.map'))
function addMapAndControls($mapContainer) {
	if (!$mapContainer) {
		console.log('map container not defined')
		return
	}
	$mapContainer.replaceChildren()
	const map=L.map($mapContainer).addLayer(L.tileLayer(
		'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		{attribution: "© <a href=https://www.openstreetmap.org/copyright>OpenStreetMap contributors</a>"}
	)).fitWorld()
	const layerGroup=L.featureGroup().addTo(map)
	const itemCheckboxListener=(event)=>{
		const $itemCheckbox=event.target
		const $item=$itemCheckbox.closest('.item')
		if ($itemCheckbox.checked) {
			showItem(layerGroup,$item)
		} else {
			hideItem(layerGroup,$item)
		}
	}
	const panButtonListener=(event)=>{
		const $panButton=event.target
		const $item=$panButton.closest('.item')
		const $itemCheckbox=$item.querySelector('input[type=checkbox]')
		$itemCheckbox.checked=true
		showItem(layerGroup,$item)
		panToItem(map,layerGroup,$item)
	}
	for (const $item of document.querySelectorAll('.item')) {
		const $itemCheckbox=$item.querySelector('input[type=checkbox]')
		if ($itemCheckbox.checked) showItem(layerGroup,$item)
		$itemCheckbox.addEventListener('change',itemCheckboxListener)
		const $panButton=document.createElement('button')
		$panButton.innerHTML='→'
		$panButton.addEventListener('click',panButtonListener)
		$item.querySelector('summary').appendChild($panButton)
	}
}
function showItem(layerGroup,$item) {
	if ($item.dataset.layerId!=null) return
	let feature
	if ($item.classList.contains('changeset') && $item.dataset.minLat!=null) {
		feature=L.rectangle([
			[$item.dataset.minLat,$item.dataset.minLon],
			[$item.dataset.maxLat,$item.dataset.maxLon],
		])
	} else if ($item.classList.contains('node') && $item.dataset.lat!=null) {
		feature=L.circleMarker([$item.dataset.lat,$item.dataset.lon])
	}
	if (feature) {
		feature.addTo(layerGroup)
		$item.dataset.layerId=layerGroup.getLayerId(feature)
	}
}
function hideItem(layerGroup,$item) {
	if ($item.dataset.layerId==null) return
	layerGroup.removeLayer(Number($item.dataset.layerId))
	delete $item.dataset.layerId
}
function panToItem(map,layerGroup,$item) {
	if ($item.dataset.layerId==null) return
	const feature=layerGroup.getLayer(Number($item.dataset.layerId))
	if ($item.classList.contains('node')) {
		map.setView(feature.getLatLng(),18)
	} else {
		map.fitBounds(feature.getBounds())
	}
}
</script>
</body>
</html>`
	)
}
