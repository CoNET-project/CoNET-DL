import {ethers} from 'ethers'

import type { RequestOptions } from 'node:http'
import {request} from 'node:http'
import {masterSetup, storageIPFS, storageIPFS1} from './util'
import Color from 'colors/safe'
import { mapLimit} from 'async'
import { logger } from './logger'
import { join } from 'node:path'
import {readFile} from 'node:fs/promises'
import CNTP_Transfer_Manager from './CNTP_Transfer_pool'
import {inspect} from 'node:util'

const conet_Holesky_RPC = 'https://rpc.conet.network'
const provider = new ethers.JsonRpcProvider(conet_Holesky_RPC)

interface leaderboard {
	wallet: string
	referrals: string
	cntpRate: string
}

interface walletCount {
	cntp: number
	count: number
}

const tokensEachEPOCH = 34.72


const store_Leaderboard_Free_referrals = async (epoch: string, data: {referrals: leaderboard[], cntp: leaderboard[], totalMiner: string, minerRate: string}) => {

	const obj = {
		data: JSON.stringify(data),
		hash: `${epoch}_free`
	}
	await Promise.all([
		storageIPFS(obj, masterSetup.conetFaucetAdmin[0]),
		storageIPFS1(obj, masterSetup.conetFaucetAdmin[0])
	])
	
}


const getReferrer = async (address: string, callbak: (err: Error|null, data?: any) => void)=> {
	if (!address) {
		const err = `Call getReferrer address null error!`
		console.error(Color.red(err))
		return callbak (new Error(err))
	}
	const option: RequestOptions = {
		hostname: 'localhost',
		path: `/api/wallet`,
		port: 8002,
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
				console.error(`doEpoch/getReferrer JSON.parse(data) Error!`, data)
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


const CalculateReferrals = (walletAddress: string, totalToken: number) => new Promise(resolve=> {
	let _walletAddress = walletAddress.toLowerCase()
	
	const addressList: string[] = []
	const payList: string[] = []

	return countReword(.05, _walletAddress, totalToken, data1 => {
		if (!data1) {
			return constCalculateReferralsCallback(addressList, payList, resolve)
		}
		//console.error(`countReword(0.5) return data [${inspect(data1, false, 3, true)}]`)
		addressList.push(data1.wallet)
		payList.push(data1.pay)

		return countReword(.03, data1.wallet, totalToken, data2 => {
			if (!data2) {
				return constCalculateReferralsCallback(addressList, payList, resolve)
			}
			addressList.push(data2.wallet)
			payList.push(data2.pay)
			//console.error(`countReword(0.3) return data [${inspect(data2, false, 3, true)}]`)
			return countReword(.01, data2.wallet, totalToken, data3 => {
				if (!data3) {
					return constCalculateReferralsCallback(addressList, payList, resolve)
				}
				addressList.push(data3.wallet)
				payList.push(data3.pay)
				//console.error(`countReword(0.1) return data [${inspect(data3, false, 3, true)}]`)
				return constCalculateReferralsCallback(addressList, payList, resolve)
			})
		})
	})
})

const sendPaymentToPool = async (totalMiner: string, walletList: string[], payList: string[], callbak: (err?: Error)=> void) => {
	const option: RequestOptions = {
		hostname: 'localhost',
		path: `/api/pay`,
		port: 8002,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	
	const postData = {
		walletList, payList, totalMiner
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
				console.error(`POST /api/pay got response JSON.parse(data) Error!`, data)
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
	
const getFreeReferralsData = async (block: string, tableNodes: leaderboard[], totalMiner: string, minerRate: string) => {

	const tableCNTP = tableNodes.map(n => n)
	const tableReferrals = tableNodes.map(n => n)
	tableCNTP.sort((a, b) => parseFloat(b.cntpRate) - parseFloat(a.cntpRate))
	tableReferrals.sort((a, b) => parseInt(b.referrals) - parseInt(a.referrals))
	const finalReferrals = tableReferrals.slice(0, 10)

	await store_Leaderboard_Free_referrals ( block, {referrals:finalReferrals, cntp: tableCNTP, totalMiner, minerRate } )

	
	//await storeLeaderboardFree_referrals(block, JSON.stringify(finalReferrals), JSON.stringify(finalCNTP), JSON.stringify(tableNodes))
	
}

const localIPFS_path = '/home/peter/.data/v2/'

const getLocalIPFS = async (block: string) => {
	const path1 = join(localIPFS_path, `${block}.wallet`)
	const path2 = join(localIPFS_path, `${block}.total`)
	logger(Color.blue(`getLocalIPFS [${path1}] [${path2}]`))
	const [total, wallet] = await Promise.all([
		readFile(path2, 'utf8'),
		readFile(path1, 'utf8')
	])

	return {total, wallet}
}


const stratFreeMinerReferrals = async (block: string) => {
	const _data = await getLocalIPFS (block.toString())
	
	let walletArray: string[]
	let total: ITotal
	
	try{
		total = JSON.parse(_data.total)
		walletArray = JSON.parse(_data.wallet)
	} catch (ex) {
		logger(inspect(_data, false, 3, true))
		return logger(Color.red(`stratFreeMinerReferrals free_wallets_${block} JSON parse Error!`))
	}
	
	if (!walletArray.length) {
		logger(inspect(walletArray, false, 3, true))
		logger(inspect(total, false, 3, true))
		return logger(Color.red(`stratFreeMinerReferrals free_wallets_${block} Arraay is empty!`))
	}

	const minerRate =  ethers.parseEther((tokensEachEPOCH/walletArray.length).toFixed(18))
	
	const walletTotal : Map<string, walletCount> = new Map()

	console.error(Color.blue(`daemon EPOCH = [${block}] starting! minerRate = [${ parseFloat(minerRate.toString())/10**18 }] MinerWallets length = [${walletArray.length}]`))

	mapLimit( walletArray, 2, async (n, next) => {
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
		
		
		const walletList: string[] = []
		const payList: number[] = []
		const countList: leaderboard[] = []
		walletTotal.forEach((n, key) => {
			walletList.push(key)
			payList.push(parseFloat(ethers.formatEther(n.cntp.toFixed(0))))
			countList.push({
				wallet: key,
				cntpRate: ethers.formatEther((n.cntp/12).toFixed(0)),
				referrals: n.count.toString()
			})
		})
		console.error(Color.blue(`stratFreeMinerReferrals Finished walletTotal [${walletTotal.size}] payList [${payList.slice(0,10)}]!`))
		CNTP_Transfer_Manager_freemining.addToPool(walletList, payList)
		await getFreeReferralsData (block, countList, walletArray.length.toString(), (parseFloat(minerRate.toString())/10**18).toFixed(10))

		// sendPaymentToPool (walletArray.length.toString(), walletList, payList, () => {
		// 	logger(Color.magenta(`stratFreeMinerReferrals Finshed Epoch [${epoch}] `))
		// })
		
		
	})
	
}


let EPOCH = 0

const startListeningCONET_Holesky_EPOCH_v2 = async () => {
	EPOCH = await provider.getBlockNumber()
	provider.on('block', async (_block: number) => {
		if (_block === EPOCH + 1) {
			stratFreeMinerReferrals((_block - 2).toString())
			EPOCH ++
		}
	})

}

const CNTP_Transfer_Manager_freemining = new CNTP_Transfer_Manager([masterSetup.conetFaucetAdmin_1[1]], 1000)
startListeningCONET_Holesky_EPOCH_v2()
