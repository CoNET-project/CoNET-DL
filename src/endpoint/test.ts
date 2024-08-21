import { logger } from '../util/logger'

import {inspect} from 'node:util'
import { transferCCNTP } from '../util/transferManager'
import {ethers} from 'ethers'
import {initNewCONET, } from './utilNew'
import {checkSignObj, masterSetup} from '../util/util'
import {conet_lotte, listAllLotte, conet_lotte_bio, restoreAllOld_lotte, conet_lotte_new, cleanupData, getAllMinerNodes} from './help-database'
// import {selectLeaderboard} from './serverV2'
import Colors from 'colors/safe'
import {faucet_call} from './serverV2master'
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
const provider = new ethers.JsonRpcProvider('http://207.90.195.80:8000')
// const provider1 = new ethers.JsonRpcProvider('http://74.208.39.153:8000')

const listenEPOCH1 = async () => {
	const epoch = await provider.getBlockNumber()
	logger(`listenEPOCH1 got local epoch = ${epoch}`)
	provider.on('block', block => {
		logger(`listenEPOCH1 new block ${block}`)
	})
}

// const listenEPOCH2 = async () => {
// 	const epoch = await provider1.getBlockNumber()
// 	logger(`listenEPOCH2 got local epoch = ${epoch}`)
// 	provider1.on('block', block => {
// 		logger(`listenEPOCH2 new block ${block}`)
// 	})
// }

const testLottle = async (_wallet: string) => {
	for (let i of masterSetup.initManager) {
		logger((new ethers.Wallet(i)).address)
	}
	// const kk = await conet_lotte_new ('0xe2c2212b2f32a926b6465e06a5ec382cf617c817', 1)
	//const kk = await conet_lotte_bio('0x7728aa515d635e44dfcad7af903d177b35b8525a', '')
	// const kk = await restoreAllOld_lotte ()
	// const kk = await listAllLotte()
	// conet_lotte_new()
	// const kk = await getAllMinerNodes ()
	// logger(inspect(kk, false, 3, true))
	// const kk = await faucet_call(_wallet, '192.168.0.2')
	// logger(inspect(kk, false, 3, true))
}
testLottle('')
const wallet = process.argv[2]



// listenEPOCH2()




// testDatabase()

//		curl -H "origin: https://scannew.conet.network/" -v "https://scanapi.conet.network/api/v2/stats"