const $body=document.getElementsByTagName('body')[0]
const $mapContainer=document.createElement('div')
$mapContainer.id='map'
$body.appendChild($mapContainer)
const map=L.map($mapContainer).addLayer(L.tileLayer(
	'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
	{attribution: "© <a href=https://www.openstreetmap.org/copyright>OpenStreetMap contributors</a>"}
)).fitWorld()
const nodeLayer=L.featureGroup().addTo(map)
const nodeClickHandler=(ev)=>{
	const $node=ev.target.parentNode
	nodeLayer.clearLayers()
	L.circleMarker([$node.dataset.lat,$node.dataset.lon]).addTo(nodeLayer)
}
for (const $node of document.querySelectorAll('[data-elementtype=node]')) {
	const $pin=document.createElement('a')
	$pin.setAttribute('href','#map')
	$pin.innerHTML='+'
	$pin.addEventListener('click',nodeClickHandler)
	$node.appendChild($pin)
}
