import * as e from './escape.js'
import * as osm from './osm.js'

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
<link rel=stylesheet href=/boca-common.css>
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
`<script src=/boca-common.js></script>
</body>
</html>`
	)
}

export function fetchError(response,ex,pageTitle,pageBody) {
	head(response,pageTitle,500)
	response.write(pageBody)
	response.write(e.h`<p>the error was <code>${ex.message}</code>\n`)
	if (ex instanceof osm.Error) {
		response.write(e.h`<p><a href=${ex.apiHref}>try osm api call in browser</a>\n`)
		response.write(e.h`<p><a href=https://wiki.openstreetmap.org/wiki/API_v0.6>see api docs</a>\n`)
	}
	response.write(`<p><a href=/>return to main page</a>\n`)
	tail(response)
}

const bboxColor='#bca9f5'
const createColor='#39dbc0'
const modifyColor='#e8e845'
const modifyPrevColor='#db950a'
const deleteColor='#cc2c47'

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
	background: #000;
	color: #CCC;
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
.item.bbox   { background: ${bboxColor}44; }
.item.create { background: ${createColor}44; }
.item.modify { background: ${modifyColor}44; }
.item.delete { background: ${deleteColor}44; }
.item {
	clear: both;
}
.item button {
	float: right;
}
.item button[disabled] {
	outline: solid red;
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
.item ul {
	margin: 0;
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
const bboxColor='${bboxColor}'
const createColor='${createColor}'
const modifyColor='${modifyColor}'
const modifyPrevColor='${modifyPrevColor}'
const deleteColor='${deleteColor}'
</script>
<script src=/boca-map.js></script>
</body>
</html>`
	)
}
