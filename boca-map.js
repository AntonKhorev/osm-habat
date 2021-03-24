addMapAndControls(document.querySelector('.items'),document.querySelector('.map'))
function addMapAndControls($itemContainer,$mapContainer) {
	if (!$mapContainer) {
		console.log('map container not defined')
		return
	}
	$mapContainer.replaceChildren()
	const map=L.map($mapContainer).addLayer(L.tileLayer(
		'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		{
			attribution: "© <a href=https://www.openstreetmap.org/copyright>OpenStreetMap contributors</a>",
			opacity: 0.5,
			maxNativeZoom: 19,
			maxZoom: 24,
		}
	)).fitWorld()
	const layerGroup=L.featureGroup().addTo(map)
	const isItem=$item=>$item.classList.contains('item')
	const getCheckbox=$item=>$item.querySelector('input[type=checkbox]')
	const updateItemVisibility=()=>{
		for (const $item of $itemContainer.querySelectorAll('.item')) {
			const $itemCheckbox=getCheckbox($item)
			if ($itemCheckbox.checked) {
				showItem(layerGroup,$item)
			} else {
				hideItem(layerGroup,$item)
			}
		}
	}
	const setChildrenCheckboxes=($item,checked)=>{
		for (const $childItem of $item.children) {
			if (!isItem($childItem)) continue
			const $childItemCheckbox=getCheckbox($childItem)
			$childItemCheckbox.checked=checked
			$childItemCheckbox.indeterminate=false
			setChildrenCheckboxes($childItem,checked)
		}
	}
	const updateParentCheckbox=($item)=>{
		const $parentItem=$item.parentElement
		if (!isItem($parentItem)) return
		const $parentItemCheckbox=getCheckbox($parentItem)
		let someChecked=false
		let someUnchecked=false
		for (const $siblingItem of $parentItem.children) {
			if (!isItem($siblingItem)) continue
			const $siblingItemCheckbox=getCheckbox($siblingItem)
			if ($siblingItemCheckbox.checked) {
				someChecked=true
			} else {
				someUnchecked=true
			}
			if ($siblingItemCheckbox.indeterminate) {
				someChecked=someUnchecked=true
			}
		}
		if (someChecked && someUnchecked) {
			$parentItemCheckbox.indeterminate=true
		} else {
			$parentItemCheckbox.indeterminate=false
			if (someChecked) $parentItemCheckbox.checked=true
			if (someUnchecked) $parentItemCheckbox.checked=false
		}
		updateParentCheckbox($parentItem)
	}
	const itemCheckboxListener=(event)=>{
		const $itemCheckbox=event.target
		const $item=$itemCheckbox.closest('.item')
		setChildrenCheckboxes($item,$itemCheckbox.checked)
		updateParentCheckbox($item)
		updateItemVisibility()
	}
	const panButtonListener=(event)=>{
		const $panButton=event.target
		const $item=$panButton.closest('.item')
		const $itemCheckbox=getCheckbox($item)
		$itemCheckbox.checked=true
		$itemCheckbox.indeterminate=false
		setChildrenCheckboxes($item,true)
		updateParentCheckbox($item)
		updateItemVisibility()
		panToItem(map,layerGroup,$item)
	}
	for (const $item of $itemContainer.querySelectorAll('.item')) {
		const $itemCheckbox=getCheckbox($item)
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
	const feature=makeFeature()
	if (feature) {
		feature.addTo(layerGroup)
		$item.dataset.layerId=layerGroup.getLayerId(feature)
	} else if (!$item.classList.contains('changeset')) {
		const $panButton=$item.querySelector('button')
		$panButton.disabled=true
		$panButton.title="can't display this item"
	}
	function makeFeature() {
		if ($item.classList.contains('bbox') && $item.dataset.minLat!=null) {
			return L.rectangle([
				[$item.dataset.minLat,$item.dataset.minLon],
				[$item.dataset.maxLat,$item.dataset.maxLon],
			],{color:bboxColor,fill:false})
		}
		const elementIdHtml=$item.dataset.id.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')
		const color=getColor()
		const prevColor=getPrevColor()
		if ($item.classList.contains('node')) {
			const markers=[]
			const nodeLinkHtml=`<a href="https://www.openstreetmap.org/node/${elementIdHtml}">node #${elementIdHtml}</a>`
			if ($item.dataset.lat!=null) {markers.push(
				L.circleMarker([$item.dataset.lat,$item.dataset.lon],{color}).bindPopup(nodeLinkHtml)
			)}
			if ($item.dataset.prevLat!=null && (
				$item.dataset.prevLat!=$item.dataset.lat ||
				$item.dataset.prevLon!=$item.dataset.lon
			)) {markers.push(
				L.circleMarker([$item.dataset.prevLat,$item.dataset.prevLon],{color:prevColor}).bindPopup(nodeLinkHtml)
			)}
			if (markers.length>0) return L.featureGroup(markers)
		}
		if ($item.classList.contains('way')) {
			const nids=[]
			const latlons=[]
			for (const $nodeItem of $item.querySelectorAll('.nd')) {
				nids.push(Number($nodeItem.dataset.id))
				latlons.push([Number($nodeItem.dataset.lat),Number($nodeItem.dataset.lon)])
			}
			if (latlons.length>1) {
				const wayLinkHtml=`<a href="https://www.openstreetmap.org/way/${elementIdHtml}">way #${elementIdHtml}</a>`
				const features=[
					L.polyline(latlons,{color}).bindPopup(wayLinkHtml),
				]
				if (nids[0]==nids[nids.length-1]) {features.push(
					L.circleMarker(latlons[0],{color}).bindPopup(wayLinkHtml+' first and last node')
				)} else {features.push(
					L.circleMarker(latlons[0],{color}).bindPopup(wayLinkHtml+' first node'),
					L.circleMarker(latlons[latlons.length-1],{color}).bindPopup(wayLinkHtml+' last node')
				)}
				return L.featureGroup(features)
			}
		}
	}
	function getColor() {
		if ($item.classList.contains('create')) {
			return createColor
		} else {
			return modifyColor
		}
	}
	function getPrevColor() {
		if ($item.classList.contains('delete')) {
			return deleteColor
		} else {
			return modifyPrevColor
		}
	}
}
function hideItem(layerGroup,$item) {
	if ($item.dataset.layerId==null) return
	layerGroup.removeLayer(Number($item.dataset.layerId))
	delete $item.dataset.layerId
}
function panToItem(map,layerGroup,$item) {
	if ($item.classList.contains('changeset')) {
		const $bboxItem=$item.querySelector('.item.bbox')
		if ($bboxItem) {
			const bboxFeature=layerGroup.getLayer(Number($bboxItem.dataset.layerId))
			map.fitBounds(bboxFeature.getBounds())
			return
		}
	}
	if ($item.dataset.layerId==null) return
	const feature=layerGroup.getLayer(Number($item.dataset.layerId))
	map.fitBounds(feature.getBounds())
}
