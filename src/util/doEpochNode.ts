import {ethers} from 'ethers'
import {inspect} from 'node:util'
import {masterSetup, storageWalletProfile, s3fsPasswd} from './util'
import {abi as GuardianNodesV2ABI} from './GuardianNodesV2.json'
import Color from 'colors/safe'
import type { RequestOptions } from 'node:http'
import { logger } from './logger'
import { Client, auth, types } from 'cassandra-driver'
import type { TLSSocketOptions } from 'node:tls'
import {request} from 'node:http'

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


let s3Pass: s3pass | null
const store_Leaderboard_Free_referrals_toS3 = async (epoch: string, data: {referrals: leaderboard[], cntp: leaderboard[], referrals_rate_list: leaderboard[]}) => {
	if (!s3Pass) {
		return logger(Color.red(`store_Leaderboard_Free_referrals_toS3 s3Pass NULL error!`))
	}
	const obj = {
		data: JSON.stringify(data),
		hash: `${epoch}_node`
	}
	await storageWalletProfile(obj, s3Pass)
}

const getNodesReferralsData = async (block: string, totalNodes: string, wallets: string[], nodes: string[], payList: string[]) => {
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
	postReferrals (totalNodes, block, async () => {
		await store_Leaderboard_Free_referrals_toS3(block, {cntp: finalCNTP, referrals: finalReferrals, referrals_rate_list: tableNodes})
	})
	// await storeLeaderboardGuardians_referralsv2(block, JSON.stringify(finalReferrals), JSON.stringify(finalCNTP), JSON.stringify(tableNodes))
	
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

const postReferrals = async (totalNodes: string, epoch: string, callbak: (err: Error|null, data?: any) => void)=> {

	const option: RequestOptions = {
		hostname: 'localhost',
		path: `/api/guardians-data`,
		port: 8001,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	const postData = {
		epoch, totalNodes
	}

	const req = await request (option, res => {
		let data = ''
		res.on('data', _data => {
			data += _data
		})
		res.once('end', () => {

			try {
				
				return callbak (null)
			} catch (ex: any) {
				console.error(`POST /api/guardians-data got response JSON.parse(data) Error!`, data)
				return callbak (ex)
			}
			
		})
	})

	req.once('error', (e) => {
		console.error(`getReferrer req on Error! ${e.message}`)
		return callbak (e)
	})

	req.write(JSON.stringify(postData))
	req.end()
}

const GuardianNodes_ContractV3 = '0x453701b80324C44366B34d167D40bcE2d67D6047'

const guardianReferrals = async (block: string) => {
	const CONETProvider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const guardianSmartContract = new ethers.Contract(GuardianNodes_ContractV3, GuardianNodesV2ABI, CONETProvider)
	let nodes
	try {
		nodes = await guardianSmartContract.getAllIdOwnershipAndBooster()
	} catch (ex: any) {
		return console.error(Color.red(`guardianReferrals guardianSmartContract.getAllIdOwnershipAndBooster() Error!`), ex.mesage)
	}
	
	const _nodesAddress: string[] = nodes[0].map((n: string) => n)
	const referralsAddress: string[] = nodes[2].map((n: string) => n)
	const referralsBoost: string []= nodes[3].map((n: string) => n.toString())
	
	const [_referralsAddress, _referralsNodes] = mergeReferrals(referralsAddress, referralsBoost)
	s3Pass = await s3fsPasswd()
	let NFTAssets: number[]
	const NFTIds = _nodesAddress.map ((n, index) => 100 + index)
	try {
		NFTAssets = await guardianSmartContract.balanceOfBatch(_nodesAddress, NFTIds)

	} catch (ex: any) {
		return logger(Color.red(`nodesAirdrop guardianSmartContract.balanceOfBatch() Error! STOP`), ex.mesage)
	}
	const nodesAddress: string[] = []
	NFTAssets.forEach((n, index) => {
		if (n || '0x345837652d9832a8398AbACC956De27b9B2923E1'.toLowerCase() === _nodesAddress[index].toLowerCase()) {
			nodesAddress.push(_nodesAddress[index])
		} else {
			//logger(Color.red(`nodesAddress [${_nodesAddress[index]}] has no NFT ${NFTIds[index]}`))
		}
	})

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

	logger(Color.grey(`nodesReferrals total wallet [${_referralsAddress.length}] total nodes [${ nodesAddress.length }] [${_referralsNodes.length}] total Piece = [${totalBoostPiece}] total nodes = [${totalNodes}] eachBoostToken [nodeRferralsEachEPOCH ${nodeRferralsEachEPOCH}/(totalBoostPiece ${totalBoostPiece} * totalNodes ${totalNodes})] = [${eachBoostToken}] total payment = ${total}`))
	const kkk = referralsBoosts.map(n =>n.toFixed(10))

	getNodesReferralsData(block.toString(), nodesAddress.length.toString(), _referralsAddress, _referralsNodes, kkk)
	
	
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