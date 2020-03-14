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
let caseData

function closeCase() {
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
			closeCase()
			inCaseSectionLevel=0
		}
		if (inCaseSectionLevel<=0 && (match=rest.match(/\s*#(\S+)\s+(.*)/))) {
			inCaseSectionLevel=sectionLevel
			caseData={}
			;[,caseData.id,caseData.name]=match
		}
	}
	if (inCaseSectionLevel<=0) return
	if (match=input.match(/^\*\s+uid\s+(\S+)/)) {
		;[,caseData.uid]=match
	} else if (match=input.match(/^\*\s+changesets\s+count\s+(\S+)/)) {
		;[,caseData.changesetsCount]=match
	}
}).on('close',()=>{
	if (inCaseSectionLevel>0) {
		closeCase()
		inCaseSectionLevel=0
	}
})
