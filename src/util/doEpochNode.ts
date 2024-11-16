import {ethers} from 'ethers'
import {inspect} from 'node:util'
import {masterSetup, storageIPFS, storageIPFS1} from './util'
import GuardianNodesV2ABI from './GuardianNodesV2.json'
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


const store_Leaderboard_Free_referrals = async (epoch: string, data: {referrals: leaderboard[], cntp: leaderboard[], referrals_rate_list: leaderboard[]}) => {

	const obj = {
		data: JSON.stringify(data),
		hash: `${epoch}_node`
	}
	logger(inspect(data, false,1, true ))
	await Promise.all([
		storageIPFS(obj, masterSetup.conetFaucetAdmin[0]),
		storageIPFS1(obj, masterSetup.conetFaucetAdmin[0])
	])
	
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
	const finalCNTP = tableCNTP
	const finalReferrals = tableReferrals
	// logger(inspect(finalCNTP, false, 3, true))`
	// logger(inspect(finalReferrals, false, 3, true))
	
	await store_Leaderboard_Free_referrals(block, {cntp: finalCNTP, referrals: finalReferrals, referrals_rate_list: tableNodes })
	
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


const GuardianNodes_ContractV3 = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'

const guardianReferrals = async (block: string) => {
	const CONETProvider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const guardianSmartContract = new ethers.Contract(GuardianNodes_ContractV3, GuardianNodesV2ABI, CONETProvider)
	let nodes
	try {
		nodes = await guardianSmartContract.getAllIdOwnershipAndBooster()
	} catch (ex: any) {
		return console.error(Color.red(`guardianReferrals guardianSmartContract.getAllIdOwnershipAndBooster() Error!`), ex.mesage)
	}
	
	const nodesAddress: string[] = nodes[0].map((n: string) => n)
	const referralsAddress: string[] = nodes[2].map((n: string) => n)
	const referralsBoost: string []= nodes[3].map((n: string) => n.toString())
	
	const [_referralsAddress, _referralsNodes] = mergeReferrals(referralsAddress, referralsBoost)

	// let NFTAssets: number[]
	// const NFTIds = _nodesAddress.map ((n, index) => 100 + index)
	// try {
	// 	NFTAssets = await guardianSmartContract.balanceOfBatch(_nodesAddress, NFTIds)

	// } catch (ex: any) {
	// 	return logger(Color.red(`nodesAirdrop guardianSmartContract.balanceOfBatch() Error! STOP`), ex.mesage)
	// }
	// const nodesAddress: string[] = _nodesAddress
	// NFTAssets.forEach((n, index) => {
	// 	if (n) {
	// 		nodesAddress.push(_nodesAddress[index])
	// 	} else {
	// 		//logger(Color.red(`nodesAddress [${_nodesAddress[index]}] has no NFT ${NFTIds[index]}`))
	// 	}
	// })

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
	// guardianReferrals(epoch)
} else {
	console.error(`wallet ${epoch} Error!`)
}