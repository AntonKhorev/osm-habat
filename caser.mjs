import * as fs from 'fs'
import * as readline from 'readline'
import * as expat from 'node-expat'

import {createRequire} from 'module'
const meow=createRequire(import.meta.url)('meow')

import * as osm from './osm.js'
import * as osmLink from './osm-link.mjs'
import User from './user.js'

class Section {
	constructor() {
		this.lines=[]
		this.data={}
		this.subsections=[]
		this.report=[]
		this.written=false
	}
}

const cli=meow(`
	Usage
	  $ node caser.js <input> <output>

	Options
	  --dry,     -d  Don't make OSM API requests
	  --verbose, -v  Also write successful reports
`,{
	flags: {
		dry: {
			type: 'boolean',
			alias: 'd',
		},
		verbose: {
			type: 'boolean',
			alias: 'v',
		},
	},
})

main(cli.input[0],cli.input[1],cli.flags)

async function main(inputFilename,outputFilename,flags) {
	if (inputFilename===undefined) {
		console.log('missing cases filename')
		return process.exit(1)
	}
	const rootSection=await readSections(inputFilename)
	await processSections(rootSection,flags)
	await reportSections(rootSection,outputFilename)
}

async function readSections(filename,callback) {
	function parseElementString(elementString) {
		let match
		if (match=elementString.match(/(node|way|relation)[ /#]+(\d+)$/)) { // url
			const [,type,id]=match
			return [type,id]
		} else if (match=elementString.match(/^([nwr])(\d+)$/)) { // n12345
			const [,t,id]=match
			return [{n:'node',w:'way',r:'relation'}[t],id]
		}
	}
	function parseNoteString(elementString) {
		let match
		if (match=elementString.match(/note[ /#]+(\d+)$/)) { // url
			const [,id]=match
			return id
		} else if (match=elementString.match(/^\d+$/)) { // 12345
			const [id]=match
			return id
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
			add('changesetsCounts',changesetsCountString.replace(/,/g,'')) // allow input with commas like 2,950 b/c it's on osm user page
		} else if (match=input.match(/^\*\s+last\s+note\s+(.*)$/)) {
			const [,lastNoteIdString]=match
			add('lastNoteId',lastNoteIdString)
		} else if (match=input.match(/^\*\s+modified\s+(\d+)\s+notes?$/)) {
			const [,noteCountString]=match
			add('noteCount',noteCountString)
		} else if (match=input.match(/^\*\s+element\s+(.*)$/)) {
			const [,elementString]=match
			add('elements',parseElementString(elementString))
		} else if (match=input.match(/^\*\s+((?:node|way|relation)\s+.*)$/)) {
			const [,elementString]=match
			add('elements',parseElementString(elementString))
		} else if (match=input.match(/^\*\s+version\s+(.*)$/)) {
			const [,versionString]=match
			add('versions',versionString)
		} else if (match=input.match(/^\*\s+tag\s+([^=]+)=(.*)$/)) {
			const [,k,v]=match
			if (!currentSection.data.tags) currentSection.data.tags={}
			currentSection.data.tags[k]=v
		} else if (match=input.match(/^\*\s+should\s+contain\s+element\s+(.*)$/)) {
			const [,elementString]=match
			add('shouldContainElements',parseElementString(elementString))
		} else if (match=input.match(/^\*\s+should\s+exist/)) {
			currentSection.data.shouldExist=true
		} else if (match=input.match(/^\*\s+note\s+(.*)$/)) {
			const [,noteString]=match
			add('notes',parseNoteString(noteString))
		} else if (match=input.match(/^\*\s+should\s+be\s+open$/)) {
			currentSection.data.shouldBeOpen=true
		}
	}).on('close',()=>{
		resolve(rootSection)
	}))
}

async function processSections(rootSection,flags) {
	const rec=async(depth,section)=>{
		if (depth>0) console.log(section.lines[0])
		await processSection(section,flags)
		for (const subsection of section.subsections) {
			await rec(depth+1,subsection)
		}
	}
	await rec(0,rootSection)
}

async function processSection(section,flags) {
	if (section.data.uids) {
		for (const [i,uid] of section.data.uids.entries()) {
			let done=false
			if (section.data.changesetsCounts && section.data.changesetsCounts[i]) {
				done=true
				const changesetsCount=section.data.changesetsCounts[i]
				if (flags.dry) {
					section.report.push(`* will check user #${uid} metadata for changesets count`)
				} else {
					const user=new User(uid)
					await new Promise(resolve=>user.requestMetadata(resolve))
					const nNewChangesets=user.changesetsCount-changesetsCount
					if (nNewChangesets) {
						section.report.push(`* USER ${user.displayName} MADE ${nNewChangesets} EDIT${nNewChangesets==1?'':'S'}`)
						const userHistory=osmLink.username(user.displayName).history
						section.report.push(`* SEE ${user.displayName}'s edit history: ${userHistory}`)
					} else if (flags.verbose) {
						section.report.push(`* user ${user.displayName} made no edits`)
					}
				}
			}
			if (section.data.lastNoteId && section.data.lastNoteId[i]) {
				done=true
				const oldLastNoteId=section.data.lastNoteId[i]
				if (flags.dry) {
					section.report.push(`* will check user #${uid} metadata`) // actually don't need to
					section.report.push(`* will check user #${uid} last note`)
				} else {
					const user=new User(uid)
					await new Promise(resolve=>user.requestMetadata(resolve))
					const newLastNoteId=await getLastNoteId(uid)
					if (newLastNoteId!==undefined && oldLastNoteId!=newLastNoteId) {
						section.report.push(`* USER ${user.displayName} ADDED A NEW NOTE #${newLastNoteId}`)
					} else if (flags.verbose) {
						section.report.push(`* user ${user.displayName} added no new notes`)
					}
				}
			}
			if (section.data.noteCount && section.data.noteCount[i]) {
				done=true
				const oldNoteCount=section.data.noteCount[i]
				if (flags.dry) {
					section.report.push(`* will check user #${uid} metadata`) // actually don't need to
					section.report.push(`* will check user #${uid} modified notes`)
				} else {
					const user=new User(uid)
					await new Promise(resolve=>user.requestMetadata(resolve))
					const newNoteCountLowerBound=await getNoteCountLowerBound(uid,oldNoteCount)
					if (newNoteCountLowerBound>oldNoteCount) {
						section.report.push(`* USER ${user.displayName} MODIFIED AT LEAST ONE MORE NOTE`)
					} else if (newNoteCountLowerBound<oldNoteCount) {
						section.report.push(`* USER ${user.displayName} MODIFIED LESS NOTES THAN SPECIFIED, maybe some notes were hidden`)
					} else if (flags.verbose) {
						section.report.push(`* user ${user.displayName} modified no additional notes`)
					}
				}
			}
			if (flags.verbose && !done) {
				section.report.push(`* uid ${uid} is set, but nothing to check`)
			}
		}
	}
	if (section.data.elements) {
		if (
			(!section.data.shouldExist) &&
			(!section.data.tags || Object.keys(section.data.tags).length===0) &&
			(!section.data.shouldContainElements)
		) {
			if (flags.verbose) section.report.push(`* element is set, but nothing to check`)
		} else {
			for (const [i,[elementType,elementId]] of section.data.elements.entries()) {
				if (section.data.shouldExist) {
					if (flags.dry) {
						section.report.push(`* will check if ${elementType} #${elementId} exists`)
					} else {
						const exists=await checkElementExists(elementType,elementId)
						if (!exists) {
							section.report.push(`* ${elementType} #${elementId} DOES NOT EXIST`)
						} else if (flags.verbose) {
							section.report.push(`* ${elementType} #${elementId} exists as expected`)
						}
					}
				}
				if (section.data.versions) {
					if (flags.dry) {
						section.report.push(`* will check version of ${elementType} #${elementId}`)
					} else {
						const expectedVersion=section.data.versions[i]
						const newVersion=await checkElementVersion(elementType,elementId)
						const nDiffVersions=newVersion-expectedVersion
						if (nDiffVersions) {
							section.report.push(`* ${elementType} #${elementId} WAS UPDATED ${nDiffVersions} TIME${nDiffVersions==1?'':'S'}`)
						} else if (flags.verbose) {
							section.report.push(`* ${elementType} #${elementId} was not changes`)
						}
					}
				}
				if (section.data.tags && Object.keys(section.data.tags).length>0) {
					if (flags.dry) {
						section.report.push(`* will check ${elementType} #${elementId} tags`)
					} else {
						const diff=await checkElementTags(elementType,elementId,section.data.tags)
						if (Object.keys(diff).length>0) {
							for (const [k,[v1,v2]] of Object.entries(diff)) {
								section.report.push(`* ${elementType} #${elementId} EXPECTED TAG ${k}=${v1}`)
								section.report.push(`* ${elementType} #${elementId} ACTUAL   TAG ${k}=${v2}`)
							}
						} else if (flags.verbose) {
							section.report.push(`* ${elementType} #${elementId} has no tag differences`)
						}
					}
				}
				if (section.data.shouldContainElements) {
					if (flags.dry) {
						section.report.push(`* will check ${elementType} #${elementId} contained elements`)
					} else {
						// TODO only do one element request
						// TODO currently only chacks nodes inside way, do the rest
						const diff=await checkContainedWayNodes(elementType,elementId,section.data.shouldContainElements)
						if (Object.keys(diff).length>0) {
							subElementType='node'
							for (const subElementId of Object.keys(diff)) {
								section.report.push(`* ${elementType} #${elementId} DOES NOT CONTAIN ${subElementType} #${subElementId}`)
							}
						} else if (flags.verbose) {
							section.report.push(`* ${elementType} #${elementId} contains all required elements`)
						}
					}
				}
			}
		}
	}
	if (section.data.notes) {
		if (!section.data.shouldBeOpen) {
			if (flags.verbose) section.report.push(`* note is set, but nothing to check`)
		} else {
			for (const noteId of section.data.notes) {
				if (section.data.shouldBeOpen) {
					if (flags.dry) {
						section.report.push(`* will check if note #${noteId} is open`)
					} else {
						const noteStatus=await checkNoteStatus(noteId)
						if (noteStatus!='open') {
							section.report.push(`* note #${noteId} IS NOT OPEN, its status ${noteStatus}`)
						} else if (flags.verbose) {
							section.report.push(`* note #${noteId} is open as expected`)
						}
					}
				}
			}
		}
	}
}

async function getLastNoteId(uid) {
	return new Promise(resolve=>osm.apiGet(`/api/0.6/notes/search?limit=1&closed=-1&sort=created_at&user=${uid}`,res=>{
		let captureId=false
		let noteId // undefined = no notes, last note possibly hidden
		res.pipe((new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='id') captureId=true
		}).on('endElement',(name)=>{
			if (name=='id') captureId=false
		}).on('text',(text)=>{
			if (!captureId) return
			if (noteId===undefined) noteId=''
			noteId+=text
		}).on('end',()=>{
			resolve(noteId)
		}))
	}))
}

async function getNoteCountLowerBound(uid,oldNoteCount) {
	return new Promise(resolve=>osm.apiGet(`/api/0.6/notes/search?limit=${oldNoteCount+1}&closed=-1&user=${uid}`,res=>{
		let noteCount=0
		res.pipe((new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='note') noteCount++
		}).on('end',()=>{
			resolve(noteCount)
		}))
	}))
}

async function checkNoteStatus(noteId) {
	return new Promise(resolve=>osm.apiGet(`/api/0.6/notes/${noteId}`,res=>{
		let captureStatus=false
		let noteStatus=''
		res.pipe((new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='status') captureStatus=true
		}).on('endElement',(name)=>{
			if (name=='status') captureStatus=false
		}).on('text',(text)=>{
			if (captureStatus) noteStatus+=text
		}).on('end',()=>{
			resolve(noteStatus)
		}))
	}))
}

async function checkElementExists(elementType,elementId) {
	return new Promise(resolve=>osm.apiGet(`/api/0.6/${elementType}/${elementId}`,res=>{
		resolve(res.statusCode==200)
	}))
}

async function checkElementVersion(elementType,elementId) {
	return new Promise(resolve=>osm.apiGet(`/api/0.6/${elementType}/${elementId}`,res=>{
		res.pipe((new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name==elementType) {
				res.destroy()
				resolve(attrs.version)
			}
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

async function checkContainedWayNodes(elementType,elementId,subelements) {
	const diff={}
	for (const [subElementType,subElementId] of subelements) {
		if (subElementType!='node') continue
		diff[subElementId]=true
	}
	return new Promise(resolve=>osm.apiGet(`/api/0.6/${elementType}/${elementId}`,res=>{
		res.pipe((new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='nd') {
				delete diff[attrs.ref]
			}
		}).on('end',()=>{
			resolve(diff)
		}))
	}))
}

async function reportSections(rootSection,outputFilename) {
	const reportFile=await fs.promises.open(outputFilename,'w')
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
