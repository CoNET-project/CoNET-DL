import {ethers} from 'ethers'
import {logger} from './logger'
import Color from 'colors/safe'
import {inspect} from 'node:util'
import { mapLimit} from 'async'
import {GuardianNodes_ContractV2, masterSetup, cCNTP_Contract, conet_Referral_contractV2, mergeTransfersv1} from './util'
import {abi as GuardianNodesV2ABI} from './GuardianNodesV2.json'

import {getMinerCount, storeLeaderboardGuardians_referrals, storeLeaderboardFree_referrals} from '../endpoint/help-database'
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


interface leaderboard {
	wallet: string
	referrals: string
	cntpRate: string
}

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


	// transferPool.push({
	// 	privateKey: masterSetup.GuardianReferrals,
	// 	walletList: _referralsAddress,
	// 	payList: referralsBoosts.map(n =>n.toFixed(10))
	// })
	// startTransfer()

	// const kk = {
	// 	wallet: _referralsAddress,
	// 	cntp: _referralsNodes.map(n => {
	// 		const kk = parseInt(n)
	// 		return kk === 1000 ? 1: (kk - 1000)/2 })
	// }
	

	// logger(inspect(_referralsNodes, false, 3, true))
	await getNodesReferralsData(block.toString(), _referralsAddress,_referralsNodes, referralsBoosts.map(n =>n.toFixed(10)))

	
}

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
	
	await storeLeaderboardGuardians_referrals(block, JSON.stringify(finalReferrals), JSON.stringify(finalCNTP), JSON.stringify(tableNodes))
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

let runningTransferEposh = 0
const stratFreeMinerReferrals = async (block: number) => {
	if (runningTransferEposh === transferEposh) {
		return logger(Color.magenta(`stratFreeMinerReferrals already running! STOP!`))
	}
	logger(Color.magenta(`stratFreeMinerReferrals EPOCH = [${EPOCH}] transferEposh = [${transferEposh}]`))
	runningTransferEposh = transferEposh
	const data = await getMinerCount (transferEposh)

	if (!data) {
		if (EPOCH - transferEposh < 3 ) {
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

	logger(Color.grey(`daemon EPOCH ${transferEposh} starting! minerRate = [${minerRate}] total miner = [${data.count}] MinerWallets length = [${minerWallets.length}]`))

	mapLimit(minerWallets, 10, async (n, next) => new Promise(resolve => CalculateReferrals(n, minerRate.toString(),[.05, .03, .01], [], ReferralsMap, (err, data1) => {
			if (err) {
				return logger (Color.red(`CalculateReferrals Error!`), err)
			}
			addressList.push(...data1.addressList)
			payList.push(...data1.payList)
			resolve()
		})
	), async () => {
		logger(Color.blue(`stratFreeMinerReferrals [${transferEposh}]finished CalculateReferrals addressList [${addressList.length!}]`))
		const referrals = mergeTransfersv1(addressList, payList)
		
		referrals.payList = referrals.payList.map(n => ethers.formatEther(parseFloat(n).toFixed(0)))
		
		logger(Color.blue(`stratFreeMinerReferrals payList ${referrals.payList[0]},${referrals.payList[1]},${referrals.payList[2]}`))
		// transferCCNTP(masterSetup.GuardianReferralsFree, referrals.walletList, referrals.payList, () => {
		// 	logger(Color.gray(`stratFreeMinerReferrals block [${block}] success!`))
		// })
		//storeLeaderboard((transferEposh+1).toString(), '', '', '', '')

		// transferPool.push({
		// 	privateKey: masterSetup.GuardianReferralsFree,
		// 	walletList: referrals.walletList,
		// 	payList: referrals.payList
		// })

		// startTransfer()

		
		
		await getFreeReferralsData (transferEposh.toString(), referrals.walletList, referrals.payList)
		transferEposh++
		if (EPOCH > transferEposh) {
			return stratFreeMinerReferrals(EPOCH)
		}

	})
	
}

const getFreeReferralsData = (block: string, Referrals: string[], payList: string[]) => new Promise(resolve => {
	const tableNodes = Referrals.map ((n, index) => {
		const ret: leaderboard = {
			wallet: n,
			cntpRate: (parseFloat(payList[index])/12).toString(),
			referrals: '0'
		}
		return ret
	})

	const contract = new ethers.Contract(conet_Referral_contractV2, CONET_Referral_ABI, new ethers.JsonRpcProvider(conet_Holesky_rpc))
	return mapLimit(tableNodes, 20, async (n, next) => {
		n.referrals = (await contract.getReferees (n.wallet)).length.toString()
	}, async () => {
		const tableCNTP = tableNodes.map(n => n)
		const tableReferrals = tableNodes.map(n => n)
		tableCNTP.sort((a, b) => parseFloat(b.cntpRate) - parseFloat(a.cntpRate))
		tableReferrals.sort((a, b) => parseInt(b.referrals) - parseInt(a.referrals))
		const finalCNTP = tableCNTP.slice(0, 10)
		const finalReferrals = tableReferrals.slice(0, 10)
		// logger(inspect(finalCNTP, false, 3, true))
		// logger(inspect(finalReferrals, false, 3, true))
		await storeLeaderboardFree_referrals(block, JSON.stringify(finalReferrals), JSON.stringify(finalCNTP), JSON.stringify(tableNodes))
		return resolve(true)
	})
})



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
	transferEposh = EPOCH - 3

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
	EPOCH = block
	stratFreeMinerReferrals(block)
	// guardianMining(block)
	guardianReferrals(block)
	
}

startListeningCONET_Holesky_EPOCH()