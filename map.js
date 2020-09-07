const $body=document.getElementsByTagName('body')[0]
const $mapContainer=document.createElement('div')
$mapContainer.id='map'
$body.appendChild($mapContainer)
const map=L.map($mapContainer).addLayer(L.tileLayer(
	'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
	{attribution: "© <a href=https://www.openstreetmap.org/copyright>OpenStreetMap contributors</a>"}
)).fitWorld()
const nodeLayer=L.featureGroup().addTo(map)
function mapButtonClickHandler() {
	nodeLayer.clearLayers()
	L.circleMarker([this.dataset.lat,this.dataset.lon]).addTo(nodeLayer)
	map.panTo([this.dataset.lat,this.dataset.lon])
}
let $originalElement,$replacementElement
function elementClickHandler() {
	if ($originalElement && $replacementElement) {
		$replacementElement.replaceWith($originalElement)
	}
	$originalElement=this
	$replacementElement=document.createElement('li')
	$replacementElement.classList.add('card')
	$replacementElement.innerHTML=`<a href=${'https://www.openstreetmap.org/'+this.dataset.elementType+'/'+this.dataset.elementId}>${this.dataset.elementType} ${this.dataset.elementId}</a>`
	if (this.querySelector('.possibly-affected')) {
		$replacementElement.insertAdjacentHTML('beforeend',`<br>TODO possibly affected cmds`)
	}
	if (this.dataset.lat && this.dataset.lon) {
		const $mapButton=document.createElement('button')
		$mapButton.dataset.lat=this.dataset.lat
		$mapButton.dataset.lon=this.dataset.lon
		$mapButton.innerHTML='Show on map'
		$mapButton.addEventListener('click',mapButtonClickHandler)
		$replacementElement.insertAdjacentHTML('beforeend',`<br>`)
		$replacementElement.appendChild($mapButton)
	}
	$originalElement.replaceWith($replacementElement)
}
for (const $element of document.querySelectorAll('ul.causes li')) {
	for (const $a of $element.querySelectorAll('a')) {
		const $span=document.createElement('span')
		$span.classList.add('ref')
		$span.innerHTML=$a.innerHTML
		$a.replaceWith($span)
	}
	$element.addEventListener('click',elementClickHandler)
}
