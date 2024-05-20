import {ethers} from 'ethers'
import {inspect} from 'node:util'
import type { RequestOptions } from 'node:http'
import {request} from 'node:http'
import {GuardianNodes_ContractV2, masterSetup, cCNTP_Contract, conet_Referral_contractV2, mergeTransfersv1} from './util'
import {abi as GuardianNodesV2ABI} from './GuardianNodesV2.json'
import Color from 'colors/safe'
import {getMinerCount, storeLeaderboardGuardians_referrals, storeLeaderboardFree_referrals} from '../endpoint/help-database'
import { mapLimit} from 'async'
import {transferPool, startTransfer} from './transferManager'
import { logger } from './logger'
interface leaderboard {
	wallet: string
	referrals: string
	cntpRate: string
}

interface walletCount {
	cntp: number
	count: number
}

const conet_Holesky_rpc = 'https://rpc.conet.network'
const tokensEachEPOCH = 34.72
const nodeRferralsEachEPOCH = 16.742770167427702


const getReferrer = async (address: string, callbak: (err: Error|null, data?: any) => void)=> {
	const option: RequestOptions = {
		hostname: 'localhost',
		path: `/api/wallet`,
		port: 8001,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	const postData = {
		wallet: address
	}

	const req = await request (option, res => {
		let data = ''
		res.on('data', _data => {
			data += _data
		})
		res.once('end', () => {

			try {
				const ret = JSON.parse(data)
				return callbak (null, ret)
			} catch (ex: any) {
				console.error(`getReferrer JSON.parse(data) Error!`, data)
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


const countReword = (reword: number, wallet: string, totalToken: number, callback: (data: null|{wallet: string,pay: string}) => void) => {
	return getReferrer(wallet, async (err, data: any) => {
		if (err) {
			console.error(`getReferrer return err`, err)
			return callback (null)
		}
		console.error(`getReferrer return ${inspect(data, false, 3, true)}`)
		if (data?.address !== '0x0000000000000000000000000000000000000000') {
			return callback ({ wallet: data.address, pay: (totalToken * reword).toFixed(0)})
		}
		return callback (null)
	})
}

interface returnData {
	addressList: string[]
	payList: string[]
}

const constCalculateReferralsCallback = (addressList: string[], payList: string[], CallBack: (data: returnData|null) => void) => {
	
	if (addressList.length <1) {
		return CallBack (null)
	}
	return CallBack ({addressList, payList})
	
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

const CalculateReferrals = (walletAddress: string, totalToken: number) => new Promise(resolve=> {
	let _walletAddress = walletAddress.toLowerCase()
	
	const addressList: string[] = []
	const payList: string[] = []

	return countReword(.05, _walletAddress, totalToken, data1 => {
		if (!data1) {
			console.debug(`countReword(0.5) return null data`)
			return constCalculateReferralsCallback(addressList, payList, resolve)
		}
		console.error(`countReword(0.5) return data [${inspect(data1, false, 3, true)}]`)
		addressList.push(data1.wallet)
		payList.push(data1.pay)

		return countReword(.03, data1.wallet, totalToken, data2 => {
			if (!data2) {
				console.error(`countReword(0.3) return null data!`)
				return constCalculateReferralsCallback(addressList, payList, resolve)
			}
			addressList.push(data2.wallet)
			payList.push(data2.pay)
			console.error(`countReword(0.3) return data [${inspect(data2, false, 3, true)}]`)
			return countReword(.01, data2.wallet, totalToken, data3 => {
				if (!data3) {
					return constCalculateReferralsCallback(addressList, payList, resolve)
				}
				addressList.push(data3.wallet)
				payList.push(data3.pay)
				console.error(`countReword(0.1) return data [${inspect(data3, false, 3, true)}]`)
				return constCalculateReferralsCallback(addressList, payList, resolve)
			})
		})
	})
})

const sendPaymentToPool = async (walletList: string[], payList: string[], callbak: (err?: Error)=> void) => {
	const option: RequestOptions = {
		hostname: 'localhost',
		path: `/api/pay`,
		port: 8001,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	const postData = {
		walletList, payList
	}
	const req = await request (option, res => {
		let data = ''
		res.on('data', _data => {
			data += _data
		})
		res.once('end', () => {

			try {
				const ret = JSON.parse(data)
				return callbak ()
			} catch (ex: any) {
				console.error(`getReferrer JSON.parse(data) Error!`, data)
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
	

const getFreeReferralsData = async (block: string, tableNodes: leaderboard[]) => {

	const tableCNTP = tableNodes.map(n => n)
	const tableReferrals = tableNodes.map(n => n)
	tableCNTP.sort((a, b) => parseFloat(b.cntpRate) - parseFloat(a.cntpRate))
	tableReferrals.sort((a, b) => parseInt(b.referrals) - parseInt(a.referrals))
	const finalCNTP = tableCNTP.slice(0, 10)
	const finalReferrals = tableReferrals.slice(0, 10)
	await storeLeaderboardFree_referrals(block, JSON.stringify(finalReferrals), JSON.stringify(finalCNTP), JSON.stringify(tableNodes))
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

	console.error(Color.grey(`nodesReferrals total wallet [${_referralsAddress.length}] total nodes array length [${_referralsNodes.length}] total Piece = [${totalBoostPiece}] total nodes = [${totalNodes}] eachBoostToken [nodeRferralsEachEPOCH ${nodeRferralsEachEPOCH}/(totalBoostPiece ${totalBoostPiece} * totalNodes ${totalNodes})] = [${eachBoostToken}] total payment = ${total}`))


	await getNodesReferralsData(block.toString(), _referralsAddress,_referralsNodes, referralsBoosts.map(n =>n.toFixed(10)))
	console.error(Color.grey(`nodesReferrals Success!`))
}

const stratFreeMinerReferrals = async (block: string) => {

	const data = await getMinerCount (parseInt(block))
	
	if (!data) {
		return
	}

	const minerRate =  ethers.parseEther((tokensEachEPOCH/data.count).toFixed(18))
	const minerWallets: string[] = []
	data.counts.forEach(n => {
		const kk: string[] = JSON.parse(n.wallets)
		kk.forEach(nn => {
			minerWallets.push(nn)
		})
		
	})
	const walletTotal : Map<string, walletCount> = new Map()

	console.error(Color.blue(`daemon EPOCH = [${block}]  starting! minerRate = [${ parseFloat(minerRate.toString())/10**18 }] MinerWallets length = [${minerWallets.length}]`))
	let i = 0
	mapLimit(minerWallets, 4, async (n, next) => {
		console.error(Color.grey(`mapLimit start [${n}] [${i++}]`))
		const data1: any = await CalculateReferrals(n, parseFloat(minerRate.toString()))
		const addressList: any[] = data1?.addressList
		const payList: any[] = data1?.payList
		if (addressList) {
			addressList.forEach((n, index) => {
				const kk = walletTotal.get (n)||{
					cntp: 0,
					count: 0
				}
				kk.cntp = parseFloat(payList[index])+ kk.cntp
				++ kk.count
				walletTotal.set(n, kk)
				
			})

		}
		
	}, async () => {
		
		console.error(Color.blue(`stratFreeMinerReferrals Finished walletTotal [${walletTotal.size}]!`))
		const walletList: string[] = []
		const payList: string[] = []
		const countList: leaderboard[] = []
		walletTotal.forEach((n, key) => {
			walletList.push(key)
			payList.push(ethers.formatEther(n.cntp.toFixed(0)))
			countList.push({
				wallet: key,
				cntpRate: ethers.formatEther((n.cntp/12).toFixed(0)),
				referrals: n.count.toString()
			})
		})
		// logger(Color.magenta(` Pre finished doEpoch [${epoch}] `))
		// await getFreeReferralsData (block, countList)
		// sendPaymentToPool (walletList, payList, () => {
			logger()
		// })
	
		logger(Color.magenta(`Finished doEpoch [${epoch}] `))
		
	})
	
}

let epoch = ''

const [,,...args] = process.argv
args.forEach ((n, index ) => {
	if (/^epoch\=/i.test(n)) {
		epoch = n.split('=')[1]
	}
})

if (epoch) {
	logger(Color.magenta(`Start doEpoch [${epoch}] `))
	stratFreeMinerReferrals(epoch)
	guardianReferrals(epoch)
} else {
	console.error(`wallet ${epoch} Error!`)
}