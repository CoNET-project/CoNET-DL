import { logger } from '../util/logger'
import {selectLeaderboardEpoch, storeLeaderboardGuardians_referralsV1, regiestMiningNode} from './help-database'
import {inspect} from 'node:util'

import {ethers} from 'ethers'
// import {selectLeaderboard} from './serverV2'
import Colors from 'colors/safe'
const message =  {
	message: '{"walletAddress":"0x73940FCb2211c1c09eCeB6f42846E30Af6b459BC"}',
	signMessage: '0xb14ec93a35ff00ff3610e502dbabfb2b743e9e7b83fb307d50c0716340dd4a1b2a8a0e48d8dbae7bd04ca3b78750d7c5b54ff065839303a18ad4eb10a98ecceb1c'
}
const checkGasPrice = 2084388438


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
const test = () => {

}


// testDatabase()