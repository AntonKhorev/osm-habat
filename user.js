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
}

module.exports=User