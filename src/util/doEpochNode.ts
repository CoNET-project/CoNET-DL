import {ethers} from 'ethers'
import {inspect} from 'node:util'
import {GuardianNodes_ContractV2, masterSetup} from './util'
import {abi as GuardianNodesV2ABI} from './GuardianNodesV2.json'
import Color from 'colors/safe'

import { logger } from './logger'
import { Client, auth, types } from 'cassandra-driver'
import type { TLSSocketOptions } from 'node:tls'

interface leaderboard {
	wallet: string
	referrals: string
	cntpRate: string
}

const conet_Holesky_rpc = 'https://rpc.conet.network'
const nodeRferralsEachEPOCH = 16.742770167427702
const sslOptions: TLSSocketOptions = {
	key : masterSetup.Cassandra.certificate.key,
	cert : masterSetup.Cassandra.certificate.cert,
	ca : masterSetup.Cassandra.certificate.ca,
	rejectUnauthorized: masterSetup.Cassandra.certificate.rejectUnauthorized
}

const option = {
	contactPoints : masterSetup.Cassandra.databaseEndPoints,
	localDataCenter: 'dc1',
	authProvider: new auth.PlainTextAuthProvider ( masterSetup.Cassandra.auth.username, masterSetup.Cassandra.auth.password ),
	sslOptions: sslOptions,
	keyspace: masterSetup.Cassandra.keyspace,
	protocolOptions: { maxVersion: types.protocolVersion.v4 }
}

const storeLeaderboardGuardians_referralsv2 = (epoch: string, guardians_referrals: string, guardians_cntp: string, guardians_referrals_rate_list: string) => new Promise(async resolve=> {
	const cassClient = new Client (option)
	const cmd1 = `UPDATE conet_leaderboard SET guardians_referrals = '${guardians_referrals}', guardians_cntp='${guardians_cntp}',guardians_referrals_rate_list = '${guardians_referrals_rate_list}' WHERE conet = 'conet' AND epoch = '${epoch}'`
	//logger(Color.blue(`storeLeaderboardGuardians_referrals ${cmd1}`))
	try {
		cassClient.execute (cmd1)
	} catch(ex) {
		await cassClient.shutdown()
		logger(Color.red(`storeLeaderboardGuardians_referrals Error!`), ex)
		return resolve(false)
	}
	await cassClient.shutdown()
	logger(Color.magenta(`storeLeaderboardGuardians_referrals [${epoch}] finished`))
	resolve(true)
})

const storeLeaderboardGuardians_referralsV1 = (epoch: string, guardians_referrals: string, guardians_cntp: string, guardians_referrals_rate_list: string) => new Promise(async resolve=> {
	const cassClient = new Client (option)
	const cmd1 = `UPDATE conet_leaderboard_v1 SET referrals = '${guardians_referrals}', cntp='${guardians_cntp}',referrals_rate_list = '${guardians_referrals_rate_list}' WHERE conet = 'guardians' AND epoch = '${epoch}'`
	//logger(Color.blue(`storeLeaderboardGuardians_referrals ${cmd1}`))
	try {
		cassClient.execute (cmd1)
	} catch(ex) {
		await cassClient.shutdown()
		console.error(Color.red(`storeLeaderboardGuardians_referrals [${epoch}] Error!`), ex)
		return resolve(false)
	}
	await cassClient.shutdown()
	console.error(Color.magenta(`storeLeaderboardGuardians_referrals [${epoch}] finished`))
	resolve(true)
})


const getNodesReferralsData = async (block: string, wallets: string[], nodes: string[], payList: string[]) => {
	const tableNodes = wallets.map ((n, index) => {
		const ret: leaderboard = {
			wallet: n,
			cntpRate: (parseFloat(payList[index])/12).toString(),
			referrals: nodes[index]
		}
		return ret
	})
	
	const tableCNTP = tableNodes.map(n => n)
	const tableReferrals = tableNodes.map(n => n)
	tableCNTP.sort((a, b) => parseFloat(b.cntpRate) - parseFloat(a.cntpRate))
	tableReferrals.sort((a, b) => parseInt(b.referrals) - parseInt(a.referrals))
	const finalCNTP = tableCNTP.slice(0, 10)
	const finalReferrals = tableReferrals.slice(0, 10)
	// logger(inspect(finalCNTP, false, 3, true))
	// logger(inspect(finalReferrals, false, 3, true))
	
	await storeLeaderboardGuardians_referralsV1(block, JSON.stringify(finalReferrals), JSON.stringify(finalCNTP), JSON.stringify(tableNodes))
	logger(`getNodesReferralsData finished!`)
	process.abort()
}


const mergeReferrals = (walletAddr: string[], referralsBoost: string[]) => {
	const _retWalletAddr: Map<string, string> = new Map()
	const retReferralsBoost: string[] = []
	walletAddr.forEach((n, index) => {
		
		if ( n !== '0x0000000000000000000000000000000000000000') {
			_retWalletAddr.set(n, referralsBoost[index])
		}
	})
	const retWalletAddr: string[] = []
	_retWalletAddr.forEach((value, key) => {
		retWalletAddr.push (key)
		retReferralsBoost.push(value)
	})
	return [retWalletAddr, retReferralsBoost]
}

const guardianReferrals = async (block: string) => {
	const CONETProvider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const guardianSmartContract = new ethers.Contract(GuardianNodes_ContractV2, GuardianNodesV2ABI, CONETProvider)
	let nodes
	try {
		nodes = await guardianSmartContract.getAllIdOwnershipAndBooster()
	} catch (ex: any) {
		console.error(Color.red(`nodesAirdrop guardianSmartContract.getAllIdOwnershipAndBooster() Error!`), ex.mesage)
	}
	const referralsAddress: string[] = nodes[2].map((n: string) => n)
	const referralsBoost: string []= nodes[3].map((n: string) => n.toString())
	
	const [_referralsAddress, _referralsNodes] = mergeReferrals(referralsAddress, referralsBoost)

	const payReferralsBoost: number[] = _referralsNodes.map(n => {
		const nodes = parseInt(n)
		const ret = nodes < 1000 ? (nodes === 1 ? 1000 : (1000 + 2 * (nodes))) : 3000
		return ret
	})

	let totalBoostPiece = 0

	payReferralsBoost.forEach((n, index) => 
		totalBoostPiece += n * parseInt(_referralsNodes[index])
	)

	let totalNodes = 0
	_referralsNodes.forEach(n => totalNodes += parseInt(n))

	const eachBoostToken = nodeRferralsEachEPOCH/totalBoostPiece

	const referralsBoosts = payReferralsBoost.map((n, index) => n * eachBoostToken * parseInt(_referralsNodes[index]))

	let total = 0
	referralsBoosts.forEach(n => total += n)

	logger(Color.grey(`nodesReferrals total wallet [${_referralsAddress.length}] total nodes array length [${_referralsNodes.length}] total Piece = [${totalBoostPiece}] total nodes = [${totalNodes}] eachBoostToken [nodeRferralsEachEPOCH ${nodeRferralsEachEPOCH}/(totalBoostPiece ${totalBoostPiece} * totalNodes ${totalNodes})] = [${eachBoostToken}] total payment = ${total}`))
	const kkk = referralsBoosts.map(n =>n.toFixed(10))

	getNodesReferralsData(block.toString(), _referralsAddress, _referralsNodes, kkk)
	
	
}

let epoch = ''

const [,,...args] = process.argv
args.forEach ((n, index ) => {
	if (/^epoch\=/i.test(n)) {
		epoch = n.split('=')[1]
	}
})

if (epoch) {
	logger(Color.magenta(`Start doEpoch nodes [${epoch}] `))
	guardianReferrals(epoch)
} else {
	console.error(`wallet ${epoch} Error!`)
}