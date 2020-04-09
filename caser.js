const fs=require('fs')
const readline=require('readline')
const expat=require('node-expat')

const osm=require('./osm')
const User=require('./user')

const filename=process.argv[2]

if (filename===undefined) {
	console.log('missing cases filename')
	return process.exit(1)
}

let match
let inCaseSectionLevel=0
let readingCaseData

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

function closeCase(caseData) {
	const writeCaseTitle=()=>console.log(`## case #${caseData.id} ${caseData.name}`)
	if (caseData.uid) {
		if (!caseData.changesetsCount) {
			writeCaseTitle()
			console.log(`* changesets count not set`)
			return
		}
		const user=new User(caseData.uid)
		user.requestMetadata(()=>{
			writeCaseTitle()
			if (user.changesetsCount>Number(caseData.changesetsCount)) {
				console.log(`* USER MADE EDITS`)
			} else {
				console.log(`* user made no edits`)
			}
		})
	} else if (caseData.elementType && caseData.elementId) {
		if (!caseData.tags || Object.keys(caseData.tags).length===0) {
			writeCaseTitle()
			console.log(`* no tags to check`)
			return
		}
		checkElementTags(caseData.elementType,caseData.elementId,caseData.tags,diff=>{
			writeCaseTitle()
			if (Object.keys(diff).length===0) {
				console.log(`* no tag differences`)
				return
			}
			for (const [k,[v1,v2]] of Object.entries(diff)) {
				console.log(`* EXPECTED TAG ${k}=${v1}`)
				console.log(`* ACTUAL   TAG ${k}=${v2}`)
			}
		})
	} else {
		writeCaseTitle()
		console.log(`* uid/element not set`)
	}
}

function parseElementString(elementString) {
	let match
	if (match=elementString.match(/(node|way|relation)\/(\d+)$/)) {
		const [,type,id]=match
		return [type,id]
	} else {
		return [undefined,undefined]
	}
}

readline.createInterface({
	input: fs.createReadStream(filename)
}).on('line',input=>{
	if (match=input.match(/^(#+)(.*)/)) {
		const [,headerPrefix,rest]=match
		const sectionLevel=headerPrefix.length
		if (sectionLevel<=inCaseSectionLevel) {
			closeCase(readingCaseData)
			inCaseSectionLevel=0
			readingCaseData=undefined
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
		;[readingCaseData.elementType,readingCaseData.elementId]=parseElementString(elementString)
	} else if (match=input.match(/^\*\s+tag\s+([^=]+)=(.*)$/)) {
		const [,k,v]=match
		if (!readingCaseData.tags) readingCaseData.tags={}
		readingCaseData.tags[k]=v
	}
}).on('close',()=>{
	if (inCaseSectionLevel>0) {
		closeCase(readingCaseData)
		inCaseSectionLevel=0
		readingCaseData=undefined
	}
})
