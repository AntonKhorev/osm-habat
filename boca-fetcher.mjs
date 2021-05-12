import * as osm from './osm.js'
import * as osmFetcher from './osm-fetcher.mjs'

/**
 * Adaptor for latest version osm fetch with autosave
 */
export async function fetchTopVersions(project,eTypeIds) {
	return await fetch(project,eTypeIds,osmFetcher.fetchTopVersions)
}

/**
 * Adaptor for latest visible version osm fetch with autosave
 */
export async function fetchTopVisibleVersions(project,eTypeIds) {
	return await fetch(project,eTypeIds,osmFetcher.fetchTopVisibleVersions)
}

async function fetch(project,eTypeIds,osmFetcherCall) {
	if (!Array.isArray(eTypeIds)) eTypeIds=[...eTypeIds]
	let needToSave=false
	const multifetch=(...args)=>{
		needToSave=true
		return osm.multifetchToStore(...args)
	}
	const resultingElements=await osmFetcherCall(
		multifetch,
		project.store,
		eTypeIds
	)
	if (needToSave) project.saveStore()
	return resultingElements
}
