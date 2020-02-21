// get changeset metadata w/ discussion
// https://api.openstreetmap.org/api/0.6/changeset/80065151?include_discussion=true

// get changeset metadata w/o discussion
// https://api.openstreetmap.org/api/0.6/changeset/80065151

// get changeset data
// https://api.openstreetmap.org/api/0.6/changeset/80065151/download

// get 100 latest changesets by user
// contains changeset metadata w/o comments
// https://api.openstreetmap.org/api/0.6/changesets?user=10659315

// get next 100 changesets                                                        vvvvvvvvvvvvvvvvvvvv this is created_at="2020-01-23T18:32:43Z" value of last returned changeset
// https://api.openstreetmap.org/api/0.6/changesets?user=10659315&time=2001-01-01,2020-01-23T18:32:43Z

// repeat until get empty result

// get user details by user id
// https://api.openstreetmap.org/api/0.6/user/10659315

const fs=require('fs')
const https=require('https')

function addUser(userName) {
	// only doable by fetching changesets by display_name
	const apiUrl=`https://api.openstreetmap.org/api/0.6/changesets?display_name=${encodeURIComponent(userName)}`
	console.log(`GET ${apiUrl}`)
	https.get(apiUrl,res=>{
		if (res.statusCode!=200) {
			console.log(`cannot find user ${userName}`)
			return process.exit(1)
		}
		res.pipe(fs.createWriteStream('output'))
	})

	//https.get(url,function(response){
	//	response.pipe(fs.createWriteStream(filename)).on('finish',singleCallback)
	//})
}

const cmd=process.argv[2]
if (cmd=='add') {
	const userString=process.argv[3]
	if (userString===undefined) {
		console.log('missing add argument')
		return process.exit(1)
	}
	try {
		const userUrl=new URL(userString)
		if (userUrl.host!='www.openstreetmap.org') {
			console.log(`unrecognized host ${userUrl.host}`)
			return process.exit(1)
		}
		const [,userPathDir,userPathEnd]=userUrl.pathname.split('/')
		if (userPathDir=='user') {
			const userName=decodeURIComponent(userPathEnd)
			console.log(`adding user ${userName}`)
			addUser(userName)
		} else {
			console.log('invalid url format')
			return process.exit(1)
		}
	} catch {
		console.log(`invalid add argument ${userString}`)
		return process.exit(1)
	}
} else {
	console.log('invalid or missing command; available commands: add')
	return process.exit(1)
}
