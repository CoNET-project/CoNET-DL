import { logger } from '../util/logger'

import {inspect} from 'node:util'
import { transferCCNTP } from '../util/transferManager'
import {ethers} from 'ethers'
import {initNewCONET, } from './utilNew'
import {checkSignObj, masterSetup} from '../util/util'
import {conet_lotte, listAllLotte} from './help-database'
// import {selectLeaderboard} from './serverV2'
import Colors from 'colors/safe'
import { forEach } from 'async'

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


// 0xa801173E44C97C75639447827c2Ea8A484eed9bf
const test = async (_wallet: string) => {
	logger(`Start test ${_wallet}`)
	const kkk = await initNewCONET(_wallet)
	logger(kkk)
}


const testLottle = async (_wallet: string) => {
	// await conet_lotte ('0x8fe94537b3f39d25f3e55425d1ea98cafa1c76c9', 4, false)
	// await conet_lotte ('0x80d9f0b27803c583cca27bb6592945da958241da', 58, false)
	const kk = await listAllLotte()
	logger(kk)
}
const wallet = process.argv[2]

testLottle(wallet)


// testDatabase()

//		curl -H "origin: https://scannew.conet.network/" -v "https://scanapi.conet.network/api/v2/stats"