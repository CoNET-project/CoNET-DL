import { logger } from '../util/logger'
import {selectLeaderboardEpoch, storeLeaderboardGuardians_referralsV1, regiestMiningNode} from './help-database'
import {inspect} from 'node:util'

import {ethers} from 'ethers'
import {selectLeaderboard} from './serverV2'
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
	const wallet = [
		'0xe516cee45987b1da7759336dc19426f55b3afc32',
		'0x20fb66dcdf7edc9e71042a379e100b459daf4be1',
		'0x08b4f0ddd7f3fc6e1c7be975703a9e195d53ded9',
		'0xabe5ce05bad2d296fe37dc7a9dbcdd7076dc8d3d',
		'0x7c8dc4d2a42a803b3d1cfcee5d927e952f2549fe',
		'0x79994f4139654aeb0aeddccbbdd57ea4f7fbbe85',
		'0xdfc89abc99f703536bafb25d35a36bc9f80ab29e',
		'0xdb27425ded02ab2192847a595ad1ede83b16ffd7',
		'0x5d70032c30c3fe986ed6dabd9cdfaf79437a9291',
		'0x5056af54a583b61ac04b654c38d78dbe682c0af8',
		'0x3fc47c783dd084ca27d031c4f909774d5044d83d',
		'0xbe8c8d3ed6f7d393c48707ac1fa2a5da61895bde',
		'0x57939e6a27f4f1c9e95b5c45bf0c5901411edb9a',
		'0xbf74768a2b93e248c3ba93da0e227caf928760b0',
		'0xb48bd02d18a26e9bd7513c51ee7272cdac64e671',
		'0xfe7cf2ec5b86e9d3a278915b7b8d228bdf4cdd9e',
		'0x8e2fdfcf9d3dac7bb4b35923581bf5645a572b7f',
		'0x2b42f05b64e992ba2eddb6bd665defd6885472e4',
		'0xf361979de815a98fb234ccc8c5b41c1327a6acfb',
		'0xf58d46e2cab159b161f3335a975f97d3818c74d6',
		'0x43d25ebf5a9a5e882642dbcbc194a171d1ed4648',
		'0xef631e608a52e669f14bd6066b2ee6d9237abe69',
		'0x8dd78eb9d385742b80091766b538a67f9e57eb51',
		'0x1998ddb28266f3914bd0d29f6d712a2737319633',
		'0x19bfda2c2610a27dd0910539545f5be2d4b16f63',
		'0xb365f9f2fbc3ddc04e44224369051846be19f0d3',
		'0xf22afb409a0a83c94fd6498cdbed2647830f4e80',
		'0xcfd4fb60be2c39f30b78f366c1473d37c74953f8',
		'0xb77226fd8daa50207922bc1c359152d67f4f8781'
	  ]
	  const pay = [
		'34482758620689', '34482758620689',
		'34482758620689', '34482758620689',
		'34482758620689', '34482758620689',
		'34482758620689', '34482758620689',
		'34482758620689', '34482758620689',
		'34482758620689', '34482758620689',
		'34482758620689', '34482758620689',
		'34482758620689', '34482758620689',
		'34482758620689', '34482758620689',
		'34482758620689', '34482758620689',
		'34482758620689', '34482758620689',
		'34482758620689', '34482758620689',
		'34482758620689', '34482758620689',
		'34482758620689', '34482758620689',
		'34482758620689'
	  ]
	  let i = 0, j = 0
	  const kk: string[][] = []
	  wallet.forEach(n => {
		
		if (!(i % 5)) {
			
			if (i > 4) j ++
			kk[j] = []
		}
		
		kk[j].push(n)
		i++
	  })
	  logger(inspect(kk, false, 3, true))
}

test()
// testDatabase()