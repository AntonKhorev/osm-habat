setupListeners(document)
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
async function openRcLink(ev) {
	ev.preventDefault()
	let $status=document.createElement('span')
	$status.innerHTML='[INITIATED]'
	this.after($status)
	let targetHref=ev.target.href
	const url=new URL(targetHref)
	if (url.host!='127.0.0.1:8111') {
		targetHref='http://127.0.0.1:8111/import?new_layer=true'
		if (this.title) targetHref+='&layer_name='+encodeURIComponent(this.title)
		if (this.dataset.uploadPolicy) targetHref+='&upload_policy='+encodeURIComponent(this.dataset.uploadPolicy)
		targetHref+='&url='+encodeURIComponent(this.href)
	}
	try {
		const response=await fetch(targetHref)
		$status.innerHTML=response.ok?'[COMPLETED]':'[FAILED]'
		if (response.ok) checkVersions(this)
	} catch (ex) {
		$status.innerHTML='[NETWORK ERROR]'
	}
}
async function postAndReload(ev) {
	ev.preventDefault()
	const $button=this
	const $reloadable=$button.closest('.reloadable')
	for (const $error of $reloadable.querySelectorAll('.error')) {
		$error.classList.add('outdated')
	}
	disableControls()
	try {
		const response=await fetch($button.formAction+'-reload',{
			method: 'POST',
			headers: {'Content-Type':'application/x-www-form-urlencoded'},
			body: urlencodeFormData($button.form),
		})
		if (!response.ok) {
			$reloadable.insertAdjacentHTML('beforeend',"<div class=error>Request error</div>")
			enableControls()
			return
		}
		$reloadable.innerHTML=await response.text()
	} catch (ex) {
		$reloadable.insertAdjacentHTML('beforeend',`<div class=error>Error: <code>${escapeHtml(ex.message)}</code></div>`)
		enableControls()
		return
	}
	setupListeners($reloadable)
	if (!$button.classList.contains('redactor')) return
	const $redactionsStatus=document.querySelector('.redactions-status')
	try {
		const response=await fetch('/redactions/status')
		if (!response.ok) throw new Error('status fetch error')
		$redactionsStatus.innerHTML=await response.text()
	} catch (ex) {
		$redactionsStatus.innerHTML("<p>failed to update status of redactions")
	}
	function disableControls() {
		for (const $anyButton of $reloadable.querySelectorAll('button')) {
			$anyButton.disabled=true
		}
		// TODO disable rc links too?
	}
	function enableControls() {
		for (const $anyButton of $reloadable.querySelectorAll('button')) {
			$anyButton.disabled=false
		}
	}
}
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
function urlencodeFormData($form) {
	const data=[]
	for (const [k,v] of new FormData($form).entries()) {
		data.push(encodeURIComponent(k)+'='+encodeURIComponent(v))
	}
	return data.join('&').replace(/%20/g,'+')
}
const escapeHtml=(s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')