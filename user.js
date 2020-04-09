const fs=require('fs')
const path=require('path')
const expat=require('node-expat')
const sanitize=require('sanitize-filename')

const osm=require('./osm')

class User {
	constructor(uid) {
		this.uid=uid
		this.dirName=path.join('user',sanitize(uid))
	}
	get exists() {
		return fs.existsSync(this.dirName)
	}
	get changesets() {
		if (this._changesets!==undefined) return this._changesets
		const filename=path.join(this.dirName,'changesets.txt')
		if (!fs.existsSync(filename)) return this._changesets=[]
		const changesetsString=fs.readFileSync(filename,'utf8')
		this._changesets=[]
		for (const id of changesetsString.split('\n')) {
			if (id!='') this._changesets.push(Number(id))
		}
		return this._changesets
	}
	mergeChangesets(changesets2) {
		const changesets1=this.changesets
		const resultingChangesets=[]
		for (let i1=0,i2=0;i1<changesets1.length||i2<changesets2.length;) {
			if (i1>=changesets1.length) {
				resultingChangesets.push(changesets2[i2++])
			} else if (i2>=changesets2.length) {
				resultingChangesets.push(changesets1[i1++])
			} else if (changesets1[i1]>changesets2[i2]) {
				resultingChangesets.push(changesets1[i1++])
			} else if (changesets1[i1]<changesets2[i2]) {
				resultingChangesets.push(changesets2[i2++])
			} else {
				resultingChangesets.push(changesets1[i1++])
				i2++
			}
		}
		this._changesets=resultingChangesets
		fs.mkdirSync(this.dirName,{recursive:true})
		fs.writeFileSync(path.join(this.dirName,'changesets.txt'),this._changesets.join('\n')+'\n')
	}
	requestMetadata(callback) {
		osm.apiGet(`/api/0.6/user/${this.uid}`,res=>{
			fs.mkdirSync(this.dirName,{recursive:true})
			res.pipe(
				fs.createWriteStream(path.join(this.dirName,'meta.xml'))
			).on('finish',callback)
		})
	}
	readMetadata() {
		(new expat.Parser()).on('startElement',(name,attrs)=>{
			if (name=='user') {
				this._displayName=attrs.display_name
			} else if (name=='changesets') {
				this._changesetsCount=Number(attrs.count)
			}
		}).parse(fs.readFileSync(path.join(this.dirName,'meta.xml'),'utf8'))
	}
	get displayName() {
		if (this._displayName!==undefined) return this._displayName
		this.readMetadata()
		return this._displayName
	}
	get changesetsCount() {
		if (this._changesetsCount!==undefined) return this._changesetsCount
		this.readMetadata()
		return this._changesetsCount
	}
	get updateTimestamp() {
		if (this._updateTimestamp!==undefined) return this._updateTimestamp
		this._updateTimestamp=fs.statSync(path.join(this.dirName,'meta.xml')).mtime
		return this._updateTimestamp
	}
	parseChangesetMetadata(makeParser,callback) {
		const rec=(i)=>{
			if (i>=this.changesets.length) {
				callback()
				return
			}
			const id=this.changesets[i]
			const parser=makeParser(i).on('end',()=>{
				rec(i+1)
			})
			fs.createReadStream(path.join('changeset',sanitize(String(id)),'meta.xml')).pipe(parser)
		}
		rec(0)
	}
	parseChangesetData(makeParser,callback) {
		const rec=(i)=>{
			if (i<0) {
				callback()
				return
			}
			const id=this.changesets[i]
			const filename=path.join('changeset',sanitize(String(id)),'data.xml')
			if (fs.existsSync(filename)) {
				const parser=makeParser(i).on('end',()=>{
					rec(i-1)
				})
				fs.createReadStream(filename).pipe(parser)
			} else {
				rec(i-1)
			}
		}
		rec(this.changesets.length-1) // have to go backwards because changesets are stored in reverse order
	}
	parseAdditionalData(directory,makeParser,callback) {
		const dirname=path.join(this.dirName,directory)
		fs.readdir(dirname,(err,dirfilenames)=>{
			if (err) {
				callback()
				return
			}
			const rec=(i)=>{
				if (i>=dirfilenames.length) {
					callback()
					return
				}
				const parser=makeParser(i).on('end',()=>{
					rec(i+1)
				})
				fs.createReadStream(path.join(dirname,dirfilenames[i])).pipe(parser)
			}
			rec(0)
		})
	}
	parsePreviousData(makeParser,callback) {
		this.parseAdditionalData('previous',makeParser,callback)
	}
	parseReferencedData(makeParser,callback) {
		this.parseAdditionalData('referenced',makeParser,callback)
	}
	beginRequestAdditionalData(directory) {
		// get previous versions with known numbers for a list of elements
		// /api/0.6/nodes?nodes=421586779v1,421586779v2
		// what if they are redacted? - shouldn't happen
		// uri has to be <8000 chars, <700 elements
		const request=(prefix,query,callback)=>{
			const getFirstFreeFilename=()=>{
				for (let i=1;;i++) {
					const filename=path.join(this.dirName,directory,`${prefix}.${i}.osm`)
					if (!fs.existsSync(filename)) return filename
				}
			}
			const filename=getFirstFreeFilename()
			osm.apiGet(query,res=>{
				fs.mkdirSync(path.join(this.dirName,directory),{recursive:true})
				res.pipe(
					fs.createWriteStream(filename)
				).on('finish',callback)
			})
		}
		const currentQueries={}
		const currentQueryCounts={}
		const queuedQueries={}
		const enqueue=(elementType)=>{
			if (!currentQueries[elementType]) return
			const fullQuery=`/api/0.6/${elementType}?${elementType}=${currentQueries[elementType]}`
			if (!queuedQueries[elementType]) queuedQueries[elementType]=[]
			queuedQueries[elementType].push(fullQuery)
			currentQueries[elementType]=''
			currentQueryCounts[elementType]=0
		}
		const enqueueAll=()=>{
			for (const elementType in currentQueries) {
				enqueue(elementType)
			}
		}
		return {
			add: (elementType,id,version)=>{
				if (!currentQueries[elementType]) {
					currentQueries[elementType]=''
					currentQueryCounts[elementType]=0
				}
				if (currentQueryCounts[elementType]>700 || currentQueries[elementType].length>7500) enqueue(elementType)
				if (currentQueryCounts[elementType]++) currentQueries[elementType]+=','
				currentQueries[elementType]+=id
				if (version!==undefined) currentQueries[elementType]+='v'+version
			},
			run: (callback)=>{
				enqueueAll()
				const allQueuedQueries=[]
				for (const [prefix,queries] of Object.entries(queuedQueries)) {
					for (const query of queries) allQueuedQueries.push([prefix,query])
				}
				const rec=(i)=>{
					if (i<allQueuedQueries.length) {
						const [prefix,query]=allQueuedQueries[i]
						request(prefix,query,()=>{
							rec(i+1)
						})
					} else {
						callback()
					}
				}
				rec(0)
			}
		}
	}
	beginRequestPreviousData() {
		return this.beginRequestAdditionalData('previous')
	}
	beginRequestReferencedData() {
		return this.beginRequestAdditionalData('referenced')
	}
}

module.exports=User
