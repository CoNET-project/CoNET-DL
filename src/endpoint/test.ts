import { logger } from '../util/logger'
import {selectLeaderboardEpoch, storeLeaderboardGuardians_referralsV1, regiestMiningNode} from './help-database'
import {inspect} from 'node:util'
import { transferCCNTP } from '../util/transferManager'
import {ethers} from 'ethers'
import {initNewCONET} from './util'
import {checkSignObj, masterSetup} from '../util/util'
// import {selectLeaderboard} from './serverV2'
import Colors from 'colors/safe'

// const test = async () => {
// 	// await testInsert()
	
// 	//const kkk = await checkSignObj (message.message, message.signMessage)

// 	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
// 	// const feeData = await provideCONET.getFeeData()
// 	// const gasPrice = feeData.gasPrice ? parseFloat(feeData.gasPrice?.toString()): checkGasPrice
// 	const block = await provideCONET.getBlockNumber ()
// 	// const kkk = await selectLeaderboard()
// 	logger(Colors.blue(`Start selectLeaderboard ${block}`))
// 	// const kkkk = await selectLeaderboard(block)

// 	// logger(inspect(Object.keys(kk1), false, 3, true))
// }

const testDatabase = async () => {
	await regiestMiningNode()
}
// 0xa801173E44C97C75639447827c2Ea8A484eed9bf
const test = async () => {
	const wallet = '0x9e8718a3bf09a30ebba3904065adfdc69c9528d7'
	const admin = new ethers.Wallet(masterSetup.cnptReferralAdmin)
	await initNewCONET(wallet)

	logger(admin.address)
}

test()
// testDatabase()

//		curl -H "origin: https://scannew.conet.network/" -v "https://scanapi.conet.network/api/v2/stats"