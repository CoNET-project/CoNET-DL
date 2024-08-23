import {ethers} from 'ethers'
import {logger} from './logger'
import Color from 'colors/safe'
import {masterSetup} from './util'
import {inspect} from 'node:util'
import {abi as GuardianNodesV2ABI} from './GuardianNodesV2.json'
import { initNewCONET, startEposhTransfer} from '../endpoint/utilNew'
import {mapLimit} from 'async'
const conet_Holesky_rpc = 'https://rpc.conet.network'

import {transferPool, startTransfer} from './transferManager'

let EPOCH = 0
let transferEposh = 0
const newGuardianNodes_ContractV4 = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'

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

	const a = {
		privateKey: masterSetup.guardianAmin[masterSetup.guardianAmin.length - 1],
		walletList: _referralsAddress,
		payList: referralsBoosts.map(n =>n.toFixed(10))
	}
	transferPool.push(a)

	startTransfer()

}
const splitLength = 300

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

const initNodes = (wallets: string[]) => {
	startEposhTransfer()
	let iii = 0
	mapLimit(wallets, 1, async (n, next) => {
		await initNewCONET(n)
		logger(Color.blue(`initNodes [${++iii}] for wallet ${n}`))
	}, err => {
		logger(Color.blue(`initNodes success!`))
	})
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
	if (!init) {
		init = true
		initNodes (_nodesAddress)
	}
	logger(Color.gray(`nodesAirdrop total nodes = [${_nodesAddress.length}]`))
	// try {
	// 	NFTAssets = await guardianSmartContract.balanceOfBatch(_nodesAddress, NFTIds)

	// } catch (ex: any) {
	// 	return logger(Color.red(`nodesAirdrop guardianSmartContract.balanceOfBatch() Error! STOP`), ex.mesage)
	// }

	const nodesAddress: string[] = _nodesAddress
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
	const splitBase =  Math.floor(kkk/splitTimes)
	const dArray: string[][] = []
	const payArray: string[][] = []

	

	for (let i = 0, j = 0; i < kkk; i += splitBase, j ++) {
		const a  = nodesAddress.slice(i, i+ splitBase)
		const b = payNodes.slice(i, i+ splitBase)
		dArray[j] = a
		payArray[j] = b
	}
	logger(Color.red(`Total Guardian nodes = [${kkk}] split [${dArray.length}] Each Groop has [${dArray.map(n => n.length)}] wallets`))
	
	let ss = 0
	let i = 0
	dArray.forEach((n, index) => {
		i ++
		if (i > masterSetup.guardianAmin.length-2) {
			i = 0
		}
		
		transferPool.push({
			privateKey: masterSetup.guardianAmin[i],
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
		if (block === EPOCH + 1) {
			EPOCH ++
			return startDaemonProcess(parseInt(block))
		}
	})
	
}

const startDaemonProcess = async (block: number) => {
	console.log('')
	guardianMining(block)
	guardianReferrals(block)
	
}

startListeningCONET_Holesky_EPOCH()