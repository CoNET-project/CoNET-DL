import {selectLeaderboardEpoch, storeLeaderboardGuardians_referralsV1} from './help-database'

const test = async () => {
	await selectLeaderboardEpoch ('573893')
}

test()