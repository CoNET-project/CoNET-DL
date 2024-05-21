import {selectLeaderboardEpoch, storeLeaderboardGuardians_referralsV1, testInsert} from './help-database'

const test = async () => {
	// await testInsert()
	await selectLeaderboardEpoch ('573893')
}

test()