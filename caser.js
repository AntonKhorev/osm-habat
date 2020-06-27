const fs=require('fs')
const readline=require('readline')
const expat=require('node-expat')

const osm=require('./osm')
const User=require('./user')

class Section {
	constructor() {
		this.lines=[]
		this.data={}
		this.subsections=[]
		this.report=[]
		this.written=false
	}
}

async function main() {
	const filename=process.argv[2]
	if (filename===undefined) {
		console.log('missing cases filename')
		return process.exit(1)
	}
	const rootSection=await readSections(filename)
	await processSections(rootSection,false)
	await reportSections(rootSection)
}
main()

async function readSections(filename,callback) {
	function parseElementString(elementString) {
		let match
		if (match=elementString.match(/(node|way|relation)[ /#]+(\d+)$/)) {
			const [,type,id]=match
			return [type,id]
		}
	}
	let match
	const rootSection=new Section()
	let currentSection=rootSection
	const sectionStack=[]
	return new Promise(resolve=>readline.createInterface({
		input: fs.createReadStream(filename)
	}).on('line',input=>{
		if (match=input.match(/^(#+)(.*)/)) {
			const [,headerPrefix,rest]=match
			const sectionLevel=headerPrefix.length
			while (sectionLevel<=sectionStack.length) {
				currentSection=sectionStack.pop()
			}
			while (sectionLevel>sectionStack.length) {
				sectionStack.push(currentSection)
				const newSection=new Section()
				currentSection.subsections.push(newSection)
				sectionStack.push(currentSection)
				currentSection=newSection
			}
		}
		currentSection.lines.push(input)
		const add=(item,value)=>{
			if (value===undefined) {
				console.log(`syntax error when specifying ${item}`)
				return
			}
			if (!currentSection.data[item]) currentSection.data[item]=[]
			currentSection.data[item].push(value)
		}
		if (match=input.match(/^\*\s+uid\s+(\S+)/)) {
			const [,uidString]=match
			add('uids',uidString)
		} else if (match=input.match(/^\*\s+changesets\s+count\s+(\S+)/)) {
			const [,changesetsCountString]=match
			add('changesetsCounts',changesetsCountString)
		} else if (match=input.match(/^\*\s+last\s+note\s+(.*)$/)) {
			const [,noteIdString]=match
			add('noteId',noteIdString)
		} else if (match=input.match(/^\*\s+element\s+(.*)$/)) {
			const [,elementString]=match
			add('elements',parseElementString(elementString))
		} else if (match=input.match(/^\*\s+tag\s+([^=]+)=(.*)$/)) {
			const [,k,v]=match
			if (!currentSection.data.tags) currentSection.data.tags={}
			currentSection.data.tags[k]=v
		}
	}).on('close',()=>{
		resolve(rootSection)
	}))
}

async function processSections(rootSection,verbose) {
	const rec=async(depth,section)=>{
		if (depth>0) console.log(section.lines[0])
		await processSection(section,verbose)
		for (const subsection of section.subsections) {
			await rec(depth+1,subsection)
		}
	}
	await rec(0,rootSection)
}

async function processSection(section,verbose) {
	if (section.data.uids) {
		for (const [i,uid] of section.data.uids.entries()) {
			let done=false
			if (section.data.changesetsCounts && section.data.changesetsCounts[i]) {
				const changesetsCount=section.data.changesetsCounts[i]
				const user=new User(uid)
				await new Promise(resolve=>user.requestMetadata(resolve))
				if (user.changesetsCount>Number(changesetsCount)) {
					section.report.push(`* USER ${user.displayName} MADE EDITS`)
				} else if (verbose) {
					section.report.push(`* user ${user.displayName} made no edits`)
				}
				done=true
			}
			if (section.data.noteId && section.data.noteId[i]) {
				const oldNoteId=section.data.noteId[i]
				const user=new User(uid)
				await new Promise(resolve=>user.requestMetadata(resolve))
				const newNoteId=await getLastNoteId(uid)
				if (oldNoteId!=newNoteId) {
					section.report.push(`* USER ${user.displayName} ADDED A NEW NOTE #${newNoteId}`)
				} else if (verbose) {
					section.report.push(`* user ${user.displayName} added no new notes`)
				}
				done=true
			}
			if (verbose && !done) {
				section.report.push(`* uid ${uid} is set, but neither changesets count nor last note is not set`)
			}
		}
	}
	if (section.data.elements) {
		if (!section.data.tags || Object.keys(section.data.tags).length===0) {
			if (verbose) section.report.push(`* element is set, but no tags to check`)
		} else {
			for (const [elementType,elementId] of section.data.elements) {
				const diff=await checkElementTags(elementType,elementId,section.data.tags)
				if (Object.keys(diff).length>0) {
					for (const [k,[v1,v2]] of Object.entries(diff)) {
						section.report.push(`* ${elementType} #${elementId} EXPECTED TAG ${k}=${v1}`)
						section.report.push(`* ${elementType} #${elementId} ACTUAL   TAG ${k}=${v2}`)
					}
				} else if (verbose) {
					section.report.push(`* ${elementType} #${elementId} has no tag differences`)
				}
			}
		}
	}
}

async function getLastNoteId(uid) {
	return new Promise(resolve=>osm.apiGet(`/api/0.6/notes/search?limit=1&user=${uid}`,res=>{
		let captureId=false
		let noteId=''
		res.pipe((new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='id') captureId=true
		}).on('endElement',(name)=>{
			if (name=='id') captureId=false
		}).on('text',(text)=>{
			if (captureId) noteId+=text
		}).on('end',()=>{
			resolve(noteId)
		}))
	}))
}

async function checkElementTags(elementType,elementId,tags) {
	const diff={}
	for (const [k,v] of Object.entries(tags)) {
		diff[k]=[v,'']
	}
	return new Promise(resolve=>osm.apiGet(`/api/0.6/${elementType}/${elementId}`,res=>{
		res.pipe((new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='tag' && diff[attrs.k]) {
				if (diff[attrs.k][0]===attrs.v) {
					delete diff[attrs.k]
				} else {
					diff[attrs.k][1]=attrs.v
				}
			}
		}).on('end',()=>{
			resolve(diff)
		}))
	}))
}

async function reportSections(rootSection) {
	const reportFile=await fs.promises.open('report.md','w')
	const sectionStack=[]
	const rec=async(section)=>{
		sectionStack.push(section)
		if (section.report.length>0) {
			for (const section of sectionStack) {
				if (section.written) continue
				for (const line of section.lines) await reportFile.write(line+'\n')
				section.written=true
			}
			for (const line of section.report) await reportFile.write(line+'\n')
			await reportFile.write('\n')
		}
		for (const subsection of section.subsections) {
			await rec(subsection)
		}
		sectionStack.pop()
	}
	await rec(rootSection)
}
