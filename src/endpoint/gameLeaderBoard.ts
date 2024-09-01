import {ethers} from 'ethers'
import {listAllLotte} from './help-database'
import {writeFile} from 'node:fs'
import {masterSetup} from '../util/util'

const conetRPC = new ethers.JsonRpcProvider('https://rpc.conet.network')
const startWriteReadboard = async (block:  number) => {
	const list = await listAllLotte ()
	await saveFragment('gaem_LeaderBoard', JSON.stringify(list))
	console.log (`GameLeaderBoard [${block}] = gaem_LeaderBoard success`)
}
const storagePATH = masterSetup.storagePATH

const saveFragment = (hashName: string, data: string) => new Promise(resolve=> {
	const lastChar = hashName[hashName.length-1]
	const n = parseInt(`0x${lastChar}`, 16)
	const path = storagePATH[n%storagePATH.length]
	const fileName = `${path}/${hashName}`

	return writeFile(fileName, data, err => {
		if (err) {
			console.log(`saveFragment [${hashName}] data length [${data.length}] Error! ${err.message}`)
			return resolve (false)
		}
		console.log(`saveFragment storage [${fileName}] data length = ${data.length} success!`)
		return resolve (true)
	})
})
export const start = () => {
	conetRPC.on ('block', async block => {
		return startWriteReadboard (block)
	})
}

start()

//		https://ipfs.conet.network/api/getFragment/gaem_LeaderBoard