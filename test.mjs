import * as fs from 'fs'

const testDirUrl=new URL('test/',import.meta.url)
for (const filename of fs.readdirSync(testDirUrl)) {
	const testFileUrl=new URL(filename,testDirUrl)
	import(testFileUrl)
}
