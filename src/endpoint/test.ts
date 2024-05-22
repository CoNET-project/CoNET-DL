import { logger } from '../util/logger'
import {selectLeaderboardEpoch, storeLeaderboardGuardians_referralsV1, testInsert, selectLeaderboard} from './help-database'
import {checkSignObj} from '../util/util'
import {inspect} from 'node:util'
const message =  {
	message: '{"walletAddress":"0x73940FCb2211c1c09eCeB6f42846E30Af6b459BC"}',
	signMessage: '0xb14ec93a35ff00ff3610e502dbabfb2b743e9e7b83fb307d50c0716340dd4a1b2a8a0e48d8dbae7bd04ca3b78750d7c5b54ff065839303a18ad4eb10a98ecceb1c'
}
const test = async () => {
	// await testInsert()
	// await selectLeaderboardEpoch ('573893')
	const kkk = await checkSignObj (message.message, message.signMessage)
	// const kkk = await selectLeaderboard()
	logger(inspect(kkk, false, 3, true))
}

test()