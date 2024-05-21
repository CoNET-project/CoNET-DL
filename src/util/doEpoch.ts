import {ethers} from 'ethers'
import {inspect} from 'node:util'
import type { RequestOptions } from 'node:http'
import {request} from 'node:http'
import {GuardianNodes_ContractV2, masterSetup} from './util'
import {abi as GuardianNodesV2ABI} from './GuardianNodesV2.json'
import Color from 'colors/safe'

import { mapLimit} from 'async'
import {transferPool, startTransfer} from './transferManager'
import { logger } from './logger'
import { Client, auth, types } from 'cassandra-driver'
import type { TLSSocketOptions } from 'node:tls'

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

const storeLeaderboardFree_referrals = async (epoch: string, free_referrals: string, free_cntp: string, free_referrals_rate_list: string) => {
	const cassClient = new Client (option)

	const cmd1 = `UPDATE conet_leaderboard SET free_referrals = '${free_referrals}', free_cntp = '${free_cntp}', free_referrals_rate_list = '${free_referrals_rate_list}' WHERE conet = 'conet' AND epoch = '${epoch}'`
		
		try {
			cassClient.execute (cmd1)
		} catch(ex) {
			logger(`storeLeaderboardFree_referrals Error`, ex)
			await cassClient.shutdown()
			return false
		}
		await cassClient.shutdown()
		logger(Color.magenta(`storeLeaderboard Free_referrals [${epoch}] success!`))
		return true
}

const getEpochNodeMiners = async (epoch: string) => {
	const cassClient = new Client (option)
	const cmd3 = `SELECT * FROM conet_free_mining_cluster WHERE epoch = '${epoch}'`
	let miners
	try{
		miners = await cassClient.execute (cmd3)
	} catch (ex) {
		logger (Color.red(`getEpochNodeMiners error`), ex)
	}
	await cassClient.shutdown()
	return miners?.rows
	
}

const getApiNodes: () => Promise<number> = async () => new Promise(async resolve=> {

	const cassClient = new Client (option)
	const cmd = `SELECT ipaddress from conet_api_node`

	try {
		const uu = await cassClient.execute (cmd)
		await cassClient.shutdown()
		return resolve(uu.rows.length)
	} catch(ex) {
		await cassClient.shutdown()
		return resolve (6)
	}
})
let clusterNodes = 9
const getMinerCount = async (_epoch: number) => {
	let count = 0
	const epoch = (_epoch).toString()
	
	const counts = await getEpochNodeMiners(epoch)
	clusterNodes = await getApiNodes()
	if (!counts) {
		logger(Color.red(`getMinerCount got empty array`))
		return null
	}

	if (counts.length < clusterNodes) {
		logger(Color.magenta(`getMinerCount getEpochNodeMiners [${_epoch}] data.length [${counts.length}] < clusterNodes [${clusterNodes}]`))
		return null
	}
	counts.forEach(n => {
		count += n.miner_count
	})
	return {count, counts}
	
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
const postReferrals = async (cntp: string, referrals: string, referrals_rate_list: string, epoch: string, callbak: (err: Error|null, data?: any) => void)=> {

	const option: RequestOptions = {
		hostname: 'localhost',
		path: `/api/free-data`,
		port: 8001,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	const postData = {
		cntp, referrals, referrals_rate_list, epoch
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
	await postReferrals(JSON.stringify(finalCNTP), JSON.stringify(finalReferrals), JSON.stringify(tableNodes), block, err => {
		logger(Color.gray(`getFreeReferralsData finished!`))
	})
	//await storeLeaderboardFree_referrals(block, JSON.stringify(finalReferrals), JSON.stringify(finalCNTP), JSON.stringify(tableNodes))
	
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
	mapLimit(minerWallets, 2, async (n, next) => {
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
		
		await getFreeReferralsData (block, countList)
		logger(Color.magenta(`Pre finished doEpoch [${epoch}] `))
		sendPaymentToPool (walletList, payList, () => {
			logger(Color.magenta(`Finished doEpoch [${epoch}] `))
		})
		
		
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
} else {
	console.error(`wallet ${epoch} Error!`)
}