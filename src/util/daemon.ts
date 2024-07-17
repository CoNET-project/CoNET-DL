import {ethers} from 'ethers'
import {logger} from './logger'
import Color from 'colors/safe'
import {masterSetup} from './util'
import {inspect} from 'node:util'
import {abi as GuardianNodesV2ABI} from './GuardianNodesV2.json'


const conet_Holesky_rpc = 'https://rpc.conet.network'

import {transferPool, startTransfer} from './transferManager'

let EPOCH = 0
let transferEposh = 0
const GuardianNodes_ContractV3 = '0x453701b80324C44366B34d167D40bcE2d67D6047'

const nodesEachEPOCH = 304.41400304414003 * 2
const nodeRferralsEachEPOCH = 16.742770167427702 * 2
const CONETProvider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
const guardianSmartContract = new ethers.Contract(GuardianNodes_ContractV3, GuardianNodesV2ABI, CONETProvider)

const guardianReferrals = async (block: number) => {

	let nodes
	try {
		nodes = await guardianSmartContract.getAllIdOwnershipAndBooster()
	} catch (ex: any) {
		logger(Color.red(`nodesAirdrop guardianSmartContract.getAllIdOwnershipAndBooster() Error!`), ex.mesage)
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

	const a = {
		privateKey: masterSetup.conetFaucetAdmin2,
		walletList: _referralsAddress,
		payList: referralsBoosts.map(n =>n.toFixed(10))
	}
	transferPool.push(a)

	startTransfer()

}
const splitLength = 400

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


const guardianMining = async (block: number) => {
	let nodes
	try {
		nodes = await guardianSmartContract.getAllIdOwnershipAndBooster()
	} catch (ex: any) {
		return logger(Color.grey(`nodesAirdrop guardianSmartContract.getAllIdOwnershipAndBooster() Error! STOP `), ex.mesage)
	}
	const _nodesAddress: string[] = nodes[0].map((n: string) => n)
	const __nodesBoosts: number[] = nodes[1].map((n: BigInt) => n !== BigInt(3) ? parseInt(n.toString()) : 300)
	const _nodesBoosts: number[] = __nodesBoosts.map(n => n === 100 ? 100 : n <298 ? n + 2 : 300)

	const NFTIds = _nodesAddress.map ((n, index) => 100 + index)

	let NFTAssets: number[]
	logger(Color.gray(`nodesAirdrop total nodes = [${_nodesAddress.length}]`))
	try {
		NFTAssets = await guardianSmartContract.balanceOfBatch(_nodesAddress, NFTIds)

	} catch (ex: any) {
		return logger(Color.red(`nodesAirdrop guardianSmartContract.balanceOfBatch() Error! STOP`), ex.mesage)
	}

	const nodesAddress: string[] = []
	const nodesBoosts: number[] = []

	NFTAssets.forEach((n, index) => {
		if (n || '0x345837652d9832a8398AbACC956De27b9B2923E1'.toLowerCase() === _nodesAddress[index].toLowerCase()) {
			nodesAddress.push(_nodesAddress[index])
			nodesBoosts.push(_nodesBoosts[index])
		} else {
			//logger(Color.red(`nodesAddress [${_nodesAddress[index]}] has no NFT ${NFTIds[index]}`))
		}
	})

	logger(Color.gray(`nodesAirdrop total has NFT nodes = [${nodesAddress.length}] nodesBoosts = ${nodesBoosts.length} `))
	
	let totalBoosts = 0
	nodesBoosts.forEach(n => totalBoosts += n)
	const eachBoostToken = nodesEachEPOCH/totalBoosts
	logger(Color.grey(`nodesAirdrop total boost [${totalBoosts}] eachBoostToken = ${eachBoostToken}`))

	const payNodes: string[] = nodesBoosts.map (n => (n*eachBoostToken).toFixed(10))
	let total = 0
	payNodes.forEach(n => total += parseFloat(n))

	logger(Color.grey(`total pay ${total} nodesAddress.length [${nodesAddress.length}] payNodes.legth [${payNodes.length}] `))

	const yyy: Map<number, number> = new Map()
	nodesBoosts.forEach (n => {
		const kk = yyy.get(n)
		if (!kk ) {
			yyy.set (n, 1)
		} else {
			yyy.set (n, kk + 1)
		}
	})


	const kkk = nodesAddress.length
	const splitTimes = kkk < splitLength ? 1 : Math.round(kkk/splitLength)
	const splitBase =  Math.round(kkk/splitTimes)
	const dArray: string[][] = []
	const payArray: string[][] = []


	for (let i = 0, j = 0; i < kkk; i += splitBase, j ++) {
		const a  = nodesAddress.slice(i, i+ splitBase)
		const b = payNodes.slice(i, i+ splitBase)
		dArray[j] = a
		payArray[j] = b
	}

	if (masterSetup.conetFaucetAdmin.length < dArray.length ) {
		return logger(Color.red(` masterSetup.conetFaucetAdmin.length [${masterSetup.conetFaucetAdmin.length}] < dArray.length [${dArray.length}] Error! Stop startTransfer !`),'\n')
	}
	let ss = 0
	dArray.forEach((n, index) => {

		transferPool.push({
			privateKey: masterSetup.conetFaucetAdmin[index],
			walletList: n,
			payList: payArray[ss]
		})
		ss ++
	})

	// transferPool.push({
	// 	privateKey: masterSetup.conetFaucetAdmin2,
	// 	walletList: nodesAddress,
	// 	payList: payNodes
	// })
	
	startTransfer()
	
}



const startListeningCONET_Holesky_EPOCH = async () => {
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	EPOCH = await provideCONET.getBlockNumber()
	transferEposh = EPOCH -3

	logger(Color.magenta(`startListeningCONET_Holesky_EPOCH [${EPOCH}] start!`))
	provideCONET.on('block', async block => {
		if (block <= EPOCH) {
			return logger(Color.red(`startListeningCONET_Holesky_EPOCH got Event ${block} < EPOCH ${EPOCH} Error! STOP!`))
		}
		EPOCH = block
		return startDaemonProcess(parseInt(block.toString()))
	})
	
}

const startDaemonProcess = async (block: number) => {
	console.log('')
	guardianMining(block)
	guardianReferrals(block)
	
}

startListeningCONET_Holesky_EPOCH()