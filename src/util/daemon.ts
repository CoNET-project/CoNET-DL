import {ethers} from 'ethers'
import {logger} from './logger'
import Color from 'colors/safe'
import {inspect} from 'node:util'
import {series, eachSeries, eachOfSeries, eachOfLimit, eachLimit} from 'async'
import {GuardianNodes_ContractV2, masterSetup, cCNTP_Contract, conet_Referral_contractV2, mergeTransfersv1} from './util'
import {abi as GuardianNodesV2ABI} from './GuardianNodesV2.json'

import {getMinerCount, storeLeaderboard} from '../endpoint/help-database'
import {abi as CONET_Point_ABI} from './conet-point.json'
import {abi as CONET_Referral_ABI} from './conet-referral.json'
const conet_Holesky_rpc = 'https://rpc.conet.network'

import {transferPool, startTransfer} from './transferManager'

let EPOCH = 0
let transferEposh = 0
const tokensEachEPOCH = 34.72
const nodesEachEPOCH = 304.41400304414003
const nodeRferralsEachEPOCH = 16.742770167427702
const ReferralsMap: Map<string, string> = new Map()

const guardianReferrals = async (block: number) => {
	const CONETProvider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const guardianSmartContract = new ethers.Contract(GuardianNodes_ContractV2, GuardianNodesV2ABI, CONETProvider)
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

	// logger(inspect(referralsBoosts, false, 3, true))
	// logger(inspect(payReferralsBoost, false, 3, true))
	// logger(inspect(_referralsAddress, false, 3, true))

	// transferCCNTP(masterSetup.GuardianReferrals, _referralsAddress, referralsBoosts.map(n =>n.toFixed(10)), () => {
	// 	logger(Color.green(`guardianReferrals transferCCNTP success!`))
	// })


	transferPool.push({
		privateKey: masterSetup.GuardianReferrals,
		walletList: _referralsAddress,
		payList: referralsBoosts.map(n =>n.toFixed(10))
	})
	storeLeaderboard(block.toString(), '', '', '', '')
	startTransfer()
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


const guardianMining = async (block: number) => {
	const CONETProvider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const guardianSmartContract = new ethers.Contract(GuardianNodes_ContractV2, GuardianNodesV2ABI, CONETProvider)
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
	// const kkkk = payNodes.sort((a,b) => parseFloat(b) - parseFloat(a))
	// const kkkkBoost = nodesBoosts.sort((a, b) => b-a)
	logger(Color.grey(`total pay ${total} nodesAddress.length [${nodesAddress.length}] payNodes.legth [${payNodes.length}] `))
	// logger(inspect(nodesAddress, false, 3, true))
	// logger(`Max pay [${kkkk[0]}] minPay [${kkkk[kkkk.length - 1]}] MacBoost = [${kkkkBoost[0]}] minBoost =[${kkkkBoost[kkkkBoost.length - 1]}] `)
	const yyy: Map<number, number> = new Map()
	nodesBoosts.forEach (n => {
		const kk = yyy.get(n)
		if (!kk ) {
			yyy.set (n, 1)
		} else {
			yyy.set (n, kk + 1)
		}
	})
	// yyy.forEach((n,key) => {
	// 	logger(inspect({n, key}, false, 3, true))
	// })
	// logger(inspect(nodesAddress, false,3, true))
	// logger(inspect(payNodes, false,3, true))
	
	// transferCCNTP(masterSetup.GuardianAdmin, nodesAddress, payNodes, () => {
	// 	logger(Color.green(`guardianMining transferCCNTP success!`))
	// })
	logger(Color.blue(`guardianMining payList = ${payNodes[0]},${payNodes[1]},${payNodes[2]}`))
	storeLeaderboard(block.toString(), '', '', '', '')
	transferPool.push({
		privateKey: masterSetup.GuardianAdmin,
		walletList: nodesAddress,
		payList: payNodes
	})
	startTransfer()
	
}

const stratFreeMinerReferrals = async (block: number) => {
	
	const data = await getMinerCount (transferEposh+1)

	if (!data) {
		if (EPOCH - transferEposh+1 < 3 ) {
			return logger(Color.grey(`transferMiners block [${transferEposh}] didn't ready!`))
		}
		return transferEposh++
	}

	const minerRate =  ethers.parseEther((tokensEachEPOCH/data.count).toFixed(10))
	const minerWallets: string[] = []
	data.counts.forEach(n => {
		const kk: string[] = JSON.parse(n.wallets)
		kk.forEach(nn => {
			minerWallets.push(nn)
		})
		
	})
	EPOCH = block
	const addressList: string[] =[]
	const payList: string[] = []

	logger(Color.grey(`daemon EPOCH ${transferEposh+1} starting! minerRate = [${minerRate}] total miner = [${data.count}] MinerWallets length = [${minerWallets.length}]`))

	eachOfLimit(minerWallets, 5, (n, index, next) => CalculateReferrals(n, minerRate.toString(),[.05, .03, .01], [], ReferralsMap, (err, data1) => {
			if (err) {
				return logger (Color.red(`CalculateReferrals Error!`), err)
			}
			addressList.push(...data1.addressList)
			payList.push(...data1.payList)
			
			next()
			
		}), async err => {
			logger(Color.blue(`stratFreeMinerReferrals [${transferEposh+1}]finished CalculateReferrals addressList [${addressList.length!}]`))
			const referrals = mergeTransfersv1(addressList, payList)
			
			referrals.payList = referrals.payList.map(n => ethers.formatEther(parseFloat(n).toFixed(0)))
			referrals.walletList.forEach((n, index) => {
				if (n.toLowerCase() === '0x1eDF79c89b2f22d24Fc015ADeDe3d66e6A9029a4'.toLowerCase()) {
					logger(Color.green(`wallet [${n}] <== pay ${referrals.payList[index]}`))
				}
			})
			logger(Color.blue(`stratFreeMinerReferrals payList ${referrals.payList[0]},${referrals.payList[1]},${referrals.payList[2]}`))
			// transferCCNTP(masterSetup.GuardianReferralsFree, referrals.walletList, referrals.payList, () => {
			// 	logger(Color.gray(`stratFreeMinerReferrals block [${block}] success!`))
			// })
			storeLeaderboard(block.toString(), '', '', '', '')
			transferPool.push({
				privateKey: masterSetup.GuardianReferralsFree,
				walletList: referrals.walletList,
				payList: referrals.payList
			})
			startTransfer()
			transferEposh++
			
		})
	
}

const CalculateReferrals = async (walletAddress: string, totalToken: string, rewordArray: number[], checkAddressArray: string[], ReferralsMap: Map<string, string>, CallBack: (err:Error|null, data?: any) => void) => {
	let _walletAddress = walletAddress.toLowerCase()
	if (checkAddressArray.length) {
		const index = checkAddressArray.findIndex(n => n.toLowerCase() === _walletAddress)
		if (index <0) {
			return CallBack (new Error(`CalculateReferrals walletAddress [${_walletAddress}] hasn't in checkAddressArray! STOP CalculateReferrals`))
		}
	}
	
	const contract = new ethers.Contract(conet_Referral_contractV2, CONET_Referral_ABI, new ethers.JsonRpcProvider(conet_Holesky_rpc))
	
	const addressList: string[] = []
	const payList: string[] = []

	for (let i of rewordArray) {
		let address: string

		try{
			address = ReferralsMap.get(_walletAddress) || await contract.getReferrer(_walletAddress)
		} catch (ex: any) {
			logger(Color.red(`CalculateReferrals await contract.getReferrer(${_walletAddress}) Error! ${ex.message}`))
			break
		}
		
		// logger (colors.blue(`CalculateReferrals get address = [${address}]`))
		if (address === '0x0000000000000000000000000000000000000000') {
			break
		}

		ReferralsMap.set(_walletAddress, address)
		address = address.toLowerCase()
		if (checkAddressArray.length) {
			const index = checkAddressArray.findIndex(n => n.toLowerCase() === address)
			if (index< 0) {
				return CallBack(new Error(`CalculateReferrals walletAddress [${_walletAddress}'s up layer address ${address}] hasn't in checkAddressArray! STOP CalculateReferrals`))
			}
		}
		addressList.push(address)
		payList.push((parseFloat(totalToken)*i).toString())
		_walletAddress = address
	}

	return CallBack(null, {addressList, payList})
}


const startListeningCONET_Holesky_EPOCH = async () => {
	const provideCONET = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	EPOCH = await provideCONET.getBlockNumber()
	transferEposh = EPOCH + 5

	logger(Color.magenta(`startListeningCONET_Holesky_EPOCH [${EPOCH}] start!`))
	provideCONET.on('block', async block => {
		if (block <= EPOCH) {
			return logger(Color.red(`startListeningCONET_Holesky_EPOCH got Event ${block} < EPOCH ${EPOCH} Error! STOP!`))
		}
		return startDaemonProcess(parseInt(block.toString()))
	})
}

const startDaemonProcess = async (block: number) => {
	console.log('')
	stratFreeMinerReferrals(block)
	guardianMining(block)
	guardianReferrals(block)
	
}

startListeningCONET_Holesky_EPOCH()