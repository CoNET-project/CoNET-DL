import {ethers} from 'ethers'
import {logger} from './logger'
import Color from 'colors/safe'
import {masterSetup} from './util'
import {inspect} from 'node:util'
import GuardianNodesV2ABI from './GuardianNodesV2.json'

import CNTP_Transfer_Manager from './CNTP_Transfer_pool'

let EPOCH = 0
let transferEposh = 0
const newGuardianNodes_ContractV4 = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'
const conet_Holesky_rpc = 'https://rpc.conet.network'

const nodesEachEPOCH = 304.41400304414003
const nodeRferralsEachEPOCH = 16.742770167427702
const CONETProvider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
const guardianSmartContract = new ethers.Contract(newGuardianNodes_ContractV4, GuardianNodesV2ABI, CONETProvider)

const guardianReferrals = async (block: number) => {

	let nodes
	try {
		nodes = await guardianSmartContract.getAllIdOwnershipAndBooster()
	} catch (ex: any) {
		return logger(Color.red(`nodesAirdrop guardianSmartContract.getAllIdOwnershipAndBooster() Error!`), ex.mesage)
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

	CNTP_Transfer_guardianReferrals.addToPool(_referralsAddress, referralsBoosts)


}
const splitLength = 500

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

let init = false

const guardianMining = async (block: number) => {
	let nodes
	try {
		nodes = await guardianSmartContract.getAllIdOwnershipAndBooster()
	} catch (ex: any) {
		return logger(Color.grey(`nodesAirdrop guardianSmartContract.getAllIdOwnershipAndBooster() Error! STOP `), ex.mesage)
	}
	
	const filterWallet = '0xa1A1F55591a3716f126571b9643d084731909DF6'.toLowerCase()
	const node0: string[] = nodes[0].map((n: string) => n)
	const node1: BigInt[] = nodes[1].map((n: BigInt) => n)

	node1[869] = node1[868]=node1[864]
	
	node0.splice(864,2)
	node1.splice(864,2)
	
	
	const _nodesAddress: string[] = node0.map((n: string) => n)
	const __nodesBoosts: number[] = node1.map((n: BigInt) => n !== BigInt(3) ? parseInt(n.toString()) : 300)
	const _nodesBoosts: number[] = __nodesBoosts.map(n => n === 100 ? 100 : n <298 ? n + 2 : 300)

	const NFTIds = _nodesAddress.map ((n, index) => 100 + index)

	let NFTAssets: number[]

	logger(Color.gray(`nodesAirdrop total nodes = [${_nodesAddress.length}]`))
	// try {
	// 	NFTAssets = await guardianSmartContract.balanceOfBatch(_nodesAddress, NFTIds)

	// } catch (ex: any) {
	// 	return logger(Color.red(`nodesAirdrop guardianSmartContract.balanceOfBatch() Error! STOP`), ex.mesage)
	// }
	const nodesAddress = _nodesAddress
	const nodesBoosts: number[] = _nodesBoosts

	// NFTAssets.forEach((n, index) => {
	// 	nodesAddress.push(_nodesAddress[index])
	// 	nodesBoosts.push(_nodesBoosts[index])
	// })

	logger(Color.gray(`nodesAirdrop total has NFT nodes = [${nodesAddress.length}] nodesBoosts = ${nodesBoosts.length} `))
	
	let totalBoosts = 0
	nodesBoosts.forEach(n => totalBoosts += n)
	const eachBoostToken = nodesEachEPOCH/totalBoosts
	logger(Color.grey(`nodesAirdrop total boost [${totalBoosts}] eachBoostToken = ${eachBoostToken}`))

	const payNodes: number[] = nodesBoosts.map (n =>n*eachBoostToken)
	let total = 0
	payNodes.forEach(n => total += n)

	logger(Color.grey(`total pay ${total} nodesAddress.length [${nodesAddress.length}] payNodes.legth [${payNodes.length}] `))

	CNTP_Transfer_guardianMining.addToPool(nodesAddress, payNodes)

}

const CNTP_Transfer_guardianMining = new CNTP_Transfer_Manager([masterSetup.guardianAmin[4]], 1000)
const CNTP_Transfer_guardianReferrals = new CNTP_Transfer_Manager(masterSetup.guardianReferralAdmin, 1000)

const startListeningCONET_Holesky_EPOCH = async () => {
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	EPOCH = await provideCONET.getBlockNumber()

	transferEposh = EPOCH -3

	logger(Color.magenta(`startListeningCONET_Holesky_EPOCH [${EPOCH}] start!`))
	provideCONET.on('block', async block => {
		if (block === EPOCH + 1) {
			EPOCH ++
			return startDaemonProcess(parseInt(block))
		}
	})
	
}

const startDaemonProcess = async (block: number) => {
	console.log('\n\n')
	guardianMining(block)
	guardianReferrals(block)
	
}

startListeningCONET_Holesky_EPOCH()