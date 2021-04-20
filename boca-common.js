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
		$element.addEventListener('click',()=>{
			if (!$element.classList.contains('active')) {
				$element.querySelector('summary')?.focus()
			}
		})
		$element.addEventListener('keydown',(ev)=>{
			const navigate=($toElement)=>{
				$toElement?.querySelector('summary')?.focus()
				$toElement?.scrollIntoView({block:'center'})
			}
			if (ev.key=='w') {
				navigate($element.parentElement.previousElementSibling?.querySelector('.element'))
			} else if (ev.key=='s') {
				navigate($element.parentElement.nextElementSibling?.querySelector('.element'))
			} else if (ev.key=='e') {
				$element.querySelector('tr.visible td.act a')?.click()
			} else if (ev.key=='d') {
				targetTagsAct($element)
			}
		})
	}
	for (const $rcLink of $elementContainer.querySelectorAll('a.rc')) {
		$rcLink.addEventListener('click',actionLinkClickListener)
		$rcLink.classList.add('js-enabled')
	}
	for (const $noRcLink of $elementContainer.querySelectorAll('a.norc')) {
		$noRcLink.addEventListener('click',actionLinkClickListener)
		$noRcLink.classList.add('js-enabled')
	}
	for (const $reloaderButton of $elementContainer.querySelectorAll('.reloadable button.reloader')) {
		$reloaderButton.addEventListener('click',reloaderButtonClickListener)
		$reloaderButton.classList.add('js-enabled')
	}
}
function actionLinkClickListener(ev) {
	ev.preventDefault()
	actionLinkAct(this)
}
function reloaderButtonClickListener(ev) {
	ev.preventDefault()
	postAndReload(this)
}

async function targetTagsAct($element) {
	const $elementContainer=$element.parentElement
	for (let i=0;;i++) {
		const $targetTagRow=$element.querySelectorAll('tr.tag.target')[i] // requery because element may get rewritten
		if (!$targetTagRow) return
		const $actionLink=$targetTagRow.querySelector('td.act a')
		if (!$actionLink) continue
		await actionLinkAct($actionLink)
		$element=$elementContainer.querySelector('.element') // element was possibly rewritten, find the new one
		$element?.querySelector('summary')?.focus() // link was possibly removed, focus on something else
	}
}
async function actionLinkAct($link) {
	if ($link.classList.contains('norc')) {
		return await checkVersions($link)
	} else if (!$link.classList.contains('rc')) {
		return
	}
	let $status=document.createElement('span')
	$status.innerHTML='[INITIATED]'
	$link.after($status)
	let targetHref=$link.href
	const url=new URL(targetHref)
	if (url.host!='127.0.0.1:8111') {
		targetHref='http://127.0.0.1:8111/import?new_layer=true'
		if ($link.title) targetHref+='&layer_name='+encodeURIComponent($link.title)
		if ($link.dataset.uploadPolicy) targetHref+='&upload_policy='+encodeURIComponent($link.dataset.uploadPolicy)
		targetHref+='&url='+encodeURIComponent($link.href)
	}
	try {
		const response=await fetch(targetHref)
		$status.innerHTML=response.ok?'[COMPLETED]':'[FAILED]'
		if (response.ok) await checkVersions($link)
	} catch (ex) {
		$status.innerHTML='[NETWORK ERROR]'
	}
}
async function checkVersions($link) {
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
