const [elementContainerMap,elementContainerArray,$positionInput]=setupElementContainerSequence(document)
setupElementListeners(document)
setupExampleListeners(document)
setupElementListControls(document)

function setupElementContainerSequence($containerContainer) {
	const elementContainerMap=new Map()
	const elementContainerArray=[]
	let entry,$prevElementContainer
	let elementNumber=0
	for (const $elementContainer of $containerContainer.querySelectorAll('.reloadable')) {
		if (!$elementContainer.firstElementChild.classList.contains('element')) continue
		elementContainerArray.push($elementContainer)
		if (entry) entry.push($elementContainer)
		entry=[++elementNumber,$prevElementContainer]
		elementContainerMap.set($elementContainer,entry)
		$prevElementContainer=$elementContainer
	}
	const makePositionInput=()=>{
		const $elementCountMeter=document.querySelector('.status .elements .meter')
		if (!$elementCountMeter) return
		const $positionInput=document.createElement('input')
		const maxDigits=$elementCountMeter.innerText.length
		$positionInput.type='number'
		$positionInput.min=1
		$positionInput.max=elementNumber
		$positionInput.style.width=maxDigits+'ch'
		$positionInput.addEventListener('input',positionInputListener)
		$positionInput.addEventListener('keypress',positionKeypressListener)
		$elementCountMeter.prepend('/')
		$elementCountMeter.prepend($positionInput)
		return $positionInput
	}
	return [elementContainerMap,elementContainerArray,makePositionInput()]
}

function setupElementListeners($container) {
	for (const $element of $container.querySelectorAll('.element')) {
		$element.addEventListener('focusin',elementFocusinListener)
		$element.addEventListener('focusout',elementFocusoutListener)
		$element.addEventListener('click',elementClickListener)
		$element.addEventListener('keydown',elementKeydownListener)
	}
	for (const $link of $container.querySelectorAll('.reloadable a.rc, .reloadable a.norc')) {
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
		$button.title=$link.title
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
	for (const $link of $container.querySelectorAll('a.rc, a.norc')) {
		$link.addEventListener('click',actionLinkClickListener)
		$link.classList.add('js-enabled')
	}
	for (const $reloaderButton of $container.querySelectorAll('.reloadable button.reloader')) {
		$reloaderButton.addEventListener('click',reloaderButtonClickListener)
		$reloaderButton.classList.add('js-enabled')
	}
}
// only listeners should fix the focus
function positionInputListener(ev) {
	const position=Number(this.value)
	if (!Number.isInteger(position)) return
	elementContainerArray[position-1]?.querySelector('.element')?.scrollIntoView({block:'center'})
}
function positionKeypressListener(ev) {
	if (ev.keyCode!=13) return
	const position=Number(this.value)
	if (!Number.isInteger(position)) return
	elementContainerArray[position-1]?.querySelector('summary')?.focus()
}
function elementFocusinListener(ev) {
	const $element=this
	$element.classList.add('active')
	if (!$positionInput) return
	const $elementContainer=$element.parentElement
	const [elementNumber]=elementContainerMap.get($elementContainer)
	$positionInput.value=elementNumber
}
function elementFocusoutListener(ev) {
	const $element=this
	$element.classList.remove('active')
}
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
		const [,$prevElementContainer,$nextElementContainer]=elementContainerMap.get($elementContainer)
		navigate($prevElementContainer?.firstElementChild)
	} else if (ev.key=='s') {
		const [,$prevElementContainer,$nextElementContainer]=elementContainerMap.get($elementContainer)
		navigate($nextElementContainer?.firstElementChild)
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
			const [doneAccumulation,updatedAccumulatedHref]=accumulateRcHrefs(accumulatedHref,$button.dataset.href)
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
	const getTargetHref=()=>{
		if ($buttons.length==1) return getRcHref(href,$buttons[0])
		return getRcHref(href)
	}
	const targetHref=getTargetHref()
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
	const $redactionsStatus=document.querySelector('.status .redactions')
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
function urlencodeFormData($form) {
	const data=[]
	for (const [k,v] of new FormData($form).entries()) {
		data.push(encodeURIComponent(k)+'='+encodeURIComponent(v))
	}
	return data.join('&').replace(/%20/g,'+')
}

function setupExampleListeners($container) {
	for (const $form of $container.querySelectorAll('form.with-examples')) {
		const $exampleInput=$form.querySelector('textarea')
		if (!$exampleInput) return
		for (const $exampleTitle of $form.querySelectorAll('dl.examples dt')) {
			const $exampleDefinition=$exampleTitle.nextElementSibling
			if (!$exampleDefinition) continue
			const $exampleCode=$exampleDefinition.querySelector('code')
			if (!$exampleCode) continue
			const $controls=document.createElement('span')
			$controls.classList.add('controls')
			const appendControl=(actionName,listener)=>{
				const $link=document.createElement('a')
				$link.innerHTML=actionName
				$link.addEventListener('click',listener)
				$controls.appendChild($link)
			}
			$controls.insertAdjacentHTML('beforeend',`[`)
			appendControl('copy',()=>{
				$exampleInput.value=$exampleCode.textContent
			})
			$controls.insertAdjacentHTML('beforeend',` / `)
			appendControl('append',()=>{
				if ($exampleInput.value!='') $exampleInput.value+='\n'
				$exampleInput.value+=$exampleCode.textContent
			})
			$controls.insertAdjacentHTML('beforeend',` to ${$exampleInput.name} input]`)
			$exampleTitle.appendChild($controls)
		}
	}
}

function setupElementListControls($container) {
	for (const $table of $container.querySelectorAll('.element-list')) {
		{
			const $button=document.createElement('button')
			$button.textContent=`Make a list of element urls`
			$button.onclick=()=>{
				let t=''
				for (const $tr of $table.rows) {
					const $a=$tr.querySelector('td a')
					if (!$a) continue
					t+=$a.href+'\n'
				}
				const $textarea=document.createElement('textarea')
				$textarea.value=t
				$button.replaceWith($textarea)
			}
			$table.after($button)
		}{
			const tids=[]
			for (const $row of $table.rows) {
				if ($row.dataset.selectedVersion!=$row.dataset.topVersion) {
					tids.push($row.dataset.tid)
				}
			}
			const $button=document.createElement('button')
			$button.textContent=`RC select ${tids.length} non-top-version selected elements`
			if (tids.length==0) {
				$button.disabled=true
			}
			$button.onclick=()=>{
				const href='http://127.0.0.1:8111/load_object?objects='+tids.join(',')
				fetch(href)
			}
			$table.after($button)
		}
	}
}
