setupElementListeners(document)
setupExampleListeners(document)

function setupElementListeners($elementContainer) {
	for (const $element of $elementContainer.querySelectorAll('.element')) {
		$element.addEventListener('focusin',()=>{
			$element.classList.add('active')
		})
		$element.addEventListener('focusout',()=>{
			$element.classList.remove('active')
		})
		$element.addEventListener('click',elementClickListener)
		$element.addEventListener('keydown',elementKeydownListener)
	}
	for (const $link of $elementContainer.querySelectorAll('.reloadable a.rc, .reloadable a.norc')) {
		const stripBrackets=(s)=>{
			if (s[0]=='[' && s[s.length-1]==']') {
				return s.slice(1,-1)
			} else {
				return s
			}
		}
		const $button=document.createElement('button')
		$button.type='button'
		$button.innerHTML=stripBrackets($link.innerHTML)
		Object.assign($button.dataset,$link.dataset)
		if ($link.classList.contains('norc')) {
			$button.classList.add('norc')
		}
		if ($link.classList.contains('rc')) {
			$button.classList.add('rc')
			$button.dataset.href=$link.href
		}
		$link.replaceWith($button)
		$button.addEventListener('click',actionButtonClickListener)
		$button.classList.add('js-enabled')
	}
	for (const $link of $elementContainer.querySelectorAll('a.rc, a.norc')) {
		$link.addEventListener('click',actionLinkClickListener)
		$link.classList.add('js-enabled')
	}
	for (const $reloaderButton of $elementContainer.querySelectorAll('.reloadable button.reloader')) {
		$reloaderButton.addEventListener('click',reloaderButtonClickListener)
		$reloaderButton.classList.add('js-enabled')
	}
}
// only listeners should fix the focus
function elementClickListener(ev) {
	const $element=this
	if (!$element.classList.contains('active')) {
		const selection=document.getSelection()
		const range=selection.getRangeAt(0)
		$element.querySelector('summary')?.focus() // resets selecion
		selection.removeAllRanges()
		selection.addRange(range)
	}
}
async function elementKeydownListener(ev) {
	const $element=this
	const $elementContainer=$element.parentElement
	const navigate=($toElement)=>{
		$toElement?.querySelector('summary')?.focus()
		$toElement?.scrollIntoView({block:'center'})
	}
	if (ev.key=='w') {
		navigate($element.parentElement.previousElementSibling?.querySelector('.element'))
	} else if (ev.key=='s') {
		navigate($element.parentElement.nextElementSibling?.querySelector('.element'))
	} else if (ev.key=='e') {
		const $button=$element.querySelector('tr.visible td.act button')
		if ($button) {
			await actionButtonAct($button)
			restoreFocusInElementContainer($elementContainer)
		}
	} else if (ev.key=='d') {
		await targetTagsAct($element)
		restoreFocusInElementContainer($elementContainer)
	}
}
function actionLinkClickListener(ev) { // not inside element
	ev.preventDefault()
	actionLinkAct(this)
}
async function actionButtonClickListener(ev) {
	const $reloadable=this.closest('.reloadable')
	await actionButtonAct(this)
	restoreFocusInElementContainer($reloadable)
}
async function reloaderButtonClickListener(ev) {
	ev.preventDefault()
	const $reloadable=this.closest('.reloadable')
	await postAndReload(this)
	restoreFocusInElementContainer($reloadable)
}

async function targetTagsAct($element) {
	const $elementContainer=$element.parentElement
	for (let i=0;;i++) {
		const $targetTagRow=$element.querySelectorAll('tr.tag.target')[i] // requery because element may get rewritten
		if (!$targetTagRow) return
		const $actionButton=$targetTagRow.querySelector('td.act button')
		if (!$actionButton) continue
		await actionButtonAct($actionButton)
		$element=$elementContainer.querySelector('.element') // element was possibly rewritten, find the new one
	}
}
async function actionLinkAct($link) {
	if ($link.classList.contains('norc')) {
		return await checkVersionsAndReloadElement($link)
	} else if (!$link.classList.contains('rc')) {
		return
	}
	let $status=document.createElement('span')
	$status.innerHTML='[INITIATED]'
	$link.after($status)
	const targetHref=getRcHref($link.href,$link)
	let response
	try {
		response=await fetch(targetHref)
		$status.innerHTML=response.ok?'[COMPLETED]':'[FAILED]'
	} catch (ex) {
		$status.innerHTML='[NETWORK ERROR]'
	}
	if (response?.ok) await checkVersionsAndReloadElement($link)
}
async function actionButtonAct($button) {
	if ($button.classList.contains('norc')) {
		return await checkVersionsAndReloadElement($button)
	} else if (!$button.classList.contains('rc')) {
		return
	}
	const $reloadable=$button.closest('.reloadable')
	const targetHref=getRcHref($button.dataset.href,$button)
	$button.disabled=true
	$button.classList.add('wait')
	let response
	try {
		response=await fetch(targetHref)
		if (!response.ok) $reloadable.insertAdjacentHTML('beforeend',"<div class=error>JOSM remote control request completed with failure</div>")
	} catch (ex) {
		$reloadable.insertAdjacentHTML('beforeend',"<div class=error>JOSM remote control request aborted with error</div>")
	}
	if (response?.ok) await checkVersionsAndReloadElement($button)
	$button.classList.remove('wait')
	$button.disabled=false
}
async function checkVersionsAndReloadElement($link) { // TODO $link is <a> or <button>, rename it
	if (!$link.dataset.versions) return
	const versions=new Set($link.dataset.versions.split(','))
	const $td=$link.closest('td')
	if ($td) {
		const $tagCheckbox=$td.querySelector('input[type=checkbox][name=tag]')
		if ($tagCheckbox) $tagCheckbox.checked=true
	}
	const $form=$link.closest('form')
	if (!$form) return
	for (const $checkbox of $form.querySelectorAll('input[type=checkbox][name=version]')) {
		if (versions.has($checkbox.value)) $checkbox.checked=true
	}
	const $redactButton=$form.querySelector('button[formaction=redact]')
	if (!$redactButton) return
	const $elementContainer=$link.closest('.element').parentElement
	await postAndReload($redactButton)
}
async function postAndReload($button) {
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
	setupElementListeners($reloadable)
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
function restoreFocusInElementContainer($elementContainer) {
	$elementContainer.querySelector('.element summary')?.focus()
}
function getRcHref(href,$control) {
	const url=new URL(href)
	if (url.host=='127.0.0.1:8111') return href
	let targetHref='http://127.0.0.1:8111/import?new_layer=true'
	if ($control.title) targetHref+='&layer_name='+encodeURIComponent($control.title)
	if ($control.dataset.uploadPolicy) targetHref+='&upload_policy='+encodeURIComponent($control.dataset.uploadPolicy)
	targetHref+='&url='+encodeURIComponent(href)
	return targetHref
}
function urlencodeFormData($form) {
	const data=[]
	for (const [k,v] of new FormData($form).entries()) {
		data.push(encodeURIComponent(k)+'='+encodeURIComponent(v))
	}
	return data.join('&').replace(/%20/g,'+')
}
const escapeHtml=(s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')

function setupExampleListeners($element) {
	const $exampleInput=$element.querySelector('textarea[name=filter]')
	if (!$exampleInput) return
	for (const $exampleTitle of $element.querySelectorAll('dl.examples dt')) {
		const $exampleDefinition=$exampleTitle.nextElementSibling
		if (!$exampleDefinition) continue
		const $exampleCode=$exampleDefinition.querySelector('code')
		if (!$exampleCode) continue
		const $copyLink=document.createElement('a')
		$copyLink.innerHTML='[copy to filter input]'
		$copyLink.addEventListener('click',()=>{
			$exampleInput.value=$exampleCode.textContent
		})
		$exampleTitle.appendChild($copyLink)
	}
}
