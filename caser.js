const fs=require('fs')
const readline=require('readline')

const User=require('./user')

const filename=process.argv[2]

if (filename===undefined) {
	console.log('missing cases filename')
	return process.exit(1)
}

let match
let inCaseSectionLevel=0
let readingCaseData

function closeCase(caseData) {
	const writeCaseTitle=()=>console.log(`## case #${caseData.id} ${caseData.name}`)
	if (!caseData.uid) {
		writeCaseTitle()
		console.log(`* uid not set`)
		return
	}
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
	}
}).on('close',()=>{
	if (inCaseSectionLevel>0) {
		closeCase(readingCaseData)
		inCaseSectionLevel=0
		readingCaseData=undefined
	}
})
