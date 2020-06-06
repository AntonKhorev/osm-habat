const fs=require('fs')
const readline=require('readline')
const expat=require('node-expat')

const osm=require('./osm')
const User=require('./user')

function checkElementTags(elementType,elementId,tags,callback) {
	const diff={}
	for (const [k,v] of Object.entries(tags)) {
		diff[k]=[v,'']
	}
	osm.apiGet(`/api/0.6/${elementType}/${elementId}`,res=>{
		res.pipe((new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='tag' && diff[attrs.k]) {
				if (diff[attrs.k][0]===attrs.v) {
					delete diff[attrs.k]
				} else {
					diff[attrs.k][1]=attrs.v
				}
			}
		}).on('end',()=>{
			callback(diff)
		}))
	})
}

function processCase(caseData,callback) {
	console.log(`## case #${caseData.id} ${caseData.name}`)
	const queue=[]
	if (caseData.uid) {
		if (!caseData.changesetsCount) {
			console.log(`* uid is set, but changesets count not set`)
		} else {
			const user=new User(caseData.uid)
			queue.push(callback=>user.requestMetadata(()=>{
				if (user.changesetsCount>Number(caseData.changesetsCount)) {
					console.log(`* USER MADE EDITS`)
				} else {
					console.log(`* user made no edits`)
				}
				callback()
			}))
		}
	}
	if (caseData.elements) {
		if (!caseData.tags || Object.keys(caseData.tags).length===0) {
			console.log(`* element is set, but no tags to check`)
		} else {
			for (const [elementType,elementId] of caseData.elements) {
				queue.push(callback=>{
					console.log(`### ${elementType} #${elementId}`)
					checkElementTags(elementType,elementId,caseData.tags,diff=>{
						if (Object.keys(diff).length===0) {
							console.log(`* no tag differences`)
						} else {
							for (const [k,[v1,v2]] of Object.entries(diff)) {
								console.log(`* EXPECTED TAG ${k}=${v1}`)
								console.log(`* ACTUAL   TAG ${k}=${v2}`)
							}
						}
						callback()
					})
				})
			}
		}
	}
	if (queue.length==0) {
		console.log(`* uid/element not set`)
	}
	const rec=i=>{
		if (i>=queue.length) {
			callback()
		} else {
			queue[i](()=>rec(i+1))
		}
	}
	rec(0)
}

function processCases(caseDataQueue,callback) {
	const rec=(i)=>{
		if (i>=caseDataQueue.length) {
			callback()
			return
		}
		processCase(caseDataQueue[i],()=>{
			rec(i+1)
		})
	}
	rec(0)
}

function readCases(filename,callback) {
	function parseElementString(elementString) {
		let match
		if (match=elementString.match(/(node|way|relation)\/(\d+)$/)) {
			const [,type,id]=match
			return [type,id]
		} else {
			return [undefined,undefined]
		}
	}
	let match
	let inCaseSectionLevel=0
	let caseDataQueue=[]
	let readingCaseData
	readline.createInterface({
		input: fs.createReadStream(filename)
	}).on('line',input=>{
		if (match=input.match(/^(#+)(.*)/)) {
			const [,headerPrefix,rest]=match
			const sectionLevel=headerPrefix.length
			if (sectionLevel<=inCaseSectionLevel) {
				caseDataQueue.push(readingCaseData)
				readingCaseData=undefined
				inCaseSectionLevel=0
			}
			if (inCaseSectionLevel<=0 && (match=rest.match(/\s*#(\S+)\s+(.*)/))) {
				inCaseSectionLevel=sectionLevel
				readingCaseData={}
				;[,readingCaseData.id,readingCaseData.name]=match
			}
		}
		if (inCaseSectionLevel<=0) return
		if (match=input.match(/^\*\s+uid\s+(\S+)/)) {
			;[,readingCaseData.uid]=match
		} else if (match=input.match(/^\*\s+changesets\s+count\s+(\S+)/)) {
			;[,readingCaseData.changesetsCount]=match
		} else if (match=input.match(/^\*\s+element\s+(\S+)/)) {
			const [,elementString]=match
			if (!readingCaseData.elements) readingCaseData.elements=[]
			readingCaseData.elements.push(parseElementString(elementString))
		} else if (match=input.match(/^\*\s+tag\s+([^=]+)=(.*)$/)) {
			const [,k,v]=match
			if (!readingCaseData.tags) readingCaseData.tags={}
			readingCaseData.tags[k]=v
		}
	}).on('close',()=>{
		if (inCaseSectionLevel>0) {
			caseDataQueue.push(readingCaseData)
			readingCaseData=undefined
			inCaseSectionLevel=0
		}
		callback(caseDataQueue)
	})
}

const filename=process.argv[2]
if (filename===undefined) {
	console.log('missing cases filename')
	return process.exit(1)
}
readCases(filename,(caseDataQueue)=>{
	processCases(caseDataQueue,()=>{})
})
