import { logger } from '../util/logger'
import {selectLeaderboardEpoch, storeLeaderboardGuardians_referralsV1, testInsert, selectLeaderboard} from './help-database'
import {inspect} from 'node:util'

const test = async () => {
	// await testInsert()
	// await selectLeaderboardEpoch ('573893')
	const kkk = await selectLeaderboard()
	logger(inspect(kkk, false, 3, true))
}

test()