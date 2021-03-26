function checkVersions($link) {
	if (!$link.dataset.version) return
	const minVersion=Number($link.dataset.version)
	const $form=$link.closest('form')
	if (!$form) return
	for (const $checkbox of $form.querySelectorAll('input[type=checkbox][name=version]')) {
		if (minVersion<=Number($checkbox.value)) $checkbox.checked=true
	}
	const $redactButton=$form.querySelector('button[formaction=redact]')
	if (!$redactButton) return
	$redactButton.click()
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
function postAndReload(ev) {
	ev.preventDefault()
	const $button=ev.target
	console.log('got to perform',$button.formAction)
	// $button.form
}
function setupListeners($element) {
	for (const $rcLink of $element.querySelectorAll('a.rc')) {
		$rcLink.addEventListener('click',openRcLink)
		$rcLink.classList.add('js-enabled')
	}
	for (const $reloaderButton of $element.querySelectorAll('.reloadable button.reloader')) {
		$reloaderButton.addEventListener('click',postAndReload)
		$reloaderButton.classList.add('js-enabled')
	}
}
setupListeners(document)
