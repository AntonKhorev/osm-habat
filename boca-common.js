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
			try {
				await actionButtonAct($button)
			} catch (ex) {}
			restoreFocusInElementContainer($elementContainer)
		}
	} else if (ev.key=='d') {
		await targetTagsAct($element)
		restoreFocusInElementContainer($elementContainer)
	}
}
async function actionLinkClickListener(ev) { // not inside element
	ev.preventDefault()
	try {
		await actionLinkAct(this)
		await checkVersionsAndReloadElement(this) // TODO don't need this b/c not inside element
	} catch (ex) {}
}
async function actionButtonClickListener(ev) {
	const $reloadable=this.closest('.reloadable')
	try {
		await actionButtonAct(this)
		await checkVersionsAndReloadElement(this)
	} catch (ex) {}
	restoreFocusInElementContainer($reloadable)
}
async function reloaderButtonClickListener(ev) {
	ev.preventDefault()
	const $reloadable=this.closest('.reloadable')
	await postAndReload(this)
	restoreFocusInElementContainer($reloadable)
}

async function targetTagsAct($element) {
	let accumulatedHref
	let $accumulatedButtons=[]
	const actOnAccumulated=async()=>{
		await accumulatedActionButtonAct(accumulatedHref,$accumulatedButtons)
		accumulatedHref=undefined
		for (const $button of $accumulatedButtons) {
			checkVersions($button)
		}
		$accumulatedButtons=[]
	}
	try {
		for (const $targetTagRow of $element.querySelectorAll('tr.tag.target')) {
			const $button=$targetTagRow.querySelector('td.act button')
			if (!$button) continue
			const [updatedAccumulatedHref,doneAccumulation]=accumulateRcHrefs(accumulatedHref,$button.dataset.href)
			if (doneAccumulation) {
				accumulatedHref=updatedAccumulatedHref
			} else {
				await actOnAccumulated()
				accumulatedHref=$button.dataset.href
			}
			$accumulatedButtons.push($button)
		}
		await actOnAccumulated()
		const $redactButton=$element.querySelector('form button[formaction=redact]')
		if (!$redactButton) return
		await postAndReload($redactButton)
	} catch (ex) {}
}
async function actionLinkAct($link) {
	if ($link.classList.contains('norc')) return
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
	if (!response?.ok) throw new Error('fetch failed')
}
async function actionButtonAct($button) {
	await accumulatedActionButtonAct($button.dataset.href,[$button])
}
async function accumulatedActionButtonAct(href,$buttons) {
	if (href==null) return
	const $reloadable=$buttons[0]?.closest('.reloadable') // assumes all buttons are inside one reloadable slot
	const targetHref=getRcHref(href)
	for (const $button of $buttons) {
		$button.disabled=true
		$button.classList.add('wait')
	}
	let response
	try {
		response=await fetch(targetHref)
		if (!response.ok && $reloadable) $reloadable.insertAdjacentHTML('beforeend',"<div class=error>JOSM remote control request completed with failure</div>")
	} catch (ex) {
		if ($reloadable) $reloadable.insertAdjacentHTML('beforeend',"<div class=error>JOSM remote control request aborted with error</div>")
	}
	for (const $button of $buttons) {
		$button.classList.remove('wait')
		$button.disabled=false
	}
	if (!response?.ok) throw new Error('fetch failed')
}
async function checkVersionsAndReloadElement($control) {
	if (!$control.dataset.versions) return
	checkVersions($control)
	const $form=$control.closest('form')
	if (!$form) return
	const $redactButton=$form.querySelector('button[formaction=redact]')
	if (!$redactButton) return
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
function checkVersions($control) {
	if (!$control.dataset.versions) return
	const versions=new Set($control.dataset.versions.split(','))
	const $td=$control.closest('td')
	if ($td) {
		const $tagCheckbox=$td.querySelector('input[type=checkbox][name=tag]')
		if ($tagCheckbox) $tagCheckbox.checked=true
	}
	const $form=$control.closest('form')
	if (!$form) return
	for (const $checkbox of $form.querySelectorAll('input[type=checkbox][name=version]')) {
		if (versions.has($checkbox.value)) $checkbox.checked=true
	}
}
function restoreFocusInElementContainer($elementContainer) {
	$elementContainer.querySelector('.element summary')?.focus()
}
function getRcHref(href,$control) {
	const url=new URL(href)
	if (url.host=='127.0.0.1:8111') return href
	let targetHref='http://127.0.0.1:8111/import?new_layer=true'
	if ($control?.title) targetHref+='&layer_name='+encodeURIComponent($control.title)
	if ($control?.dataset.uploadPolicy) targetHref+='&upload_policy='+encodeURIComponent($control.dataset.uploadPolicy)
	targetHref+='&url='+encodeURIComponent(href)
	return targetHref
}
function accumulateRcHrefs(accumulatedHref,href) {
	// TODO return [updatedAccumulatedHref,doneAccumulation]
	return [,false]
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
